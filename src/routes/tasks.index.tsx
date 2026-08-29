import { Link, createFileRoute } from '@tanstack/react-router'

import { AppShell, EmptyState, Page } from '../components/AppShell'
import { shellGoals, shellTasks } from '../components/shellData'
import { TaskShell } from '../components/TaskShell'
import { useCanonicalUrl } from '../components/useCanonicalUrl'
import { sanitizeTasksSearch, tasksUrl } from '../lib/urlState'

export const Route = createFileRoute('/tasks/')({
  validateSearch: sanitizeTasksSearch,
  component: TasksPage,
})

function TasksPage() {
  const search = Route.useSearch()
  useCanonicalUrl(tasksUrl(search))

  const tasks = shellTasks.filter((task) => {
    if (search.available && !task.available) return false
    if (search.goal === 'priority') {
      return shellGoals.some((goal) => goal.id === task.goalId && goal.priority)
    }
    return !search.goal || task.goalId === search.goal
  })

  return (
    <AppShell>
      <Page title="Tasks">
        <TaskShell search={search}>
          {tasks.length ? (
            <ul className="record-list">
              {tasks.map((task) => (
                <li key={task.id}>
                  <Link
                    className="record-row"
                    to="/tasks/$taskId"
                    params={{ taskId: task.id }}
                    search={search}
                  >
                    <span>{task.name}</span>
                    <span className="state-label">
                      {task.available ? 'Available' : 'Blocked'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>
              <p>No tasks match these filters.</p>
              <Link className="plain-action" to="/tasks" search={{}}>
                Show all tasks
              </Link>
            </EmptyState>
          )}
        </TaskShell>
      </Page>
    </AppShell>
  )
}
