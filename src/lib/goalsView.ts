import type { Goal, GoalProgress, Task } from '../domain/store'

/** Active top-level goals in manual order. */
export function topLevelGoals(goals: Goal[]): Goal[] {
  return goals.filter((goal) => goal.parentId === null)
}

/** Active subgoals directly under a goal, in manual order. */
export function subgoalsOf(goals: Goal[], goalId: string): Goal[] {
  return goals.filter((goal) => goal.parentId === goalId)
}

/**
 * Active goals holding one of the three priority slots. Completed and
 * archived goals free their slot, so they never count.
 */
export function priorityInUse(goals: Goal[]): number {
  return goals.filter(
    (goal) => goal.priority && !goal.completedAt && !goal.archivedAt,
  ).length
}

export type LinkedTaskStatus = 'available' | 'blocked' | 'completed'

export const STATUS_LABEL: Record<LinkedTaskStatus, string> = {
  available: 'Available',
  blocked: 'Blocked',
  completed: 'Done',
}

function taskStatus(task: Task): LinkedTaskStatus {
  if (task.completedAt) return 'completed'
  if (task.blocked) return 'blocked'
  return 'available'
}

export type GoalDetail = {
  goal: Goal
  progress: GoalProgress
  subgoals: Goal[]
  tasks: Array<{ task: Task; status: LinkedTaskStatus }>
}

/**
 * The goal page view, derived from the shared Goals page snapshot. Answers
 * null for a goal that does not exist. Linked tasks are the top-level tasks
 * linked through the goal or its subgoals; archived tasks stay out.
 */
export function goalDetailFromData(
  data: {
    goals: Goal[]
    archivedGoals: Goal[]
    progress: Record<string, GoalProgress>
    tasks: Task[]
  },
  goalId: string,
): GoalDetail | null {
  const goal = [...data.goals, ...data.archivedGoals].find(
    (item) => item.id === goalId,
  )
  if (!goal) return null

  const progress = data.progress[goal.id]
  const subgoals = subgoalsOf(data.goals, goal.id)
  const scope = new Set([goal.id, ...subgoals.map((sub) => sub.id)])
  const tasks = data.tasks
    .filter(
      (task) =>
        !task.parentId &&
        !task.archivedAt &&
        task.goalIds.some((id) => scope.has(id)),
    )
    .map((task) => ({ task, status: taskStatus(task) }))

  return { goal, progress, subgoals, tasks }
}

/** The reversible-completion strip copy for a one-shot goal. */
export function completeWarning(detail: GoalDetail): string {
  const unfinished = detail.tasks.filter(
    (entry) => entry.status !== 'completed',
  ).length
  if (!unfinished) return 'Completing this goal can be undone.'
  const noun = unfinished === 1 ? 'task' : 'tasks'
  return `Completing keeps ${unfinished} unfinished ${noun} active without this goal. You can undo.`
}

/** The delete strip copy: what is destroyed and what is kept. */
export function deleteWarning(detail: GoalDetail): string {
  const subCount = detail.subgoals.length
  const openCount = detail.tasks.filter(
    (entry) => entry.status !== 'completed',
  ).length
  const tree =
    subCount === 0
      ? 'Deletes this goal and its task history.'
      : subCount === 1
        ? 'Deletes this goal, its subgoal, and their task history.'
        : `Deletes this goal, its ${subCount} subgoals, and their task history.`
  const kept =
    openCount === 0
      ? 'Linked tasks are never deleted automatically.'
      : openCount === 1
        ? '1 linked task stays active without a goal.'
        : `${openCount} linked tasks stay active without a goal.`
  return `${tree} ${kept}`
}
