import {
  completeTaskAction,
  undoTaskCompletionAction,
  type TasksData,
} from '../domain/server'

type TaskUi = {
  applyData: (data: TasksData) => void
  notify: (message: string, undo?: () => void) => void
}

/** Completes or reopens a task and offers Undo where it is reversible. */
export async function toggleTaskComplete(
  task: { id: string; repeatable: boolean; completedAt: string | null },
  ui: TaskUi,
) {
  if (!task.completedAt) {
    const result = await completeTaskAction({ data: { taskId: task.id } })
    if (!result.ok) {
      ui.notify(result.message)
      return
    }
    ui.applyData(result)
    ui.notify(
      task.repeatable
        ? 'Task completed. A fresh copy is ready.'
        : 'Task completed.',
      async () => {
        const undo = await undoTaskCompletionAction({
          data: { taskId: task.id },
        })
        if (undo.ok) ui.applyData(undo)
        else ui.notify(undo.message)
      },
    )
    return
  }
  const result = await undoTaskCompletionAction({ data: { taskId: task.id } })
  if (!result.ok) {
    ui.notify(result.message)
    return
  }
  ui.applyData(result)
  ui.notify('Task reopened.')
}
