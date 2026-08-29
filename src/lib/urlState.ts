export const shellGoalIds = ['g_focus_01', 'g_home_02']

type Search = Record<string, unknown>

export type TasksSearch = {
  goal?: string
  available?: '1'
}

export function sanitizeTasksSearch(search: Search): TasksSearch {
  const clean: TasksSearch = {}
  if (
    search.goal === 'priority' ||
    (typeof search.goal === 'string' && shellGoalIds.includes(search.goal))
  ) {
    clean.goal = search.goal
  }
  // The router's qss query decoder coerces numeric strings at parse time, so a
  // pasted or reloaded `?available=1` arrives as the number 1 regardless of the
  // configured parser; normalize it back before the stringifier writes it out.
  if (String(search.available) === '1') clean.available = '1'
  return clean
}

function taskSearchString(search: Search) {
  const clean = sanitizeTasksSearch(search)
  const parameters = new URLSearchParams()
  if (clean.goal) parameters.set('goal', clean.goal)
  if (clean.available) parameters.set('available', clean.available)
  const query = parameters.toString()
  return query ? `?${query}` : ''
}

export function tasksUrl(search: Search = {}) {
  return `/tasks${taskSearchString(search)}`
}

export function recordUrl(
  collection: 'tasks' | 'goals',
  id: string,
  search: Search = {},
) {
  const query = collection === 'tasks' ? taskSearchString(search) : ''
  return `/${collection}/${encodeURIComponent(id)}${query}`
}

function validDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return false
  return date.toISOString().slice(0, 10) === value
}

function validMonth(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return false
  const month = Number(value.slice(5))
  return month >= 1 && month <= 12
}

export type CalendarSearch = { date?: string; month?: string }

export function sanitizeCalendarSearch(search: Search): CalendarSearch {
  if (validDate(search.date)) return { date: search.date as string }
  if (validMonth(search.month)) return { month: search.month as string }
  return {}
}

export function calendarUrl(search: Search = {}) {
  const clean = sanitizeCalendarSearch(search)
  if (clean.date) return `/calendar?date=${clean.date}`
  if (clean.month) return `/calendar?month=${clean.month}`
  return '/calendar'
}

export type StatsSearch = { period?: 'week' | 'year' }

export function sanitizeStatsSearch(search: Search): StatsSearch {
  return search.period === 'week' || search.period === 'year'
    ? { period: search.period }
    : {}
}

export function statsUrl(search: Search = {}) {
  const clean = sanitizeStatsSearch(search)
  return clean.period ? `/stats?period=${clean.period}` : '/stats'
}
