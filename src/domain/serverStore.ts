import { createDomainStore, DomainError, type CreateTaskInput, type Goal, type Task } from './store'
// @ts-expect-error The foundation migration runner is a JavaScript module.
import { defaultDatabasePath } from '../db/migrations.mjs'

/**
 * The part of the domain store the Tasks server functions use. Structural, so
 * the store implementation stays free to grow without a shared base type.
 */
export type DomainStore = {
  archiveTask(taskId: string, archivedAt?: string): unknown
  completeTask(taskId: string, completedAt?: string): unknown
  createTask(input: CreateTaskInput): unknown
  deleteTask(taskId: string): unknown
  getPreviousCompletion(taskId: string): string | null
  listGoals(input: { includeArchived?: boolean }): Goal[]
  listTasks(input: { includeArchived?: boolean }): Task[]
  getToday(day?: string): { open: Task[]; completed: Task[] }
  planTask(taskId: string, value: string, today?: string): unknown
  reorderToday(taskId: string, afterTaskId: string | null): unknown
  restoreTask(taskId: string): unknown
  setTaskDeadline(taskId: string, value: string | null): unknown
  setTaskGoalLinks(taskId: string, goalIds: string[]): unknown
  setTaskIdealCompletionDate(taskId: string, value: string | null): unknown
  undoTaskCompletion(taskId: string): unknown
  unplanTask(taskId: string): unknown
  updateTask(
    taskId: string,
    input: { title?: string; notes?: string; externalLinks?: string[] },
  ): unknown
}

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
  return {
    today,
    goals: store
      .listGoals({})
      .filter((goal) => !goal.completedAt && !goal.archivedAt),
    open,
    completed,
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
