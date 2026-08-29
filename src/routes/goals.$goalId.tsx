import { Link, createFileRoute } from '@tanstack/react-router'

import { AppShell, EmptyState, Page } from '../components/AppShell'
import { shellGoals } from '../components/shellData'

export const Route = createFileRoute('/goals/$goalId')({
  component: GoalPage,
})

function GoalPage() {
  const { goalId } = Route.useParams()
  const goal = shellGoals.find((item) => item.id === goalId)

  return (
    <AppShell>
      {goal ? (
        <Page title={goal.name}>
          <p className="state-line">
            <span className="status-dot" aria-hidden="true" />
            {goal.priority ? 'Priority goal' : 'Active goal'}
          </p>
          <Link className="plain-action" to="/goals">
            Close
          </Link>
        </Page>
      ) : (
        <Page title="Goal not found">
          <EmptyState>
            <p>This goal does not exist.</p>
            <Link className="plain-action" to="/goals">
              Goals
            </Link>
          </EmptyState>
        </Page>
      )}
    </AppShell>
  )
}
