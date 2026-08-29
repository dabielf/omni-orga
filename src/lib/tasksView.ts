import type { Goal, Task } from '../domain/store'

export type TasksData = {
  today: string
  goals: Goal[]
  tasks: Task[]
  previous: Record<string, string | null>
}

export type TasksFilter = {
  goal?: string
  available?: '1'
  ideal?: string
  view?: string
}

export type AvailableRow = {
  task: Task
  root: Task
  /** Ancestor titles from the tree root down to this row's parent. */
  path: string[]
}

export type TreeRow = {
  task: Task
  rootId: string
  depth: number
  /** Titles of nonmatching ancestors between the row and its rendered parent. */
  path: string[]
  /** Ids of rendered ancestors the UI may collapse. */
  ancestorIds: string[]
}

export type RailCounts = {
  all: number
  priority: number
  none: number
  goals: Record<string, number>
  completed: number
  archived: number
}

export function childrenOf(tasks: Task[]) {
  const children = new Map<string | null, Task[]>()
  for (const task of tasks) {
    const siblings = children.get(task.parentId) ?? []
    siblings.push(task)
    children.set(task.parentId, siblings)
  }
  return children
}

/** A link to a subgoal also counts once for its parent goal. */
export function taskInGoalScope(
  task: Task,
  goalId: string,
  goalIndex: Map<string, Goal>,
) {
  return task.goalIds.some((linked) => {
    if (linked === goalId) return true
    return goalIndex.get(linked)?.parentId === goalId
  })
}

export function taskInPriorityScope(task: Task, goalIndex: Map<string, Goal>) {
  return task.goalIds.some((linked) => {
    const goal = goalIndex.get(linked)
    if (!goal) return false
    return (
      goal.priority ||
      Boolean(goal.parentId && goalIndex.get(goal.parentId)?.priority)
    )
  })
}

function goalsById(goals: Goal[]) {
  return new Map(goals.map((goal) => [goal.id, goal]))
}

function goalFilterMatches(
  task: Task,
  filter: TasksFilter,
  goalIndex: Map<string, Goal>,
) {
  if (!filter.goal || filter.goal === 'all') return true
  if (filter.goal === 'priority') return taskInPriorityScope(task, goalIndex)
  if (filter.goal === 'none') return task.goalIds.length === 0
  return taskInGoalScope(task, filter.goal, goalIndex)
}

export function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function idealMatches(task: Task, preset: unknown, today: string) {
  if (!preset || preset === 'any') return true
  const ideal = task.idealCompletionDate
  if (preset === 'none') return ideal === null
  if (!ideal) return false
  if (preset === 'today') return ideal === today
  if (preset === 'week') return ideal >= today && ideal <= addDays(today, 6)
  if (preset === 'passed') return ideal < today
  return false
}

export function remainingCount(
  task: Task,
  children: Map<string | null, Task[]>,
) {
  let count = 0
  const walk = (parentId: string) => {
    for (const child of children.get(parentId) ?? []) {
      if (child.archivedAt) continue
      if (!child.completedAt) count += 1
      walk(child.id)
    }
  }
  walk(task.id)
  return count
}

export function railCounts(data: TasksData): RailCounts {
  const goalIndex = goalsById(data.goals)
  const active = data.tasks.filter(
    (task) => !task.parentId && !task.completedAt && !task.archivedAt,
  )
  const counts: RailCounts = {
    all: active.length,
    priority: 0,
    none: 0,
    goals: {},
    completed: data.tasks.filter(
      (task) => !task.parentId && task.completedAt && !task.archivedAt,
    ).length,
    archived: data.tasks.filter((task) => !task.parentId && task.archivedAt)
      .length,
  }
  for (const task of active) {
    if (taskInPriorityScope(task, goalIndex)) counts.priority += 1
    if (task.goalIds.length === 0) counts.none += 1
  }
  for (const goal of data.goals) {
    counts.goals[goal.id] = active.filter((task) =>
      taskInGoalScope(task, goal.id, goalIndex),
    ).length
  }
  return counts
}

export function availableRows(data: TasksData, filter: TasksFilter) {
  const goalIndex = goalsById(data.goals)
  const children = childrenOf(data.tasks)
  const rows: AvailableRow[] = []
  const walk = (node: Task, root: Task, path: string[]) => {
    if (node.archivedAt) return
    if (node.available && idealMatches(node, filter.ideal, data.today)) {
      rows.push({ task: node, root, path })
    }
    if (node.completedAt) return
    for (const child of children.get(node.id) ?? []) {
      walk(child, root, [...path, node.title])
    }
  }
  for (const task of data.tasks) {
    if (task.parentId || task.completedAt || task.archivedAt) continue
    if (!goalFilterMatches(task, filter, goalIndex)) continue
    walk(task, task, [])
  }
  return rows
}

export function treeRows(data: TasksData, filter: TasksFilter) {
  const goalIndex = goalsById(data.goals)
  const children = childrenOf(data.tasks)
  const matches = (task: Task) =>
    !task.completedAt &&
    !task.archivedAt &&
    idealMatches(task, filter.ideal, data.today)
  const rows: TreeRow[] = []
  const walk = (
    node: Task,
    rootId: string,
    depth: number,
    hiddenPath: string[],
    ancestors: string[],
  ) => {
    if (node.archivedAt) return
    const matched = matches(node)
    if (matched) {
      rows.push({
        task: node,
        rootId,
        depth,
        path: hiddenPath,
        ancestorIds: ancestors,
      })
    }
    const childPath = matched ? [] : [...hiddenPath, node.title]
    const childAncestors = matched ? [...ancestors, node.id] : ancestors
    const childDepth = matched ? depth + 1 : depth
    for (const child of children.get(node.id) ?? []) {
      walk(child, rootId, childDepth, childPath, childAncestors)
    }
  }
  for (const task of data.tasks) {
    if (task.parentId || task.completedAt || task.archivedAt) continue
    if (!goalFilterMatches(task, filter, goalIndex)) continue
    walk(task, task.id, 0, [], [])
  }
  return rows
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayParts(day: string) {
  const date = new Date(`${day}T00:00:00Z`)
  return {
    weekday: DAYS[date.getUTCDay()],
    month: MONTHS[date.getUTCMonth()],
    dayOfMonth: date.getUTCDate(),
  }
}

export function formatDay(day: string, today: string) {
  if (day === today) return 'Today'
  if (day === addDays(today, 1)) return 'Tomorrow'
  const { weekday, month, dayOfMonth } = dayParts(day)
  return `${weekday} ${month} ${dayOfMonth}`
}

export function formatShortDate(day: string) {
  const { month, dayOfMonth } = dayParts(day)
  return `${month} ${dayOfMonth}`
}
