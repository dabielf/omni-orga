import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Page } from '../components/AppShell'
import { ArchivedGoals, GoalsTree } from '../components/GoalList'
import { useGoalsUi } from '../components/goalsContext'

export type GoalsSearch = { view?: 'archived' }

function sanitizeGoalsSearch(search: Record<string, unknown>): GoalsSearch {
  return search.view === 'archived' ? { view: 'archived' } : {}
}

export const Route = createFileRoute('/goals/')({
  validateSearch: sanitizeGoalsSearch,
  component: GoalsIndex,
})

function GoalsIndex() {
  const { openCreate } = useGoalsUi()
  const navigate = useNavigate()
  const { view } = Route.useSearch()
  const showArchived = view === 'archived'

  return (
    <Page title="Goals">
      <div className="goals-topbar">
        <div
          className="segmented"
          role="group"
          aria-label="Show active or archived goals"
        >
          <button
            type="button"
            aria-pressed={!showArchived}
            onClick={() => void navigate({ to: '/goals', search: {} })}
          >
            Active
          </button>
          <button
            type="button"
            aria-pressed={showArchived}
            onClick={() =>
              void navigate({ to: '/goals', search: { view: 'archived' } })
            }
          >
            Archived
          </button>
        </div>
        <button type="button" className="primary-btn" onClick={openCreate}>
          Add goal
        </button>
      </div>
      {showArchived ? <ArchivedGoals /> : <GoalsTree />}
    </Page>
  )
}
