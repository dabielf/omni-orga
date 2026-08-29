import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calendarUrl,
  recordUrl,
  sanitizeCalendarSearch,
  sanitizeStatsSearch,
  sanitizeTasksSearch,
  statsUrl,
  tasksUrl,
} from '../src/lib/urlState.ts'

test('task URLs keep valid filters and omit defaults', () => {
  assert.deepEqual(
    sanitizeTasksSearch({ goal: 'g_focus_01', available: '1' }),
    { goal: 'g_focus_01', available: '1' },
  )
  // The router's query decoder coerces numeric strings on paste/reload.
  assert.deepEqual(sanitizeTasksSearch({ available: 1 }), { available: '1' })
  assert.equal(tasksUrl({ available: 1 }), '/tasks?available=1')
  assert.equal(
    recordUrl('tasks', 't_prepare_01', { goal: 'priority', available: '1' }),
    '/tasks/t_prepare_01?goal=priority&available=1',
  )
})

test('invalid task filters are removed without changing valid filters', () => {
  assert.deepEqual(
    sanitizeTasksSearch({ goal: 'not-a-goal', available: '1', menu: 'open' }),
    { available: '1' },
  )
  assert.deepEqual(sanitizeTasksSearch({ goal: 'priority', available: '0' }), {
    goal: 'priority',
  })
})

test('record URLs use opaque IDs rather than names', () => {
  assert.equal(recordUrl('goals', 'g_focus_01'), '/goals/g_focus_01')
})

test('calendar and stats URLs keep only durable valid state', () => {
  assert.deepEqual(
    sanitizeCalendarSearch({ date: '2026-08-29', month: '2026-08' }),
    { date: '2026-08-29' },
  )
  assert.deepEqual(sanitizeCalendarSearch({ date: '2026-02-31' }), {})
  assert.equal(calendarUrl({ month: '2026-08' }), '/calendar?month=2026-08')

  assert.deepEqual(sanitizeStatsSearch({ period: 'week' }), { period: 'week' })
  // Out-of-range calendar dates must be dropped, not throw (bad value ignored).
  assert.deepEqual(sanitizeCalendarSearch({ date: '2026-13-01' }), {})
  assert.deepEqual(sanitizeCalendarSearch({ month: '2026-13' }), {})
  assert.equal(calendarUrl({ date: '2026-13-01' }), '/calendar')
  assert.equal(calendarUrl({ month: '2026-13' }), '/calendar')

  assert.equal(statsUrl({ period: 'year' }), '/stats?period=year')
})
