import { Link, createFileRoute } from '@tanstack/react-router'

import { AppShell, EmptyState, Page } from '../components/AppShell'
import { shellTasks } from '../components/shellData'
import { TaskShell } from '../components/TaskShell'
import { useCanonicalUrl } from '../components/useCanonicalUrl'
import { recordUrl, sanitizeTasksSearch, tasksUrl } from '../lib/urlState'

export const Route = createFileRoute('/tasks/$taskId')({
  validateSearch: sanitizeTasksSearch,
  component: TaskPage,
})

function TaskPage() {
  const { taskId } = Route.useParams()
  const search = Route.useSearch()
  const task = shellTasks.find((item) => item.id === taskId)
  useCanonicalUrl(recordUrl('tasks', taskId, search))

  return (
    <AppShell>
      <Page title={task?.name ?? 'Task not found'}>
        <TaskShell search={search} taskId={taskId}>
          {task ? (
            <>
              <p className="state-line">
                <span className="status-dot" aria-hidden="true" />
                {task.available ? 'Available' : 'Blocked'}
              </p>
              <Link className="plain-action" to="/tasks" search={search}>
                Close
              </Link>
            </>
          ) : (
            <EmptyState>
              <p>This task is not available.</p>
              <Link className="plain-action" to={tasksUrl(search)}>
                Tasks
              </Link>
            </EmptyState>
          )}
        </TaskShell>
      </Page>
    </AppShell>
  )
}
