import { createServerFn } from '@tanstack/react-start'

import {
  createDomainStore,
  DomainError,
  type CreateTaskInput,
  type Goal,
  type Task,
} from './store'
// @ts-expect-error The foundation migration runner is a JavaScript module.
import { defaultDatabasePath } from '../db/migrations.mjs'

/**
 * The part of the domain store the Tasks server functions use. Structural, so
 * the store implementation stays free to grow without a shared base type.
 */
type DomainStore = {
  archiveTask(taskId: string, archivedAt?: string): unknown
  completeTask(taskId: string, completedAt?: string): unknown
  createTask(input: CreateTaskInput): unknown
  deleteTask(taskId: string): unknown
  getPreviousCompletion(taskId: string): string | null
  listGoals(input: { includeArchived?: boolean }): Goal[]
  listTasks(input: { includeArchived?: boolean }): Task[]
  planTask(taskId: string, value: string, today?: string): unknown
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

const storeSymbol = Symbol.for('omni-orga.server-store')

/**
 * One store per process, opened at the database the lifecycle server was
 * started with. Migrations are owned by scripts/serve.mjs and are not
 * re-applied here.
 */
export function getServerStore(): DomainStore {
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

export type TasksData = {
  today: string
  goals: Goal[]
  tasks: Task[]
  previous: Record<string, string | null>
}

export type TasksActionResult =
  | ({ ok: true } & TasksData)
  | { ok: false; code: string; message: string }

function localDay() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function snapshot(): TasksData {
  const store = getServerStore()
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
function guard(run: () => unknown): TasksActionResult {
  try {
    run()
    return { ok: true, ...snapshot() }
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

const withTaskId = (input: { taskId: string }) => input

export const loadTasksData = createServerFn({ method: 'GET' }).handler(
  () => snapshot(),
)

export const completeTaskAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(({ data }) => guard(() => getServerStore().completeTask(data.taskId)))

export const undoTaskCompletionAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(({ data }) =>
    guard(() => getServerStore().undoTaskCompletion(data.taskId)))

export const planTaskAction = createServerFn({ method: 'POST' })
  .validator((input: { taskId: string; day: string }) => input)
  .handler(({ data }) =>
    guard(() => getServerStore().planTask(data.taskId, data.day)))

export const unplanTaskAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(({ data }) => guard(() => getServerStore().unplanTask(data.taskId)))

export const createTaskAction = createServerFn({ method: 'POST' })
  .validator(
    (input: { task: CreateTaskInput; planForToday?: boolean }) => input,
  )
  .handler(({ data }) => guard(() => {
    const store = getServerStore()
    const task = store.createTask(data.task) as Task
    if (data.planForToday) store.planTask(task.id, localDay())
  }))

export const updateTaskAction = createServerFn({ method: 'POST' })
  .validator(
    (input: {
      taskId: string
      title?: string
      notes?: string
      externalLinks?: string[]
    }) => input,
  )
  .handler(({ data }) => guard(() => {
    const { taskId, ...changes } = data
    getServerStore().updateTask(taskId, changes)
  }))

export const setTaskGoalLinksAction = createServerFn({ method: 'POST' })
  .validator((input: { taskId: string; goalIds: string[] }) => input)
  .handler(({ data }) =>
    guard(() => getServerStore().setTaskGoalLinks(data.taskId, data.goalIds)))

export const setTaskIdealDateAction = createServerFn({ method: 'POST' })
  .validator((input: { taskId: string; value: string | null }) => input)
  .handler(({ data }) =>
    guard(() =>
      getServerStore().setTaskIdealCompletionDate(data.taskId, data.value)))

export const setTaskDeadlineAction = createServerFn({ method: 'POST' })
  .validator((input: { taskId: string; value: string | null }) => input)
  .handler(({ data }) =>
    guard(() => getServerStore().setTaskDeadline(data.taskId, data.value)))

export const archiveTaskAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(({ data }) => guard(() => getServerStore().archiveTask(data.taskId)))

export const restoreTaskAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(({ data }) => guard(() => getServerStore().restoreTask(data.taskId)))

export const deleteTaskAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(({ data }) => guard(() => getServerStore().deleteTask(data.taskId)))
