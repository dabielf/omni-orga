import { createDomainStore, DomainError, type DomainStore, type Goal, type Task } from './store'
// @ts-expect-error The foundation migration runner is a JavaScript module.
import { defaultDatabasePath } from '../db/migrations.mjs'

export type TasksData = {
  today: string
  goals: Goal[]
  tasks: Task[]
  previous: Record<string, string | null>
}

export type TasksActionResult =
  | ({ ok: true } & TasksData)
  | { ok: false; code: string; message: string }

const storeSymbol = Symbol.for('omni-orga.server-store')

/**
 * One store per process, opened at the database the lifecycle server was
 * started with. Migrations are owned by scripts/serve.mjs and are not
 * re-applied here. This module is only ever loaded on the server; the Tasks
 * server functions import it dynamically inside their handlers.
 */
export async function getServerStore(): Promise<DomainStore> {
  const globals = globalThis as typeof globalThis & {
    [storeSymbol]?: DomainStore
  }
  if (!globals[storeSymbol]) {
    globals[storeSymbol] = createDomainStore(
      process.env.OMNI_ORGA_DATABASE_PATH ?? defaultDatabasePath,
    )
  }
  return globals[storeSymbol]
}

export function localDay() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export async function snapshot(): Promise<TasksData> {
  const store = await getServerStore()
  const tasks = store.listTasks({ includeArchived: true })
  const previous: Record<string, string | null> = {}
  for (const task of tasks) {
    if (task.repeatable && !task.parentId) {
      previous[task.id] = store.getPreviousCompletion(task.id)
    }
  }
  return {
    today: localDay(),
    goals: store.listGoals({}),
    tasks,
    previous,
  }
}

/** Runs a domain change and answers with a fresh snapshot or a factual error. */
export async function withStore(
  run: (store: DomainStore) => unknown | Promise<unknown>,
): Promise<TasksActionResult> {
  try {
    const store = await getServerStore()
    await run(store)
    return { ok: true, ...(await snapshot()) }
  } catch (error) {
    const domainError = error as DomainError
    if (domainError instanceof DomainError) {
      return {
        ok: false,
        code: domainError.code,
        message: domainError.message,
      }
    }
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'The change was not saved.',
    }
  }
}

export type TodayData = {
  today: string
  goals: Goal[]
  open: Task[]
  completed: Task[]
}

export type TodayActionResult =
  | ({ ok: true } & TodayData)
  | { ok: false; code: string; message: string }

/** The Today answer of the store: active goals plus today's open and completed tasks. */
export async function todaySnapshot(): Promise<TodayData> {
  const store = await getServerStore()
  const today = localDay()
  const { open, completed } = store.getToday(today)
  // Ancestors need not be on Today. Resolve their links before sending this subset.
  const withGoalLinks = (task: Task): Task => {
    let root = task
    while (root.parentId) root = store.getTask(root.parentId)
    return root === task ? task : { ...task, goalIds: root.goalIds }
  }
  return {
    today,
    goals: store
      .listGoals({})
      .filter((goal) => !goal.completedAt && !goal.archivedAt),
    open: open.map(withGoalLinks),
    completed: completed.map(withGoalLinks),
  }
}

/** Runs a domain change and answers with a fresh Today snapshot or a factual error. */
export async function withTodayStore(
  run: (store: DomainStore) => unknown | Promise<unknown>,
): Promise<TodayActionResult> {
  try {
    const store = await getServerStore()
    await run(store)
    return { ok: true, ...(await todaySnapshot()) }
  } catch (error) {
    const domainError = error as DomainError
    if (domainError instanceof DomainError) {
      return {
        ok: false,
        code: domainError.code,
        message: domainError.message,
      }
    }
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'The change was not saved.',
    }
  }
}
