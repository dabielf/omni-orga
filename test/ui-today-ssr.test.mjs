import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { createDomainStore } from '../src/domain/store.ts'

const checkout = new URL('..', import.meta.url)
const directory = await mkdtemp(join(tmpdir(), 'omni-orga-ui-today-'))
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

function runLifecycle(command, environment = env) {
  return spawnSync(process.execPath, ['scripts/lifecycle.mjs', command], {
    cwd: checkout,
    encoding: 'utf8',
    env: environment,
    timeout: 60_000,
  })
}

async function unusedPort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const used = Number(server.address().port)
  server.close()
  return used
}

const now = new Date()
const today = new Date(
  now.getTime() - now.getTimezoneOffset() * 60_000,
).toISOString().slice(0, 10)
const tomorrow = new Date(
  now.getTime() - now.getTimezoneOffset() * 60_000 + 86_400_000,
).toISOString().slice(0, 10)
const yesterday = new Date(
  now.getTime() - now.getTimezoneOffset() * 60_000 - 86_400_000,
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
  const gHome = store.createGoal({ title: 'Home basics', kind: 'ongoing' })
  const gQuiet = store.createGoal({ title: 'Quiet goal', kind: 'ongoing' })

  // Open tasks planned today. Planning order is alpha, beta, gamma; the
  // manual reorder puts gamma right after alpha, so the rendered order
  // must be alpha, gamma, beta — not creation order.
  const alpha = store.createTask({
    title: 'Send the rent reminder',
    goalIds: [gWork.id],
  })
  const beta = store.createTask({
    title: 'Water the plants',
    goalIds: [gHome.id],
    repeatable: true,
  })
  const gamma = store.createTask({ title: 'Read the article' })
  store.planTask(alpha.id, today)
  store.planTask(beta.id, today)
  store.planTask(gamma.id, today)
  store.reorderToday(gamma.id, alpha.id)

  // Completed today: explicit timestamps, most recent first on the page.
  const delta = store.createTask({ title: 'Post the letter' })
  store.planTask(delta.id, today)
  store.completeTask(delta.id, `${today}T09:00:00.000Z`)
  const epsilon = store.createTask({
    title: 'Water the garden plants',
    repeatable: true,
  })
  store.planTask(epsilon.id, today)
  store.completeTask(epsilon.id, `${today}T10:00:00.000Z`)

  // Completed yesterday: leaves Today quietly and stays out of it.
  const old = store.createTask({
    title: 'File the old form',
    scheduledDay: yesterday,
    goalIds: [gWork.id],
  })
  store.completeTask(old.id, `${yesterday}T12:00:00.000Z`)

  // Blocked task scheduled today: the domain clears its day quietly.
  const blockedToday = store.createTask({
    title: 'Paint the walls',
    scheduledDay: today,
    goalIds: [gHome.id],
  })
  store.createTask({ title: 'Move the furniture out', parentId: blockedToday.id })

  // Blocked task scheduled for a future day: the day stays until then.
  const blockedLater = store.createTask({
    title: 'Plan the trip',
    scheduledDay: tomorrow,
  })
  store.createTask({ title: 'Price the flights', parentId: blockedLater.id })

  store.close()
  fixture = { blockedLater, epsilon, gHome, gQuiet, gWork }
})

after(() => {
  runLifecycle('stop')
})

async function render(path) {
  const response = await fetch(`${url}${path}`)
  assert.equal(response.status, 200, path)
  return response.text()
}

test('today renders exactly the available tasks scheduled today', async () => {
  const html = await render('/')

  const open = ['Send the rent reminder', 'Read the article', 'Water the plants']
  const completed = ['Water the garden plants', 'Post the letter']
  for (const title of [...open, ...completed]) {
    assert.match(html, row(title), title)
  }

  // Manual order is respected: alpha, gamma, beta.
  const positions = open.map((title) => html.search(row(title)))
  assert.ok(positions.every((value) => value >= 0), 'open rows rendered')
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)

  // Completed rows come after every open row, most recent first.
  const completedPositions = completed.map((title) => html.search(row(title)))
  assert.ok(Math.max(...positions) < Math.min(...completedPositions))
  assert.ok(completedPositions[0] < completedPositions[1])

  // A blocked task never appears on Today.
  assert.doesNotMatch(html, row('Paint the walls'))
  assert.doesNotMatch(html, row('Plan the trip'))

  // Day clearing rules: blocked-today lost its day; future blocked kept it.
  const store = createDomainStore(databasePath)
  assert.equal(store.getTask(blockedTodayId()).scheduledDay, null)
  assert.equal(store.getTask(fixture.blockedLater.id).scheduledDay, tomorrow)
  store.close()
})

// The blocked-today task id is not worth threading through the fixture;
// look it up by its stable title in the store.
function blockedTodayId() {
  const store = createDomainStore(databasePath)
  try {
    return store
      .listTasks({ includeArchived: true })
      .find((task) => task.title === 'Paint the walls').id
  } finally {
    store.close()
  }
}


test('a Today task that becomes blocked mid-day leaves the page', async () => {
  // Seed a fresh task on Today, then block it after the page has shown it.
  const store = createDomainStore(databasePath)
  const victim = store.createTask({ title: 'Sweep the porch' })
  store.planTask(victim.id, today)
  store.close()
  assert.match(await render('/'), row('Sweep the porch'))

  const blocking = createDomainStore(databasePath)
  blocking.createTask({ title: 'Move the ladder', parentId: victim.id })
  blocking.close()

  const html = await render('/')
  assert.doesNotMatch(html, row('Sweep the porch'))

  const cleared = createDomainStore(databasePath)
  try {
    assert.equal(cleared.getTask(victim.id).scheduledDay, null)
  } finally {
    cleared.close()
  }
})

test('a task completed yesterday is absent from Today but found in history', async () => {
  const html = await render('/')
  assert.doesNotMatch(html, row('File the old form'))

  const history = await render('/tasks?view=completed')
  assert.match(history, row('File the old form'))
})

test('coverage splits active goals into covered and not covered today', async () => {
  const html = await render('/')

  const covered = html.indexOf('Covered today')
  const notCovered = html.indexOf('Not covered today')
  assert.ok(covered >= 0 && notCovered > covered)

  // Steady work and Home basics have tasks on Today; Quiet goal does not.
  const workLink = new RegExp(`href="/tasks\\?goal=${fixture.gWork.id}&amp;available=1"`)
  const homeLink = new RegExp(`href="/tasks\\?goal=${fixture.gHome.id}&amp;available=1"`)
  const quietLink = new RegExp(`href="/tasks\\?goal=${fixture.gQuiet.id}&amp;available=1"`)
  assert.ok(html.slice(covered, notCovered).match(workLink), 'Steady work link covered')
  assert.ok(html.slice(covered, notCovered).match(homeLink), 'Home basics link covered')
  assert.ok(html.slice(notCovered).match(quietLink), 'Quiet goal link not covered')
})

test('completed repeatable leaves a fresh copy with no scheduled day', async () => {
  const html = await render('/')
  assert.match(html, row('Water the garden plants'))

  const store = createDomainStore(databasePath)
  try {
    const fresh = store
      .listTasks({ includeArchived: true })
      .find((task) => task.sourceTaskId === fixture.epsilon.id)
    assert.ok(fresh, 'fresh repeatable copy exists')
    assert.equal(fresh.scheduledDay, null)
    assert.equal(fresh.completedAt, null)
  } finally {
    store.close()
  }
})

test('empty today shows the message and one link to Tasks', async () => {
  const emptyPort = await unusedPort()
  const emptyDirectory = await mkdtemp(join(tmpdir(), 'omni-orga-ui-today-empty-'))
  const emptyEnv = {
    ...env,
    OMNI_ORGA_PORT: String(emptyPort),
    OMNI_ORGA_RUNTIME_DIR: join(emptyDirectory, 'runtime'),
    OMNI_ORGA_DATABASE_PATH: join(emptyDirectory, 'omni-orga.sqlite'),
  }
  const started = runLifecycle('start', emptyEnv)
  assert.equal(started.status, 0, started.stderr)
  try {
    const response = await fetch(`http://127.0.0.1:${emptyPort}/`)
    const html = await response.text()
    assert.match(html, /Nothing planned for today/)
    // Count links inside the page content only; the global nav has its own.
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
    assert.equal(
      (main.match(/href="\/tasks"/g) ?? []).length,
      1,
      'exactly one link to Tasks',
    )
  } finally {
    runLifecycle('stop', emptyEnv)
  }
})
