import { createFileRoute } from '@tanstack/react-router'

import { GoalDetailView } from '../components/GoalDetail'

export const Route = createFileRoute('/goals/$goalId')({
  component: GoalPage,
})

function GoalPage() {
  const { goalId } = Route.useParams()
  return <GoalDetailView goalId={goalId} />
}
