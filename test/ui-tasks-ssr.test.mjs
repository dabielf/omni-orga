import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { createDomainStore } from '../src/domain/store.ts'

const checkout = new URL('..', import.meta.url)
const directory = await mkdtemp(join(tmpdir(), 'omni-orga-ui-tasks-'))
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

const today = new Date(
  Date.now() - new Date().getTimezoneOffset() * 60_000,
).toISOString().slice(0, 10)

// Rendered row anchor for a task title; the dehydrated loader payload also
// embeds raw titles, so assertions must target the rendered markup.
function row(title) {
  return new RegExp(`task-name[^>]*>${title}</a>`)
}

let fixture

before(() => {
  const started = runLifecycle('start')
  assert.equal(started.status, 0, started.stderr)

  const store = createDomainStore(databasePath)
  const gWork = store.createGoal({ title: 'Steady work', kind: 'ongoing' })
  store.setGoalPriority(gWork.id, true)
  const gHome = store.createGoal({ title: 'Home basics', kind: 'ongoing' })
  const gAdmin = store.createGoal({
    title: 'Admin',
    kind: 'one_shot',
    parentId: gWork.id,
  })
  const gEmpty = store.createGoal({ title: 'Quiet goal', kind: 'ongoing' })

  const tax = store.createTask({
    title: 'File the tax return',
    goalIds: [gAdmin.id],
    deadline: '2026-09-15',
  })
  const paint = store.createTask({
    title: 'Paint the walls',
    goalIds: [gHome.id],
  })
  store.createTask({ title: 'Move the furniture out', parentId: paint.id })
  const dentist = store.createTask({
    title: 'Book a dentist appointment',
    idealCompletionDate: today,
  })
  const trip = store.createTask({ title: 'Plan the trip' })
  store.createTask({
    title: 'Price flights',
    parentId: trip.id,
    idealCompletionDate: today,
  })
  const garden = store.createTask({
    title: 'Water the garden',
    scheduledDay: new Date(
      Date.now() + 86_400_000 - new Date().getTimezoneOffset() * 60_000,
    ).toISOString().slice(0, 10),
  })
  const water = store.createTask({ title: 'Water the plants', repeatable: true })
  store.completeTask(water.id)
  const insurance = store.createTask({ title: 'Send the insurance form' })
  store.completeTask(insurance.id)
  const phones = store.createTask({ title: 'Compare phone plans' })
  store.archiveTask(phones.id)

  store.close()
  fixture = { gAdmin, gEmpty, paint, tax }
})

after(() => {
  runLifecycle('stop')
})

async function render(path) {
  const response = await fetch(`${url}${path}`)
  assert.equal(response.status, 200, path)
  return response.text()
}

test('all tasks view shows active trees, states, counts and meta', async () => {
  const html = await render('/tasks')

  // Rail shows every view and the goal tree.
  for (const label of [
    '>All tasks<',
    '>Priority goals<',
    '>No goal<',
    '>Steady work<',
    '>Home basics<',
    '>Completed<',
    '>Archived<',
  ]) {
    assert.match(html, new RegExp(label), label)
  }

  // Top-level rows with goal chips.
  assert.match(html, row('File the tax return'))
  assert.match(html, /goal-chip[^>]*>Admin</)
  assert.match(html, row('Paint the walls'))
  assert.match(html, /goal-chip[^>]*>Home basics</)

  // Blocked task shows its state and disabled completion, collapsed with count.
  assert.match(html, /aria-label="Paint the walls is blocked by subtasks"/)
  assert.match(html, /class="remaining">1(<[^>]+>)? remaining</)

  // Repeatable fresh copy: repeatable mark with the previous completion.
  assert.match(html, row('Water the plants'))
  assert.match(html, /Repeatable(<!-- -->)? · last done/)

  // Factual dates.
  assert.match(html, /Deadline (<!-- -->)?Sep 15/)
  assert.match(html, />Tomorrow</)

  // Subtask rows of collapsed trees do not render in the all view.
  assert.doesNotMatch(html, row('Move the furniture out'))
})

test('goal views show exactly their set', async () => {
  const admin = await render(`/tasks?goal=${fixture.gAdmin.id}`)
  assert.match(admin, row('File the tax return'))
  assert.doesNotMatch(admin, row('Paint the walls'))

  const priority = await render('/tasks?goal=priority')
  assert.match(priority, row('File the tax return'))
  assert.doesNotMatch(priority, row('Paint the walls'))
  assert.doesNotMatch(priority, row('Plan the trip'))

  const none = await render('/tasks?goal=none')
  assert.match(none, row('Plan the trip'))
  assert.match(none, row('Water the plants'))
  assert.doesNotMatch(none, row('File the tax return'))
})

test('available view lists flat rows with paths and inherited chips', async () => {
  const html = await render('/tasks?available=1')

  // Blocked trees contribute their available subtasks as standalone rows.
  assert.match(html, row('Move the furniture out'))
  assert.match(html, /class="parent-path">Paint the walls</)
  // The inherited goal chip (ruling 5) on a standalone subtask row.
  assert.match(html, /goal-chip[^>]*>Home basics</)
  // Blocked top-level tasks are not available and do not render.
  assert.doesNotMatch(html, row('Paint the walls'))
})

test('ideal-date filter keeps exact matches with paths in order', async () => {
  const html = await render('/tasks?ideal=today')

  assert.match(html, row('Book a dentist appointment'))
  // A lone matching subtask: its nonmatching ancestors are hidden but named.
  assert.match(html, row('Price flights'))
  assert.match(html, /class="parent-path">Plan the trip</)
  // The nonmatching top-level task never becomes a row.
  assert.doesNotMatch(html, row('Plan the trip'))
  // Tasks without a matching ideal date stay hidden.
  assert.doesNotMatch(html, row('File the tax return'))
  assert.doesNotMatch(html, row('Water the plants'))

  // Normal task order is preserved.
  const dentist = html.indexOf('>Book a dentist appointment</a>')
  const flights = html.indexOf('>Price flights</a>')
  assert.ok(dentist < flights, 'order changed by the date filter')
})

test('history views list completions and archived items with restore', async () => {
  const completed = await render('/tasks?view=completed')
  assert.match(completed, row('Send the insurance form'))
  assert.match(completed, /Completed /)

  const archived = await render('/tasks?view=archived')
  assert.match(archived, row('Compare phone plans'))
  assert.match(archived, /Restore/)

  // A goal view with no tasks yields the factual filtered empty state.
  const filtered = await render(
    `/tasks?goal=${fixture.gEmpty.id}&available=1`,
  )
  assert.match(filtered, /No available tasks match these filters\./)
  assert.match(filtered, /Show all tasks/)
})

test('the sheet renders the task and its subtask tree server-side', async () => {
  const html = await render(`/tasks/${fixture.paint.id}`)
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-label="Task"/)
  assert.match(html, /value="Paint the walls"/)
  assert.match(html, /value="Move the furniture out"/)
  assert.match(html, /Blocked/)
  assert.match(html, /Subtasks/)
  // Canonical URL keeps filter search params.
  const filtered = await render(`/tasks/${fixture.paint.id}?available=1`)
  assert.match(filtered, /value="Paint the walls"/)
})

test('unknown tasks keep the factual not-found state', async () => {
  const html = await render('/tasks/t_missing')
  assert.match(html, />Task not found</)
  assert.match(html, /href="\/tasks"[^>]*>Tasks</)
})

test('unknown goal ids simply yield the filtered empty state', async () => {
  const html = await render('/tasks?goal=g_nothing')
  assert.match(html, /No tasks match these filters\./)
})
