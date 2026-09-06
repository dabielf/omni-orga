import type { Goal, Task } from '../domain/store'
import { taskInGoalScope } from './tasksView.ts'
import type { TodayData } from '../domain/serverStore'

export type GoalCoverage = {
  covered: Goal[]
  notCovered: Goal[]
}

/**
 * Splits the active priority goals into the ones today's tasks touch and the ones
 * they do not. A subgoal link also counts once for its parent goal.
 */
export function coverageSplit(data: TodayData): GoalCoverage {
  const goalIndex = new Map(data.goals.map((goal) => [goal.id, goal]))
  const todaysTasks = [...data.open, ...data.completed]
  const priority = data.goals.filter((goal) => goal.priority && !goal.completedAt && !goal.archivedAt)
  const covered = priority.filter((goal) =>
    todaysTasks.some((task) => taskInGoalScope(task, goal.id, goalIndex)),
  )
  const coveredIds = new Set(covered.map((goal) => goal.id))
  return {
    covered,
    notCovered: priority.filter((goal) => !coveredIds.has(goal.id)),
  }
}

/** Goal titles of a task for the factual row meta line. */
export function goalNames(task: Task, data: TodayData) {
  const goalIndex = new Map(data.goals.map((goal) => [goal.id, goal]))
  return task.goalIds
    .map((id) => goalIndex.get(id)?.title)
    .filter((title): title is string => Boolean(title))
}

const LONG_DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Factual long date for the Today heading, like "Friday, 29 August". */
export function longDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`)
  return `${LONG_DAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${LONG_MONTHS[date.getUTCMonth()]}`
}
