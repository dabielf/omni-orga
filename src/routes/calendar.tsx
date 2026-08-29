import { Link, createFileRoute } from '@tanstack/react-router'

import { AppShell, EmptyState, Page } from '../components/AppShell'
import { useCanonicalUrl } from '../components/useCanonicalUrl'
import { calendarUrl, sanitizeCalendarSearch } from '../lib/urlState'

export const Route = createFileRoute('/calendar')({
  validateSearch: sanitizeCalendarSearch,
  component: CalendarPage,
})

function CalendarPage() {
  const search = Route.useSearch()
  useCanonicalUrl(calendarUrl(search))
  const selected = search.date ?? search.month ?? 'Today'

  return (
    <AppShell>
      <Page title="Calendar">
        <nav className="segmented-links" aria-label="Calendar view">
          <Link to="/calendar" search={{}} activeOptions={{ exact: true }}>
            Today
          </Link>
          <Link to="/calendar" search={{ month: '2026-08' }}>
            August
          </Link>
          <Link to="/calendar" search={{ date: '2026-08-29' }}>
            August 29
          </Link>
        </nav>
        <p className="view-label">{selected}</p>
        <EmptyState>
          <p>No tasks scheduled for this view.</p>
          <Link className="plain-action" to="/tasks">
            Open Tasks
          </Link>
        </EmptyState>
      </Page>
    </AppShell>
  )
}
