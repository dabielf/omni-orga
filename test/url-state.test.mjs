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

test('any well-formed goal id is accepted, not a hardcoded list', () => {
  assert.deepEqual(sanitizeTasksSearch({ goal: 'g_ab12cd34' }), {
    goal: 'g_ab12cd34',
  })
  assert.deepEqual(sanitizeTasksSearch({ goal: 'g_a-b_c' }), { goal: 'g_a-b_c' })
  assert.deepEqual(sanitizeTasksSearch({ goal: 'no_goal' }), {})
  assert.deepEqual(sanitizeTasksSearch({ goal: 42 }), {})
})

test('ideal date presets and history views are validated', () => {
  assert.deepEqual(sanitizeTasksSearch({ ideal: 'week' }), { ideal: 'week' })
  assert.deepEqual(sanitizeTasksSearch({ ideal: 'month' }), {})
  assert.deepEqual(sanitizeTasksSearch({ view: 'completed' }), {
    view: 'completed',
  })
  assert.deepEqual(sanitizeTasksSearch({ view: 'trash' }), {})
  assert.equal(
    tasksUrl({ goal: 'priority', ideal: 'today' }),
    '/tasks?goal=priority&ideal=today',
  )
  assert.equal(tasksUrl({ view: 'archived' }), '/tasks?view=archived')
  assert.equal(
    recordUrl('tasks', 't_abc', { view: 'completed', available: '1' }),
    '/tasks/t_abc?available=1&view=completed',
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

  assert.deepEqual(sanitizeStatsSearch({ period: '30' }), { period: '30' })
  assert.deepEqual(sanitizeStatsSearch({ period: 90 }), { period: '90' })
  assert.deepEqual(sanitizeStatsSearch({ period: 'year' }), {})
  assert.deepEqual(sanitizeStatsSearch({ period: '' }), {})
  // Out-of-range calendar dates must be dropped, not throw (bad value ignored).
  assert.deepEqual(sanitizeCalendarSearch({ date: '2026-13-01' }), {})
  assert.deepEqual(sanitizeCalendarSearch({ month: '2026-13' }), {})
  assert.equal(calendarUrl({ date: '2026-13-01' }), '/calendar')
  assert.equal(calendarUrl({ month: '2026-13' }), '/calendar')

  assert.equal(statsUrl({ period: '365' }), '/stats?period=365')
  assert.equal(statsUrl({}), '/stats')
})
