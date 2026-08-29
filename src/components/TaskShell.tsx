import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { shellGoals } from './shellData'

export type TasksSearch = {
  goal?: string
  available?: '1'
}

function FilterLink({
  label,
  search,
  current,
  taskId,
  toggle = false,
}: {
  label: string
  search: TasksSearch
  current: boolean
  taskId?: string
  /** Toggles stay links when active so they can switch themselves off. */
  toggle?: boolean
}) {
  if (current && !toggle) {
    return (
      <span className="filter-link is-current" aria-current="page">
        {label}
      </span>
    )
  }
  const className = current ? 'filter-link is-current' : 'filter-link'
  const ariaCurrent = current ? 'page' : undefined
  if (taskId) {
    return (
      <Link
        className={className}
        aria-current={ariaCurrent}
        to="/tasks/$taskId"
        params={{ taskId }}
        search={search}
      >
        {label}
      </Link>
    )
  }
  return (
    <Link
      className={className}
      aria-current={ariaCurrent}
      to="/tasks"
      search={search}
    >
      {label}
    </Link>
  )
}

export function TaskShell({
  search,
  taskId,
  children,
}: {
  search: TasksSearch
  taskId?: string
  children: ReactNode
}) {
  const goal = search.goal
  const nextAvailable = search.available ? undefined : '1'


  const railContent = (
    <div className="task-rail-content">
      <p className="rail-label">Goals</p>
      <div className="filter-list">
        <FilterLink
          label="All"
          search={{ available: search.available }}
          current={!goal}
          taskId={taskId}
        />
        <FilterLink
          label="Priority"
          search={{ goal: 'priority', available: search.available }}
          current={goal === 'priority'}
          taskId={taskId}
        />
        {shellGoals.map((item) => (
          <FilterLink
            key={item.id}
            label={item.name}
            search={{ goal: item.id, available: search.available }}
            current={goal === item.id}
            taskId={taskId}
          />
        ))}
      </div>
      <p className="rail-label">Readiness</p>
      <FilterLink
        label={search.available ? 'Show all tasks' : 'Available only'}
        search={{ goal, available: nextAvailable }}
        current={Boolean(search.available)}
        toggle
        taskId={taskId}
      />
    </div>
  )

  return (
    <div className="tasks-layout">
      <div className="task-rail task-rail-plain">{railContent}</div>
      <details className="task-rail task-rail-menu">
        <summary>Filters</summary>
        {railContent}
      </details>
      <div className="task-content">{children}</div>
    </div>
  )
}
