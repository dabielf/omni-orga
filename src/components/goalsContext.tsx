import { createContext, useContext } from 'react'

import type { GoalsData } from '../domain/goalServer'

export type GoalsNotice = {
  message: string
  actionLabel?: string
  undo?: () => void
}

export type GoalsUi = {
  data: GoalsData
  /** Replaces the page data with a fresh snapshot from a mutation. */
  applyData: (data: GoalsData) => void
  notify: (message: string, options?: Omit<GoalsNotice, 'message'>) => void
  /** Top-level goals collapsed in the tree; subgoals show by default. */
  collapsed: Set<string>
  toggleCollapsed: (goalId: string) => void
  openCreate: () => void
}

export const GoalsUiContext = createContext<GoalsUi | null>(null)

export function useGoalsUi(): GoalsUi {
  const context = useContext(GoalsUiContext)
  if (!context) {
    throw new Error('Goals components must render inside the Goals page')
  }
  return context
}
