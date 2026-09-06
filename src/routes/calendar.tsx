import { loadFreshData } from '../lib/loadFreshData'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { Notice } from '../components/Notice'

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
  const noticeId = useRef(0)
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null)
  const notify = (message: string) => {
    setNotice({ id: ++noticeId.current, message })
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
          <Notice key={notice.id} message={notice.message} onDismiss={() => setNotice(null)} />
        ) : null}
      </Page>
    </AppShell>
  )
}
