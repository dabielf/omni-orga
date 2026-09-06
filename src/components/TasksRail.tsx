import { Link } from '@tanstack/react-router'

import {
  tasksHeading,
  type TasksData,
} from '../lib/tasksView'
import { tasksUrl, type TasksSearch } from '../lib/urlState'
import { useTasksUi } from './tasksContext'

function railLinkClass(current: boolean) {
  return current ? 'filter-link is-current' : 'filter-link'
}

function GoalRows({
  data,
  search,
  expanded,
  toggle,
}: {
  data: TasksData
  search: TasksSearch
  expanded: Set<string>
  toggle: (goalId: string) => void
}) {
  const topLevel = data.goals.filter((goal) => !goal.parentId && !goal.completedAt && !goal.archivedAt)
  return topLevel.map((goal) => {
    const subgoals = data.goals.filter((item) => item.parentId === goal.id && !item.completedAt && !item.archivedAt)
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
        ) : null}
        <Link
          className={railLinkClass(search.goal === goal.id)}
          aria-current={search.goal === goal.id ? 'page' : undefined}
          to="/tasks"
          search={{ ...search, goal: goal.id, view: undefined }}
        >
          {goal.title}
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
  const keepFilters = { available: search.available, ideal: search.ideal }

  const railContent = (
    <div className="task-rail-content">

      <div className="filter-list">
        <Link
          className={railLinkClass(!search.goal && !search.view)}
          aria-current={!search.goal && !search.view ? 'page' : undefined}
          to="/tasks"
          search={{ ...keepFilters, goal: undefined, view: undefined }}
        >
          All tasks
        </Link>
        <Link
          className={railLinkClass(search.goal === 'priority')}
          aria-current={search.goal === 'priority' ? 'page' : undefined}
          to="/tasks"
          search={{ ...keepFilters, goal: 'priority', view: undefined }}
        >
          Priority goals
        </Link>
        <Link
          className={railLinkClass(search.goal === 'none')}
          aria-current={search.goal === 'none' ? 'page' : undefined}
          to="/tasks"
          search={{ ...keepFilters, goal: 'none', view: undefined }}
        >
          No goal
        </Link>
      </div>
      <p className="rail-label">Goals</p>
      <div className="filter-list">
        <GoalRows
          data={data}
          search={search}
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
        </Link>
        <Link
          className={railLinkClass(search.view === 'archived')}
          aria-current={search.view === 'archived' ? 'page' : undefined}
          to="/tasks"
          search={{ ...keepFilters, view: 'archived' }}
        >
          Archived
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
        <summary aria-label="Task views">{tasksHeading(data.goals, search)}</summary>
        {railContent}
      </details>
    </>
  )
}
