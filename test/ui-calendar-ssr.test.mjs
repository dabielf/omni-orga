import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { createDomainStore } from '../src/domain/store.ts'

const checkout = new URL('..', import.meta.url)
const directory = await mkdtemp(join(tmpdir(), 'omni-orga-ui-calendar-'))
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
const inDays = (days) =>
  new Date(now.getTime() - now.getTimezoneOffset() * 60_000 + days * 86_400_000)
    .toISOString()
    .slice(0, 10)

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function fmtShort(day) {
  const date = new Date(`${day}T00:00:00Z`)
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`
}

/** Monday of the week containing `day` (same rule as the calendar window). */
function mondayOf(day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return new Date(
    new Date(`${day}T00:00:00Z`).getTime() - ((weekday + 6) % 7) * 86_400_000,
  ).toISOString().slice(0, 10)
}

/** One grid cell's markup, from its day marker to the next cell's. */
function cell(html, day) {
  const marker = `data-day="${day}"`
  const start = html.indexOf(marker)
  assert.notEqual(start, -1, `missing calendar cell for ${day}`)
  const next = html.indexOf('data-day="', start + marker.length)
  return html.slice(start, next === -1 ? undefined : next)
}

/** The day panel markup between the grid and the pool. */
function panel(html) {
  const start = html.indexOf('class="cal-panel"')
  if (start === -1) return null
  const end = html.indexOf('class="cal-pool"')
  return html.slice(start, end)
}

/** The pool markup, bounded before the dehydrated loader payload. */
function pool(html) {
  const start = html.indexOf('class="cal-pool"')
  const end = html.indexOf('</section>', start)
  return html.slice(start, end)
}


let fixture

before(() => {
  const started = runLifecycle('start')
  assert.equal(started.status, 0, started.stderr)

  const store = createDomainStore(databasePath)
  const gWork = store.createGoal({ title: 'Steady work', kind: 'ongoing' })

  // Scheduled chips across the window, with one of each context register.
  store.createTask({
    title: 'Book the mover',
    goalIds: [gWork.id],
    scheduledDay: inDays(2),
  })
  store.createTask({
    title: 'Send the form',
    scheduledDay: inDays(4),
    idealCompletionDate: inDays(10),
  })
  store.createTask({
    title: 'Draft the report',
    scheduledDay: inDays(3),
    deadline: inDays(7),
  })

  // Overdue task without a day: waits in the pool with its deadline note.
  store.createTask({ title: 'Pay the fine', deadline: yesterday })

  // Plain available task without a day.
  store.createTask({ title: 'Water the plants' })

  // Blocked task scheduled for a future day: the day stays until then.
  const blockedLater = store.createTask({
    title: 'Plan the trip',
    scheduledDay: tomorrow,
  })
  store.createTask({ title: 'Price the flights', parentId: blockedLater.id })

  // Blocked task whose scheduled day has arrived: the day clears and the
  // task waits in the pool, visibly blocked (ruling 8).
  const blockedArrived = store.createTask({
    title: 'Paint the walls',
    scheduledDay: today,
  })
  store.createTask({
    title: 'Move the furniture out',
    parentId: blockedArrived.id,
  })

  store.close()
  fixture = { gWork }
})

after(() => {
  runLifecycle('stop')
})

async function render(path) {
  const response = await fetch(`${url}${path}`)
  assert.equal(response.status, 200, path)
  return response.text()
}

test('the grid shows five whole weeks starting Monday, past days dimmed', async () => {
  const html = await render('/calendar')
  assert.equal((html.match(/data-day="/g) ?? []).length, 35)
  const windowEnd = new Date(
    new Date(`${mondayOf(today)}T00:00:00Z`).getTime() + 34 * 86_400_000,
  ).toISOString().slice(0, 10)
  assert.ok(html.includes(`data-day="${windowEnd}"`))
  assert.match(cell(html, yesterday), /is-past/)
  assert.match(cell(html, today), /is-today/)
  assert.doesNotMatch(cell(html, inDays(2)), /is-past/)
})

test('there are no month navigation controls and no call to action', async () => {
  const html = await render('/calendar')
  assert.ok(!html.includes('month='))
  assert.ok(!html.includes('segmented-links'))
  assert.ok(!html.includes('Open Tasks'))
})

test('the legend names all three date registers', async () => {
  const html = await render('/calendar')
  assert.ok(html.includes('Scheduled day'))
  assert.ok(html.includes('Ideal completion date'))
  assert.ok(html.includes('Deadline'))
})

test('a day panel lists exactly the tasks scheduled that day', async () => {
  const html = await render(`/calendar?date=${inDays(2)}`)
  const day = panel(html)
  assert.ok(day, 'panel rendered for the selected day')
  assert.match(day, /Book the mover/)
  assert.match(day, /task planned/)
  assert.ok(!day.includes('Send the form'))
  assert.ok(!day.includes('Draft the report'))
})

test('panel rows carry ideal and deadline notes with their dates', async () => {
  const withIdeal = panel(await render(`/calendar?date=${inDays(4)}`))
  assert.match(withIdeal, /Send the form/)
  assert.match(withIdeal, new RegExp(`ideal (<!-- -->)?${fmtShort(inDays(10))}`))

  const withDeadline = panel(await render(`/calendar?date=${inDays(3)}`))
  assert.match(withDeadline, /Draft the report/)
  assert.match(withDeadline, new RegExp(`deadline (<!-- -->)?${fmtShort(inDays(7))}`))
})

test('an empty day panel states the fact without a call to action', async () => {
  const day = panel(await render(`/calendar?date=${inDays(10)}`))
  assert.match(day, /Nothing planned yet/)
  assert.ok(!day.includes('Open Tasks'))
})

test('the pool lists tasks without a day and never scheduled ones', async () => {
  const html = await render('/calendar')
  const waiting = pool(html)
  assert.match(waiting, /Water the plants/)
  assert.match(waiting, new RegExp(`deadline (<!-- -->)?${fmtShort(yesterday)}`))
  assert.ok(!waiting.includes('Book the mover'))
  assert.ok(!waiting.includes('Send the form'))
})

test('a blocked task stays on its future day and shows as blocked', async () => {
  const html = await render('/calendar')
  assert.match(cell(html, tomorrow), /Plan the trip/)
  const waiting = pool(html)
  assert.ok(!waiting.includes('Plan the trip'))
  assert.match(cell(html, tomorrow), /Blocked/)
})

test('a blocked task whose day arrived waits in the pool, visibly blocked', async () => {
  const html = await render('/calendar')
  assert.ok(!cell(html, today).includes('Paint the walls'))
  const waiting = pool(html)
  assert.match(waiting, /Paint the walls/)
  const row = waiting.slice(
    waiting.indexOf('Paint the walls'),
    waiting.indexOf('Paint the walls') + 400,
  )
  assert.match(row, /Blocked/)
})
