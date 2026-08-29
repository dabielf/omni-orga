import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { TaskSheet } from '../components/TaskSheet'
import { useCanonicalUrl } from '../components/useCanonicalUrl'
import { recordUrl, sanitizeTasksSearch } from '../lib/urlState'

export const Route = createFileRoute('/tasks/$taskId')({
  validateSearch: sanitizeTasksSearch,
  component: TaskPage,
})

function TaskPage() {
  const { taskId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  useCanonicalUrl(recordUrl('tasks', taskId, search))

  return (
    <TaskSheet
      taskId={taskId}
      onClose={() => navigate({ to: '/tasks', search })}
    />
  )
}
