import { createServerFn } from '@tanstack/react-start'

import type { CreateGoalInput, Goal, GoalProgress, Task } from './store'

export type GoalsData = {
  /** Active goals (completed ones included) in manual order. */
  goals: Goal[]
  archivedGoals: Goal[]
  progress: Record<string, GoalProgress>
  tasks: Task[]
}

export type GoalsActionResult =
  | ({ ok: true } & GoalsData)
  | { ok: false; code: string; message: string }

/**
 * The part of the domain store the Goals server functions use, including the
 * goal seams this ticket added (reorderGoals, moveGoal). Structural, so the
 * store implementation stays free to grow without a shared base type.
 */
type GoalStore = {
  archiveGoal(goalId: string): unknown
  completeGoal(goalId: string): unknown
  createGoal(input: CreateGoalInput): unknown
  deleteGoal(goalId: string): unknown
  getGoalProgress(goalId: string): GoalProgress
  listGoals(input: {
    includeArchived?: boolean
    parentId?: string | null
  }): Goal[]
  listTasks(input: { includeArchived?: boolean }): Task[]
  moveGoal(goalId: string, parentId: string | null): unknown
  reorderGoals(goalId: string, afterGoalId: string | null): unknown
  reopenGoal(goalId: string): unknown
  restoreGoal(goalId: string): unknown
  setGoalPriority(goalId: string, priority: boolean): unknown
  updateGoal(goalId: string, input: { title?: string; kind?: 'one_shot' | 'ongoing' }): unknown
}

/**
 * One store per process, opened at the database the lifecycle server was
 * started with. The shared singleton from serverStore.ts is imported
 * dynamically inside the handlers so the client bundle stays node-free.
 */
async function getStore(): Promise<GoalStore> {
  const { getServerStore } = await import('./serverStore')
  return (await getServerStore()) as unknown as GoalStore
}

async function goalsSnapshot(): Promise<GoalsData> {
  const store = await getStore()
  const everyGoal = store.listGoals({ includeArchived: true })
  const goals: Goal[] = []
  const archivedGoals: Goal[] = []
  for (const goal of everyGoal) {
    if (goal.archivedAt) archivedGoals.push(goal)
    else goals.push(goal)
  }
  const progress: Record<string, GoalProgress> = {}
  for (const goal of everyGoal) {
    progress[goal.id] = store.getGoalProgress(goal.id)
  }
  return {
    goals,
    archivedGoals,
    progress,
    tasks: store.listTasks({ includeArchived: true }),
  }
}

/** Runs a domain change and answers with a fresh snapshot or a factual error. */
async function withGoals(
  run: (store: GoalStore) => unknown | Promise<unknown>,
): Promise<GoalsActionResult> {
  try {
    const store = await getStore()
    await run(store)
    return { ok: true, ...(await goalsSnapshot()) }
  } catch (error) {
    const { DomainError } = await import('./store')
    if (error instanceof DomainError) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
      }
    }
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'The change was not saved.',
    }
  }
}

const withGoalId = (input: { goalId: string }) => input

export const loadGoalsData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GoalsData> => {
    return goalsSnapshot()
  },
)

export const createGoalAction = createServerFn({ method: 'POST' })
  .validator((input: { goal: CreateGoalInput }) => input)
  .handler(async ({ data }): Promise<GoalsActionResult> => {
    return withGoals((store) => store.createGoal(data.goal))
  })

export const updateGoalAction = createServerFn({ method: 'POST' })
  .validator(
    (input: {
      goalId: string
      title?: string
      kind?: 'one_shot' | 'ongoing'
    }) => input,
  )
  .handler(async ({ data }): Promise<GoalsActionResult> => {
    return withGoals((store) => {
      const { goalId, ...changes } = data
      store.updateGoal(goalId, changes)
    })
  })

export const setGoalPriorityAction = createServerFn({ method: 'POST' })
  .validator((input: { goalId: string; priority: boolean }) => input)
  .handler(async ({ data }): Promise<GoalsActionResult> => {
    return withGoals((store) =>
      store.setGoalPriority(data.goalId, data.priority),
    )
  })

export const completeGoalAction = createServerFn({ method: 'POST' })
  .validator(withGoalId)
  .handler(async ({ data }): Promise<GoalsActionResult> => {
    return withGoals((store) => store.completeGoal(data.goalId))
  })

export const reopenGoalAction = createServerFn({ method: 'POST' })
  .validator(withGoalId)
  .handler(async ({ data }): Promise<GoalsActionResult> => {
    return withGoals((store) => store.reopenGoal(data.goalId))
  })

export const archiveGoalAction = createServerFn({ method: 'POST' })
  .validator(withGoalId)
  .handler(async ({ data }): Promise<GoalsActionResult> => {
    return withGoals((store) => store.archiveGoal(data.goalId))
  })

export const restoreGoalAction = createServerFn({ method: 'POST' })
  .validator(withGoalId)
  .handler(async ({ data }): Promise<GoalsActionResult> => {
    return withGoals((store) => store.restoreGoal(data.goalId))
  })

export const deleteGoalAction = createServerFn({ method: 'POST' })
  .validator(withGoalId)
  .handler(async ({ data }): Promise<GoalsActionResult> => {
    return withGoals((store) => store.deleteGoal(data.goalId))
  })

export const reorderGoalsAction = createServerFn({ method: 'POST' })
  .validator((input: { goalId: string; afterGoalId: string | null }) => input)
  .handler(async ({ data }): Promise<GoalsActionResult> => {
    return withGoals((store) =>
      store.reorderGoals(data.goalId, data.afterGoalId),
    )
  })

export const moveGoalAction = createServerFn({ method: 'POST' })
  .validator((input: { goalId: string; parentId: string | null }) => input)
  .handler(async ({ data }): Promise<GoalsActionResult> => {
    return withGoals((store) => store.moveGoal(data.goalId, data.parentId))
  })
