import type { Goal, Task } from '../domain/store'

import type { StatsPeriod } from './urlState'

/** Length of each stats period in days; '365' is presented as 12 months. */
export const PERIOD_DAYS: Record<StatsPeriod, number> = {
  '30': 30,
  '90': 90,
  '365': 365,
}

export const PERIOD_LABELS: Record<StatsPeriod, string> = {
  '30': '30 days',
  '90': '90 days',
  '365': '12 months',
}

const DAY_MS = 86_400_000

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * Completions per week over the period: count divided by the period's week
 * count (days / 7), rounded to one decimal place.
 */
export function weeklyAverage(count: number, days: number): number {
  return Math.round((count / (days / 7)) * 10) / 10
}

/** The factual repeatable row copy: "2 times in 30 days · ≈0.5 a week". */
export function repeatableRowText(count: number, days: number): string {
  const rate = weeklyAverage(count, days)
  const rateText = Number.isInteger(rate) ? String(rate) : rate.toFixed(1)
  const unit = count === 1 ? 'time' : 'times'
  return `${count} ${unit} in ${days} days · ≈${rateText} a week`
}

/** Short factual day for completion listings, e.g. "Aug 27". */
export function formatStatsDay(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`
}

export type StatsRepeatableRow = {
  taskId: string
  title: string
  text: string
}

export type StatsGoalSection =
  | {
      goalId: string
      title: string
      kind: 'ongoing'
      /** All-time completed tasks and subtasks in the goal tree. */
      doneCount: number
      repeatables: StatsRepeatableRow[]
    }
  | {
      goalId: string
      title: string
      kind: 'one_shot'
      completed: number
      total: number
      percentage: number
    }

export type StatsCompletedGoal = {
  goalId: string
  title: string
  completedAt: string
  day: string
}

export type StatsViewModel = {
  period: StatsPeriod
  days: number
  counterItems: Array<{ value: number; label: string }>
  tasksCompleted: number
  goalsCompleted: number
  goalsWorkedOn: number
  sections: StatsGoalSection[]
  completedGoals: StatsCompletedGoal[]
  hasGoals: boolean
}

/**
 * The Stats view, derived from a flat goals + tasks snapshot and a period.
 * Everything is counted from completed task rows, so completed repeatable
 * copies stay in every count — including copies completed under an older
 * title after a rename, because copies keep their historyId grouping.
 */
export function statsViewModel(input: {
  goals: Goal[]
  tasks: Task[]
  period: StatsPeriod
  now: string
}): StatsViewModel {
  const days = PERIOD_DAYS[input.period]
  const start = new Date(Date.parse(input.now) - days * DAY_MS).toISOString()
  const inPeriod = (completedAt: string) => completedAt >= start

  const topGoals = input.goals.filter((goal) => goal.parentId === null)

  const childrenByTask = new Map<string, Task[]>()
  for (const task of input.tasks) {
    if (task.parentId) {
      const siblings = childrenByTask.get(task.parentId) ?? []
      siblings.push(task)
      childrenByTask.set(task.parentId, siblings)
    }
  }

  const subgoalsByParent = new Map<string, Goal[]>()
  for (const goal of input.goals) {
    if (goal.parentId) {
      const siblings = subgoalsByParent.get(goal.parentId) ?? []
      siblings.push(goal)
      subgoalsByParent.set(goal.parentId, siblings)
    }
  }

  // Tasks linked through the goal or its subgoals, plus every subtask below
  // them (a goal link on a top-level task applies to its whole tree).
  const memberTasks = (goal: Goal): Task[] => {
    const goalIds = new Set<string>([goal.id])
    for (const sub of subgoalsByParent.get(goal.id) ?? []) goalIds.add(sub.id)
    const collected: Task[] = []
    const walk = (task: Task) => {
      collected.push(task)
      for (const child of childrenByTask.get(task.id) ?? []) walk(child)
    }
    for (const task of input.tasks) {
      if (task.parentId === null && task.goalIds.some((id) => goalIds.has(id))) {
        walk(task)
      }
    }
    return collected
  }

  let tasksCompleted = 0
  for (const task of input.tasks) {
    if (task.completedAt && inPeriod(task.completedAt)) tasksCompleted += 1
  }

  const sections: StatsGoalSection[] = []
  const completedGoals: StatsCompletedGoal[] = []
  const workedOn = new Set<string>()

  for (const goal of topGoals) {
    const rows = memberTasks(goal)
    const hasPeriodCompletion = rows.some(
      (row) => row.completedAt && inPeriod(row.completedAt),
    )
    const completedInPeriod =
      goal.kind === 'one_shot' &&
      goal.completedAt !== null &&
      inPeriod(goal.completedAt)

    if (hasPeriodCompletion || completedInPeriod) workedOn.add(goal.id)

    if (completedInPeriod) {
      completedGoals.push({
        goalId: goal.id,
        title: goal.title,
        completedAt: goal.completedAt as string,
        day: formatStatsDay(goal.completedAt as string),
      })
    }

    // Sections cover active top-level goals; completed goals are listed under
    // their own heading and archived goals left the picture.
    if (goal.archivedAt || goal.completedAt) continue

    if (goal.kind === 'ongoing') {
      const doneCount = rows.filter((row) => row.completedAt).length
      const liveRepeatables = rows.filter(
        (row) => row.repeatable && !row.completedAt && !row.archivedAt,
      )
      const repeatables = liveRepeatables.map((row) => {
        const count = rows.filter(
          (copy) =>
            copy.historyId === row.historyId &&
            copy.completedAt !== null &&
            inPeriod(copy.completedAt),
        ).length
        return {
          taskId: row.id,
          title: row.title,
          text: repeatableRowText(count, days),
        }
      })
      sections.push({
        goalId: goal.id,
        title: goal.title,
        kind: 'ongoing',
        doneCount,
        repeatables,
      })
    } else {
      // Matches the domain definition of one-shot goal progress (and the
      // store's getGoalProgress the Goals page renders): the denominator is
      // every open task plus every completed copy, so each fresh live
      // repeatable copy keeps the bar below 100 percent.
      const completed = rows.filter((row) => row.completedAt).length
      const total = rows.filter(
        (row) => row.completedAt !== null || row.archivedAt === null,
      ).length
      const percentage = total
        ? Math.floor((completed / total) * 100)
        : 0
      sections.push({
        goalId: goal.id,
        title: goal.title,
        kind: 'one_shot',
        completed,
        total,
        percentage,
      })
    }
  }

  const goalsCompleted = completedGoals.length

  return {
    period: input.period,
    days,
    counterItems: [
      {
        value: tasksCompleted,
        label: tasksCompleted === 1 ? 'task completed' : 'tasks completed',
      },
      {
        value: goalsCompleted,
        label: goalsCompleted === 1 ? 'goal completed' : 'goals completed',
      },
      {
        value: workedOn.size,
        label: workedOn.size === 1 ? 'goal worked on' : 'goals worked on',
      },
    ],
    tasksCompleted,
    goalsCompleted,
    goalsWorkedOn: workedOn.size,
    sections,
    completedGoals,
    hasGoals: topGoals.length > 0,
  }
}
