import { createServerFn } from '@tanstack/react-start'

import type { StatsPeriod } from '../lib/urlState'
import type { DomainStore, Goal, Task } from './store'

export type StatsData = {
  period: StatsPeriod
  now: string
  goals: Goal[]
  tasks: Task[]
}

/**
 * One store per process, opened at the database the lifecycle server was
 * started with. The shared singleton from serverStore.ts is imported
 * dynamically inside the handler so the client bundle stays node-free.
 */
async function getStore(): Promise<DomainStore> {
  const { getServerStore } = await import('./serverStore')
  return getServerStore()
}

export const loadStatsData = createServerFn({ method: 'GET' })
  .validator((input: { period: StatsPeriod }) => input)
  .handler(async ({ data }): Promise<StatsData> => {
    const store = await getStore()
    return {
      period: data.period,
      now: new Date().toISOString(),
      goals: store.listGoals({ includeArchived: true }),
      tasks: store.listTasks({ includeArchived: true }),
    }
  })
