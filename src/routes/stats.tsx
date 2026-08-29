import { Link, createFileRoute } from '@tanstack/react-router'

import { AppShell, EmptyState, Page } from '../components/AppShell'
import { useCanonicalUrl } from '../components/useCanonicalUrl'
import { sanitizeStatsSearch, statsUrl } from '../lib/urlState'

export const Route = createFileRoute('/stats')({
  validateSearch: sanitizeStatsSearch,
  component: StatsPage,
})

function StatsPage() {
  const search = Route.useSearch()
  useCanonicalUrl(statsUrl(search))

  return (
    <AppShell>
      <Page title="Stats">
        <nav className="segmented-links" aria-label="Stats period">
          <Link to="/stats" search={{ period: 'week' }}>
            Week
          </Link>
          <Link to="/stats" search={{}} activeOptions={{ exact: true }}>
            Month
          </Link>
          <Link to="/stats" search={{ period: 'year' }}>
            Year
          </Link>
        </nav>
        <EmptyState>
          <p>No completed tasks in this period.</p>
          <Link className="plain-action" to="/tasks">
            Open Tasks
          </Link>
        </EmptyState>
      </Page>
    </AppShell>
  )
}
