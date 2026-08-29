import { Link, createFileRoute } from '@tanstack/react-router'

import { AppShell, Page } from '../components/AppShell'
import { shellGoals } from '../components/shellData'

export const Route = createFileRoute('/goals/')({ component: GoalsPage })

function GoalsPage() {
  return (
    <AppShell>
      <Page title="Goals">
        <ul className="record-list">
          {shellGoals.map((goal) => (
            <li key={goal.id}>
              <Link
                className="record-row"
                to="/goals/$goalId"
                params={{ goalId: goal.id }}
              >
                <span>{goal.name}</span>
                <span className="state-label">
                  {goal.priority ? 'Priority' : 'Active'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Page>
    </AppShell>
  )
}
