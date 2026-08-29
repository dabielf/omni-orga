type Search = Record<string, unknown>

export const idealDatePresets = ['today', 'week', 'passed', 'none'] as const
export type IdealDatePreset = (typeof idealDatePresets)[number]
export type TasksViewName = 'completed' | 'archived'

export type TasksSearch = {
  goal?: string
  available?: '1'
  ideal?: IdealDatePreset
  view?: TasksViewName
}

/** Domain ids look like `g_` + lowercase base64url, so hyphens are legal. */
const wellFormedGoalId = /^[gt]_[a-z0-9_-]+$/

export function sanitizeTasksSearch(search: Search): TasksSearch {
  const clean: TasksSearch = {}
  if (
    search.goal === 'priority' ||
    (typeof search.goal === 'string' && wellFormedGoalId.test(search.goal))
  ) {
    clean.goal = search.goal
  }
  // The router's qss query decoder coerces numeric strings at parse time, so a
  // pasted or reloaded `?available=1` arrives as the number 1 regardless of the
  // configured parser; normalize it back before the stringifier writes it out.
  if (String(search.available) === '1') clean.available = '1'
  if (
    typeof search.ideal === 'string' &&
    (idealDatePresets as readonly string[]).includes(search.ideal)
  ) {
    clean.ideal = search.ideal as IdealDatePreset
  }
  if (search.view === 'completed' || search.view === 'archived') {
    clean.view = search.view
  }
  return clean
}

function taskSearchString(search: Search) {
  const clean = sanitizeTasksSearch(search)
  const parameters = new URLSearchParams()
  if (clean.goal) parameters.set('goal', clean.goal)
  if (clean.available) parameters.set('available', clean.available)
  if (clean.ideal) parameters.set('ideal', clean.ideal)
  if (clean.view) parameters.set('view', clean.view)
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

export const statsPeriods = ['30', '90', '365'] as const
export type StatsPeriod = (typeof statsPeriods)[number]

/**
 * The stats period lives in the URL; an omitted period means the 30-day
 * default. The router's qss query decoder coerces numeric strings at parse
 * time (see sanitizeTasksSearch), so a pasted `?period=90` arrives as the
 * number 90 and is normalized back to the '90' preset here.
 */
export type StatsSearch = { period?: StatsPeriod }

export function sanitizeStatsSearch(search: Search): StatsSearch {
  const period = String(search.period)
  return (statsPeriods as readonly string[]).includes(period)
    ? { period: period as StatsPeriod }
    : {}
}

export function statsUrl(search: Search = {}) {
  const clean = sanitizeStatsSearch(search)
  return clean.period ? `/stats?period=${clean.period}` : '/stats'
}
