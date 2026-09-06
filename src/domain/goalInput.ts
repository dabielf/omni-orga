import type { GoalTaskDisposition } from './store'

/** Parse the untrusted removal payload before it reaches a transaction. */
export function validateGoalRemoval(input: unknown): { goalId: string; linkedTasks: Record<string, GoalTaskDisposition> } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid goal change.')
  const value = input as Record<string, unknown>
  if (typeof value.goalId !== 'string' || !value.goalId.trim()) throw new Error('Choose a goal.')
  const choices = value.linkedTasks ?? {}
  if (typeof choices !== 'object' || Array.isArray(choices)) throw new Error('Invalid task choices.')
  const linkedTasks: Record<string, GoalTaskDisposition> = Object.create(null)
  for (const [id, choice] of Object.entries(choices)) {
    if (!id || !choice || typeof choice !== 'object' || Array.isArray(choice)) throw new Error('Invalid task choice.')
    const item = choice as Record<string, unknown>
    if (item.action === 'keep_active' || item.action === 'archive') linkedTasks[id] = { action: item.action }
    else if (item.action === 'link' && typeof item.goalId === 'string' && item.goalId.trim()) linkedTasks[id] = { action: 'link', goalId: item.goalId }
    else throw new Error('Choose how to handle each task.')
  }
  return { goalId: value.goalId, linkedTasks }
}
