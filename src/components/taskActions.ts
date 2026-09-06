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
const pending = new Set<string>()

export async function toggleTaskComplete(
  task: { id: string; repeatable: boolean; completedAt: string | null },
  ui: TaskUi,
) {
  if (pending.has(task.id)) return
  pending.add(task.id)
  try {
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
        try {
        const undo = await undoTaskCompletionAction({
          data: { taskId: task.id },
        })
        if (undo.ok) ui.applyData(undo)
        else ui.notify(undo.message)
        } catch { ui.notify('The completion was not undone. Try again.') }
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
  } catch { ui.notify('The change was not saved. Try again.') }
  finally { pending.delete(task.id) }
}
