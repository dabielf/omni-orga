import { createContext, useContext } from 'react'

import type { TasksActionResult, TasksData } from '../domain/server'
import type { TasksSearch } from '../lib/urlState'

export type TasksUi = {
  data: TasksData
  /** Reloads route data after a successful mutation. The snapshot is not reused. */
  applyData: (data: TasksData) => void
  notify: (message: string, undo?: () => void) => void
  search: TasksSearch
  treeExpansion: {
    expanded: Set<string>
    toggle: (taskId: string) => void
  }
  goalExpansion: {
    expanded: Set<string>
    toggle: (goalId: string) => void
  }
  openCreate: () => void
}

export const TasksUiContext = createContext<TasksUi | null>(null)

export function useTasksUi(): TasksUi {
  const context = useContext(TasksUiContext)
  if (!context) {
    throw new Error('Tasks components must render inside the Tasks page')
  }
  return context
}
