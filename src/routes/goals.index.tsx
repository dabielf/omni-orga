import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { Page } from '../components/AppShell'
import { ArchivedGoals, GoalsTree } from '../components/GoalList'
import { useGoalsUi } from '../components/goalsContext'

export const Route = createFileRoute('/goals/')({ component: GoalsIndex })

function GoalsIndex() {
  const { openCreate } = useGoalsUi()
  const [showArchived, setShowArchived] = useState(false)

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
            onClick={() => setShowArchived(false)}
          >
            Active
          </button>
          <button
            type="button"
            aria-pressed={showArchived}
            onClick={() => setShowArchived(true)}
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
