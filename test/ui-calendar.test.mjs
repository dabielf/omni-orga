import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calendarDays,
  calendarGrid,
  moveDays,
  poolTasks,
} from '../src/lib/calendarView.ts'

const today = '2026-08-29' // a Saturday

function task(overrides) {
  return {
    id: 't_1',
    parentId: null,
    sourceTaskId: null,
    historyId: 't_1',
    title: 'Task',
    notes: '',
    repeatable: false,
    sortOrder: 0,
    todayOrder: null,
    idealCompletionDate: null,
    deadline: null,
    scheduledDay: null,
    completedAt: null,
    archivedAt: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    blocked: false,
    available: true,
    goalIds: [],
    externalLinks: [],
    ...overrides,
  }
}

test('the window is five whole weeks starting Monday of the current week', () => {
  const days = calendarDays(today)
  assert.equal(days.length, 35)
  // 2026-08-29 is a Saturday, so its week's Monday is 2026-08-24.
  assert.equal(days[0], '2026-08-24')
  assert.equal(days.at(-1), '2026-09-27')
})

test('the grid marks past days, today, and lists each day\'s scheduled tasks', () => {
  const tasks = [
    task({ id: 't_a', title: 'Planned tomorrow', scheduledDay: '2026-08-30' }),
    task({ id: 't_b', title: 'Planned today', scheduledDay: today }),
    task({ id: 't_c', title: 'No day' }),
  ]
  const cells = calendarGrid(tasks, today)
  assert.equal(cells.length, 35)
  const yesterday = cells.find((cell) => cell.day === '2026-08-28')
  assert.equal(yesterday.past, true)
  assert.equal(yesterday.isToday, false)
  const todayCell = cells.find((cell) => cell.day === today)
  assert.equal(todayCell.past, false)
  assert.equal(todayCell.isToday, true)
  assert.deepEqual(
    todayCell.tasks.map((entry) => entry.id),
    ['t_b'],
  )
  const tomorrowCell = cells.find((cell) => cell.day === '2026-08-30')
  assert.deepEqual(
    tomorrowCell.tasks.map((entry) => entry.id),
    ['t_a'],
  )
})

test('a blocked task whose scheduled day has arrived leaves the day for the pool', () => {
  const blockedArrived = task({
    id: 't_blocked',
    title: 'Paint the walls',
    scheduledDay: today,
    blocked: true,
    available: false,
  })
  const blockedLater = task({
    id: 't_later',
    title: 'Plan the trip',
    scheduledDay: '2026-09-05',
    blocked: true,
    available: false,
  })
  const open = task({ id: 't_open', title: 'No day yet' })
  const cells = calendarGrid([blockedArrived, blockedLater, open], today)

  const todayCell = cells.find((cell) => cell.day === today)
  assert.deepEqual(todayCell.tasks, [])
  const laterCell = cells.find((cell) => cell.day === '2026-09-05')
  assert.deepEqual(
    laterCell.tasks.map((entry) => entry.id),
    ['t_later'],
  )

  const pool = poolTasks([blockedArrived, blockedLater, open], today)
  assert.deepEqual(
    pool.map((entry) => entry.id),
    ['t_blocked', 't_open'],
  )
})

test('the move popover offers 14 days from today including today', () => {
  const days = moveDays(today, task({}))
  assert.equal(days.length, 14)
  assert.equal(days[0].day, today)
  assert.equal(days[0].label, 'Today')
  assert.equal(days[1].label, 'Tomorrow')
  assert.equal(days.at(-1).day, '2026-09-11')
  for (const entry of days) {
    assert.equal(entry.disabled, false)
    assert.equal(entry.reason, null)
  }
})

test('days after an unpassed deadline are disabled with a stated reason', () => {
  const deadline = '2026-09-02'
  const days = moveDays(today, task({ deadline }))
  const before = days.find((entry) => entry.day === deadline)
  assert.equal(before.disabled, false)
  const after = days.find((entry) => entry.day === '2026-09-03')
  assert.equal(after.disabled, true)
  assert.match(after.reason, /2026-09-02|Sep 2/)
  const last = days.at(-1)
  assert.equal(last.disabled, true)
})

test('an overdue task may be planned to any future day', () => {
  const days = moveDays(today, task({ deadline: '2026-08-20' }))
  for (const entry of days) {
    assert.equal(entry.disabled, false, entry.day)
    assert.equal(entry.reason, null)
  }
})

test('today is not offered to a blocked task', () => {
  const days = moveDays(today, task({ blocked: true }))
  assert.equal(days[0].disabled, true)
  assert.match(days[0].reason, /Blocked/)
  assert.equal(days[1].disabled, false)
})

test('the pool keeps open tasks without a day', () => {
  const tasks = [
    task({ id: 't_open' }),
    task({ id: 't_scheduled', scheduledDay: '2026-09-01' }),
    task({ id: 't_done', completedAt: `${today}T09:00:00.000Z` }),
    task({ id: 't_archived', archivedAt: `${today}T09:00:00.000Z` }),
  ]
  assert.deepEqual(
    poolTasks(tasks, today).map((entry) => entry.id),
    ['t_open'],
  )
})
