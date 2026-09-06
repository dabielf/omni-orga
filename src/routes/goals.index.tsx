import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { ArchivedGoals, GoalsTree } from '../components/GoalList'
import { priorityInUse } from '../lib/goalsView'
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
  const { openCreate, data } = useGoalsUi()
  const navigate = useNavigate()
  const { view } = Route.useSearch()
  const showArchived = view === 'archived'

  return (
    <div className="page goals-index-page">
      <header className="goals-heading"><h1>Goals</h1><button type="button" className="primary-btn" onClick={openCreate}>New goal</button></header>
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

      </div>
      {!showArchived ? <p className="goal-priority-count">{priorityInUse(data.goals)} priority goals{priorityInUse(data.goals) === 3 ? <span> · All 3 priority slots are in use</span> : null}</p> : null}
      {showArchived ? <ArchivedGoals /> : <GoalsTree />}
    </div>
  )
}
