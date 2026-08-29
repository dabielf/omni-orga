import { createFileRoute } from '@tanstack/react-router'

import { TasksList } from '../components/TaskList'

export const Route = createFileRoute('/tasks/')({
  component: TasksIndex,
})

function TasksIndex() {
  return <TasksList />
}
