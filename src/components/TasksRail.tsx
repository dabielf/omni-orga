import { Link } from '@tanstack/react-router'

import {
  railCounts,
  type RailCounts,
  type TasksData,
} from '../lib/tasksView'
import { tasksUrl, type TasksSearch } from '../lib/urlState'
import { useTasksUi } from './tasksContext'

function RailCount({ value }: { value: number }) {
  return <span className="rail-count">{value}</span>
}

function railLinkClass(current: boolean) {
  return current ? 'filter-link is-current' : 'filter-link'
}

function GoalRows({
  data,
  search,
  counts,
  expanded,
  toggle,
}: {
  data: TasksData
  search: TasksSearch
  counts: RailCounts
  expanded: Set<string>
  toggle: (goalId: string) => void
}) {
  const topLevel = data.goals.filter((goal) => !goal.parentId)
  return topLevel.map((goal) => {
    const subgoals = data.goals.filter((item) => item.parentId === goal.id)
    const isOpen = expanded.has(goal.id)
    const rows = [
      <div className="rail-goal-row" key={goal.id}>
        {subgoals.length ? (
          <button
            type="button"
            className="rail-disclosure"
            aria-expanded={isOpen}
            aria-label={
              isOpen ? `Collapse ${goal.title}` : `Expand ${goal.title}`
            }
            onClick={() => toggle(goal.id)}
          >
            ›
          </button>
        ) : (
          <span className="rail-disclosure" aria-hidden="true" />
        )}
        <Link
          className={railLinkClass(search.goal === goal.id)}
          aria-current={search.goal === goal.id ? 'page' : undefined}
          to="/tasks"
          search={{ ...search, goal: goal.id, view: undefined }}
        >
          {goal.title}
          <RailCount value={counts.goals[goal.id] ?? 0} />
        </Link>
      </div>,
    ]
    if (subgoals.length && isOpen) {
      rows.push(
        <div className="rail-children" key={`${goal.id}-children`}>
          {subgoals.map((subgoal) => (
            <Link
              key={subgoal.id}
              className={railLinkClass(search.goal === subgoal.id)}
              aria-current={search.goal === subgoal.id ? 'page' : undefined}
              to="/tasks"
              search={{ ...search, goal: subgoal.id, view: undefined }}
            >
              {subgoal.title}
              <RailCount value={counts.goals[subgoal.id] ?? 0} />
            </Link>
          ))}
        </div>,
      )
    }
    return rows
  })
}

export function TasksRail() {
  const { data, search, goalExpansion } = useTasksUi()
  const counts = railCounts(data)
  const keepFilters = { available: search.available, ideal: search.ideal }

  const railContent = (
    <div className="task-rail-content">
      <p className="rail-label">Views</p>
      <div className="filter-list">
        <Link
          className={railLinkClass(!search.goal && !search.view)}
          aria-current={!search.goal && !search.view ? 'page' : undefined}
          to="/tasks"
          search={{ ...keepFilters, goal: undefined, view: undefined }}
        >
          All tasks
          <RailCount value={counts.all} />
        </Link>
        <Link
          className={railLinkClass(search.goal === 'priority')}
          aria-current={search.goal === 'priority' ? 'page' : undefined}
          to="/tasks"
          search={{ ...keepFilters, goal: 'priority', view: undefined }}
        >
          Priority goals
          <RailCount value={counts.priority} />
        </Link>
        <Link
          className={railLinkClass(search.goal === 'none')}
          aria-current={search.goal === 'none' ? 'page' : undefined}
          to="/tasks"
          search={{ ...keepFilters, goal: 'none', view: undefined }}
        >
          No goal
          <RailCount value={counts.none} />
        </Link>
      </div>
      <p className="rail-label">Goals</p>
      <div className="filter-list">
        <GoalRows
          data={data}
          search={search}
          counts={counts}
          expanded={goalExpansion.expanded}
          toggle={goalExpansion.toggle}
        />
      </div>
      <p className="rail-label">History</p>
      <div className="filter-list">
        <Link
          className={railLinkClass(search.view === 'completed')}
          aria-current={search.view === 'completed' ? 'page' : undefined}
          to="/tasks"
          search={{ ...keepFilters, view: 'completed' }}
        >
          Completed
          <RailCount value={counts.completed} />
        </Link>
        <Link
          className={railLinkClass(search.view === 'archived')}
          aria-current={search.view === 'archived' ? 'page' : undefined}
          to="/tasks"
          search={{ ...keepFilters, view: 'archived' }}
        >
          Archived
          <RailCount value={counts.archived} />
        </Link>
      </div>
    </div>
  )

  return (
    <>
      <nav className="task-rail task-rail-plain" aria-label="Task views">
        {railContent}
      </nav>
      <details className="task-rail task-rail-menu">
        <summary>Views</summary>
        {railContent}
      </details>
    </>
  )
}
