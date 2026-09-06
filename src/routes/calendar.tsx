import { loadFreshData } from '../lib/loadFreshData'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { AppShell, Page } from '../components/AppShell'
import { CalendarPage } from '../components/CalendarPage'
import { useCanonicalUrl } from '../components/useCanonicalUrl'
import {
  loadCalendarData,
  type TasksActionResult,
} from '../domain/server'
import { calendarUrl, sanitizeCalendarSearch } from '../lib/urlState'

export const Route = createFileRoute('/calendar')({
  validateSearch: sanitizeCalendarSearch,
  loader: (context) => loadFreshData(() => loadCalendarData(), context),
  component: CalendarRoute,
})

function CalendarRoute() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const search = Route.useSearch()
  useCanonicalUrl(calendarUrl(search))
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const notify = (message: string) => {
    setNotice(message)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 6000)
  }

  const apply = (result: TasksActionResult) => {
    if (result.ok) {
      void router.invalidate()
    } else {
      notify(result.message)
    }
  }

  return (
    <AppShell>
      <Page title="Calendar">
        <CalendarPage data={data} apply={apply} selectedDate={search.date} />
        {notice ? (
          <div className="notice-chip" role="status">
            <span>{notice}</span>
          </div>
        ) : null}
      </Page>
    </AppShell>
  )
}
