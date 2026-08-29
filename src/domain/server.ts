import { createServerFn } from '@tanstack/react-start'

import type {
  TasksData,
  TasksActionResult,
  TodayData,
  TodayActionResult,
} from './serverStore'
import type { CreateTaskInput, Task } from './store'

export type { TasksData, TasksActionResult } from './serverStore'

const withTaskId = (input: { taskId: string }) => input

export const loadTasksData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TasksData> => {
    const { snapshot } = await import('./serverStore')
    return snapshot()
  },
)

export const completeTaskAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(async ({ data }): Promise<TasksActionResult> => {
    const { withStore } = await import('./serverStore')
    return withStore((store) => store.completeTask(data.taskId))
  })

export const undoTaskCompletionAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(async ({ data }): Promise<TasksActionResult> => {
    const { withStore } = await import('./serverStore')
    return withStore((store) => store.undoTaskCompletion(data.taskId))
  })

export const planTaskAction = createServerFn({ method: 'POST' })
  .validator((input: { taskId: string; day: string }) => input)
  .handler(async ({ data }): Promise<TasksActionResult> => {
    const { withStore } = await import('./serverStore')
    return withStore((store) => store.planTask(data.taskId, data.day))
  })

export const unplanTaskAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(async ({ data }): Promise<TasksActionResult> => {
    const { withStore } = await import('./serverStore')
    return withStore((store) => store.unplanTask(data.taskId))
  })

export const createTaskAction = createServerFn({ method: 'POST' })
  .validator(
    (input: { task: CreateTaskInput; planForToday?: boolean }) => input,
  )
  .handler(async ({ data }): Promise<TasksActionResult> => {
    const { withStore, localDay } = await import('./serverStore')
    return withStore((store) => {
      // createTask answers the freshly created task.
      const task = store.createTask(data.task) as Task
      if (data.planForToday) {
        store.planTask(task.id, localDay())
      }
    })
  })

export const updateTaskAction = createServerFn({ method: 'POST' })
  .validator(
    (input: {
      taskId: string
      title?: string
      notes?: string
      externalLinks?: string[]
    }) => input,
  )
  .handler(async ({ data }): Promise<TasksActionResult> => {
    const { withStore } = await import('./serverStore')
    return withStore((store) => {
      const { taskId, ...changes } = data
      store.updateTask(taskId, changes)
    })
  })

export const setTaskGoalLinksAction = createServerFn({ method: 'POST' })
  .validator((input: { taskId: string; goalIds: string[] }) => input)
  .handler(async ({ data }): Promise<TasksActionResult> => {
    const { withStore } = await import('./serverStore')
    return withStore((store) => store.setTaskGoalLinks(data.taskId, data.goalIds))
  })

export const setTaskIdealDateAction = createServerFn({ method: 'POST' })
  .validator((input: { taskId: string; value: string | null }) => input)
  .handler(async ({ data }): Promise<TasksActionResult> => {
    const { withStore } = await import('./serverStore')
    return withStore((store) =>
      store.setTaskIdealCompletionDate(data.taskId, data.value))
  })

export const setTaskDeadlineAction = createServerFn({ method: 'POST' })
  .validator((input: { taskId: string; value: string | null }) => input)
  .handler(async ({ data }): Promise<TasksActionResult> => {
    const { withStore } = await import('./serverStore')
    return withStore((store) => store.setTaskDeadline(data.taskId, data.value))
  })

export const archiveTaskAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(async ({ data }): Promise<TasksActionResult> => {
    const { withStore } = await import('./serverStore')
    return withStore((store) => store.archiveTask(data.taskId))
  })

export const restoreTaskAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(async ({ data }): Promise<TasksActionResult> => {
    const { withStore } = await import('./serverStore')
    return withStore((store) => store.restoreTask(data.taskId))
  })

export const deleteTaskAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(async ({ data }): Promise<TasksActionResult> => {
    const { withStore } = await import('./serverStore')
    return withStore((store) => store.deleteTask(data.taskId))
  })

export type { TodayData, TodayActionResult } from './serverStore'

// The server-store module pulls in node-only SQLite code, so every handler
// imports it dynamically to keep the client bundle node-free.

export const loadTodayData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TodayData> => {
    const { todaySnapshot } = await import('./serverStore')
    return todaySnapshot()
  },
)

export const completeTodayTaskAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(async ({ data }): Promise<TodayActionResult> => {
    const { withTodayStore } = await import('./serverStore')
    return withTodayStore((store) => store.completeTask(data.taskId))
  })

export const undoTodayTaskCompletionAction = createServerFn({ method: 'POST' })
  .validator(withTaskId)
  .handler(async ({ data }): Promise<TodayActionResult> => {
    const { withTodayStore } = await import('./serverStore')
    return withTodayStore((store) => store.undoTaskCompletion(data.taskId))
  })

export const reorderTodayAction = createServerFn({ method: 'POST' })
  .validator((input: { taskId: string; afterTaskId: string | null }) => input)
  .handler(async ({ data }): Promise<TodayActionResult> => {
    const { withTodayStore } = await import('./serverStore')
    return withTodayStore((store) =>
      store.reorderToday(data.taskId, data.afterTaskId),
    )
  })
