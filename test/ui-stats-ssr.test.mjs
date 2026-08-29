import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { createDomainStore } from '../src/domain/store.ts'

const checkout = new URL('..', import.meta.url)
const directory = await mkdtemp(join(tmpdir(), 'omni-orga-ui-stats-'))
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

function runLifecycle(command, customEnv = env) {
  return spawnSync(process.execPath, ['scripts/lifecycle.mjs', command], {
    cwd: checkout,
    encoding: 'utf8',
    env: customEnv,
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

const daysAgoIso = (n) =>
  new Date(Date.now() - n * 86_400_000).toISOString()

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function shortDay(iso) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`
}

// The label rendered with aria-current="page" in the period navigation.
function activePeriodLabel(html) {
  const anchors = html.match(/<a\b[^>]*>(?:30 days|90 days|12 months)<\/a>/g)
  for (const anchor of anchors ?? []) {
    if (anchor.includes('aria-current="page"')) {
      return anchor.replace(/<[^>]*>/g, '')
    }
  }
  return null
}

// Body copy only: the dehydrated loader payload sits outside <main>.
function mainContent(html) {
  const match = html.match(/<main class="app-main">([\s\S]*)<\/main>/)
  return match ? match[1] : ''
}

let fixture

before(() => {
  const started = runLifecycle('start')
  assert.equal(started.status, 0, started.stderr)

  const store = createDomainStore(databasePath)

  // Ongoing goal: the repeatable is completed twice — once before and once
  // after a rename — so both copies must count under one history.
  const gPractice = store.createGoal({ title: 'Steady practice', kind: 'ongoing' })
  const guitar = store.createTask({
    title: 'Practice guitar',
    repeatable: true,
    goalIds: [gPractice.id],
  })
  const firstCopy = store.completeTask(guitar.id, daysAgoIso(1))
  store.updateTask(firstCopy.freshTask.id, { title: 'Practice guitar daily' })
  store.completeTask(firstCopy.freshTask.id, daysAgoIso(2))
  const oldChore = store.createTask({
    title: 'Old chore',
    goalIds: [gPractice.id],
  })
  store.completeTask(oldChore.id, daysAgoIso(60))

  // One-shot goal: one completed task, one open task, one repeatable
  // completed twice with its fresh copy still open.
  const gPassport = store.createGoal({
    title: 'Renew the passport',
    kind: 'one_shot',
  })
  const form = store.createTask({
    title: 'Fill in the form',
    goalIds: [gPassport.id],
  })
  store.createTask({ title: 'Take the photos', goalIds: [gPassport.id] })
  const mailbox = store.createTask({
    title: 'Check the mailbox',
    repeatable: true,
    goalIds: [gPassport.id],
  })
  const mailCopy = store.completeTask(mailbox.id, daysAgoIso(4))
  store.completeTask(mailCopy.freshTask.id, daysAgoIso(5))
  store.completeTask(form.id, daysAgoIso(3))

  // One-shot goal completed in the period.
  const gShip = store.createGoal({ title: 'Ship the release', kind: 'one_shot' })
  const notes = store.createTask({
    title: 'Write the release notes',
    goalIds: [gShip.id],
  })
  store.completeTask(notes.id, daysAgoIso(1))
  store.completeGoal(gShip.id, { completedAt: daysAgoIso(1) })

  // A goal with no activity at all.
  store.createGoal({ title: 'Quiet garden', kind: 'ongoing' })

  store.close()
  fixture = { gPractice, gPassport, gShip }
})

after(() => {
  runLifecycle('stop')
})

async function render(path) {
  const response = await fetch(`${url}${path}`)
  assert.equal(response.status, 200, path)
  return response.text()
}

test('the default renders 30-day stats without a period parameter', async () => {
  const html = await render('/stats')

  assert.match(html, /<h1[^>]*>Stats<\/h1>/)
  // No period parameter anywhere in the served URL state: the link for the
  // default period points at the bare /stats path.
  assert.match(html, /href="\/stats\"[^>]*>30 days<\/a>/)

  // Counters: 2 guitar copies + form + 2 mailbox copies + release notes = 6;
  // the 60-day-old chore stays outside the 30-day window.
  assert.match(html, /stats-counter-number[^>]*>6</)
  assert.match(html, /stats-counter-number[^>]*>1</)
  assert.match(html, /stats-counter-number[^>]*>3</)
  assert.match(html, /tasks completed/)
  assert.match(html, /goal completed/)
  assert.match(html, /goals worked on/)

  assert.equal(activePeriodLabel(html), '30 days')
})

test('renamed repeatable copies count under one history with the weekly rate', async () => {
  const html = await render('/stats')

  assert.match(html, /3 tasks and subtasks done/)
  assert.match(html, /Practice guitar daily/)
  assert.match(html, /2 times in 30 days · ≈0.5 a week/)
})

test('one-shot sections show n of m with bar and percentage', async () => {
  const html = await render('/stats')

  // Completed: form + 2 mailbox copies; total adds the two open tasks.
  assert.match(html, /3 of 5 tasks done · 60%/)
  assert.match(html, /width:\s*60%/)
})

test('quiet goals and periods read as zeros without failure language', async () => {
  const html = await render('/stats')

  assert.match(html, /0 tasks and subtasks done/)
  assert.doesNotMatch(mainContent(html), /streak|badge|score|praise|Open Tasks/i)
})

test('one-shot goals completed in the period are listed with their day', async () => {
  const html = await render('/stats')

  assert.match(html, /One-shot goals completed in this period/)
  assert.match(
    html,
    new RegExp(`Ship the release, completed ${shortDay(daysAgoIso(1))}`),
  )
})

test('period choices live in the URL and change the aggregation', async () => {
  const ninety = await render('/stats?period=90')
  // The old chore (60 days ago) is back inside the window.
  assert.match(ninety, /stats-counter-number[^>]*>7</)
  assert.match(ninety, /2 times in 90 days · ≈0.2 a week/)
  assert.equal(activePeriodLabel(ninety), '90 days')

  const year = await render('/stats?period=365')
  assert.match(year, /stats-counter-number[^>]*>7</)
  assert.match(year, /2 times in 365 days · ≈0 a week/)
  assert.equal(activePeriodLabel(year), '12 months')
  // The period navigation offers the 12-month choice under its label.
  assert.match(year, /href="\/stats\?period=365\"[^>]*>12 months<\/a>/)
})

test('a fresh database renders zeros with no call to action', async () => {
  const emptyDir = await mkdtemp(join(tmpdir(), 'omni-orga-ui-stats-empty-'))
  const emptyPort = await unusedPort()
  const emptyUrl = `http://127.0.0.1:${emptyPort}`
  const emptyEnv = {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_PORT: String(emptyPort),
    OMNI_ORGA_RUNTIME_DIR: join(emptyDir, 'runtime'),
    OMNI_ORGA_DATABASE_PATH: join(emptyDir, 'omni-orga.sqlite'),
  }
  const started = spawnSync(process.execPath, ['scripts/lifecycle.mjs', 'start'], {
    cwd: checkout,
    encoding: 'utf8',
    env: emptyEnv,
    timeout: 30_000,
  })
  assert.equal(started.status, 0, started.stderr)
  try {
    const response = await fetch(`${emptyUrl}/stats`)
    const html = await response.text()
    assert.equal(response.status, 200)

    // Ruling 1: zeros in the counters, no call to action anywhere.
    assert.match(html, /<h1[^>]*>Stats<\/h1>/)
    assert.match(html, /stats-counter-number[^>]*>0</)
    assert.match(html, /No goals yet\./)
    assert.doesNotMatch(mainContent(html), /Open Tasks|href="\/tasks"/)
    assert.doesNotMatch(mainContent(html), /streak|badge|score|praise/i)
  } finally {
    spawnSync(process.execPath, ['scripts/lifecycle.mjs', 'stop'], {
      cwd: checkout,
      encoding: 'utf8',
      env: emptyEnv,
      timeout: 30_000,
    })
    await rm(emptyDir, { recursive: true, force: true })
  }
})
