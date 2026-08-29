import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { createDomainStore } from '../src/domain/store.ts'

const checkout = new URL('..', import.meta.url)
const directory = await mkdtemp(join(tmpdir(), 'omni-orga-ui-goals-'))
const port = await unusedPort()
const url = `http://127.0.0.1:${port}`
const databasePath = join(directory, 'omni-orga.sqlite')
const env = {
  ...process.env,
  OMNI_ORGA_TEST: '1',
  OMNI_ORGA_PORT: String(port),
  OMNI_ORGA_RUNTIME_DIR: join(directory, 'runtime'),
  OMNI_ORGA_DATABASE_PATH: databasePath,
}

function runLifecycle(command) {
  return spawnSync(process.execPath, ['scripts/lifecycle.mjs', command], {
    cwd: checkout,
    encoding: 'utf8',
    env,
    timeout: 30_000,
  })
}

async function unusedPort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return port
}

// Rendered row anchor for a goal title; the dehydrated loader payload also
// embeds raw titles, so assertions must target the rendered markup.
function goalRow(title) {
  return new RegExp(`goal-name[^>]*>${title}</a>`)
}

let fixture

before(() => {
  const started = runLifecycle('start')
  assert.equal(started.status, 0, started.stderr)

  const store = createDomainStore(databasePath)
  const gWork = store.createGoal({ title: 'Steady work', kind: 'ongoing' })
  store.setGoalPriority(gWork.id, true)
  const gAdmin = store.createGoal({
    title: 'Admin',
    kind: 'one_shot',
    parentId: gWork.id,
  })
  const gHome = store.createGoal({ title: 'Home basics', kind: 'ongoing' })
  const gEmpty = store.createGoal({ title: 'Quiet goal', kind: 'ongoing' })
  const gOld = store.createGoal({ title: 'Old project', kind: 'one_shot' })
  store.archiveGoal(gOld.id)

  // One-shot fixture: 2 of 3 linked tasks complete -> "2 of 3 · 66%".
  const tax = store.createTask({
    title: 'File the tax return',
    goalIds: [gAdmin.id],
  })
  store.createTask({ title: 'List the deductions', goalIds: [gAdmin.id] })
  const insurance = store.createTask({
    title: 'Send the insurance form',
    goalIds: [gAdmin.id],
  })
  store.completeTask(insurance.id, '2026-08-20T08:00:00.000Z')
  store.completeTask(tax.id, '2026-08-21T08:00:00.000Z')

  // Ongoing fixture: 2 completed linked tasks -> "2 done".
  const paint = store.createTask({
    title: 'Paint the walls',
    goalIds: [gHome.id],
  })
  const dentist = store.createTask({
    title: 'Book a dentist appointment',
    goalIds: [gHome.id],
  })
  store.completeTask(paint.id, '2026-08-22T08:00:00.000Z')
  store.completeTask(dentist.id, '2026-08-23T08:00:00.000Z')

  // A blocked linked task for the status column.
  const errands = store.createTask({
    title: 'Run the errands',
    goalIds: [gHome.id],
  })
  store.createTask({
    title: 'Blocked errand',
    parentId: errands.id,
  })

  store.close()
  fixture = { gAdmin, gEmpty, gHome, gOld, gWork }
})

after(() => {
  runLifecycle('stop')
})

async function render(path) {
  const response = await fetch(`${url}${path}`)
  assert.equal(response.status, 200, path)
  return response.text()
}

test('tree renders two levels with subgoals nested under their parent', async () => {
  const html = await render('/goals')

  assert.match(html, /<h1[^>]*>Goals<\/h1>/)
  assert.match(html, goalRow('Steady work'))
  assert.match(html, goalRow('Home basics'))
  assert.match(html, goalRow('Quiet goal'))

  // The subgoal row is nested inside the parent's subgoal list.
  const workIndex = html.indexOf('Steady work')
  const subsIndex = html.indexOf('goal-subgoals', workIndex)
  const adminIndex = html.indexOf('>Admin</a>', subsIndex)
  const homeIndex = html.indexOf('Home basics', workIndex + 1)
  assert.ok(subsIndex > workIndex, 'subgoal list follows the parent row')
  assert.ok(adminIndex > subsIndex, 'subgoal row renders inside the list')
  assert.ok(homeIndex > adminIndex, 'sibling top-level goal follows the tree')

  // No third level exists in the markup.
  assert.doesNotMatch(html, /goal-subgoals[\s\S]*goal-subgoals/)
})

test('rows show priority marks, factual progress, and one-shot bars', async () => {
  const html = await render('/goals')

  // Priority mark is a labelled flag icon, not color alone.
  assert.match(html, /aria-label="Priority goal"/)
  // Priority toggle reflects state without relying on color.
  assert.match(html, /aria-pressed="true"[^>]*aria-label="Priority"|aria-label="Priority"[^>]*aria-pressed="true"/)

  // One-shot: thin bar + "n of m · p%".
  assert.match(html, /goal-bar[^>]*><span style="width:66%"/)
  assert.match(html, /2 of 3 · 66%/)
  // Ongoing: text only.
  assert.match(html, /2 done/)
  // No linked tasks.
  assert.match(html, /No tasks yet/)
  // No type labels in rows.
  assert.doesNotMatch(html, /One-shot goal/)
})

test('tree rows keep the quiet actions and expand control server-rendered', async () => {
  const html = await render('/goals')

  assert.match(
    html,
    /aria-expanded="true"[^>]*aria-label="Collapse Steady work"|aria-label="Collapse Steady work"[^>]*aria-expanded="true"/,
  )
  assert.match(html, /aria-label="Move to another place in the hierarchy"/)
  assert.match(html, /aria-label="Archive"/)
  assert.match(html, /View tasks/)
  assert.match(html, /Add goal/)
  assert.match(html, /aria-label="Show active or archived goals"/)
})

test('goal page shows type label, progress, subgoals, and linked tasks', async () => {
  const html = await render(`/goals/${fixture.gWork.id}`)

  assert.match(html, /<h1[^>]*>Steady work<\/h1>/)
  assert.match(html, /Ongoing goal/)
  assert.match(html, /goal-sub-name[^>]*>Admin</)
  assert.match(html, /Open in Tasks/)
  assert.match(html, new RegExp(`href="/tasks\\?goal=${fixture.gWork.id}"`))
})

test('one-shot goal page shows bar, percentage, and task statuses', async () => {
  const html = await render(`/goals/${fixture.gAdmin.id}`)

  assert.match(html, /<h1[^>]*>Admin<\/h1>/)
  assert.match(html, /One-shot goal/)
  assert.match(html, /2 of 3 · 66%/)
  assert.match(html, /goal-bar[^>]*><span style="width:66%"/)
  assert.match(html, /Complete goal/)
  assert.match(html, /Delete…/)
  assert.match(html, /Archive/)
  // Linked task statuses use factual words.
  assert.match(html, /Available/)
  assert.match(html, /Done/)
})
test('goal page without linked tasks stays factual', async () => {
  const html = await render(`/goals/${fixture.gEmpty.id}`)

  assert.match(html, /No linked tasks yet/)
  assert.match(html, /Open in Tasks/)
  assert.match(html, /No tasks yet/)
})

test('unknown goals keep the factual not-found state', async () => {
  const html = await render('/goals/g_missing')

  assert.match(html, /<h1[^>]*>Goal not found<\/h1>/)
  assert.match(html, /This goal does not exist\./)
  assert.match(html, /href="\/goals"[^>]*>Goals</)
})
