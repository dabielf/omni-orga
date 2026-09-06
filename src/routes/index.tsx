import { loadFreshData } from '../lib/loadFreshData'
import { createFileRoute } from '@tanstack/react-router'

import { TodayPage } from '../components/TodayPage'
import { loadTodayData } from '../domain/server'

export const Route = createFileRoute('/')({
  loader: (context) => loadFreshData(() => loadTodayData(), context),
  component: Home,
})

function Home() {
  const initial = Route.useLoaderData()
  return <TodayPage initial={initial} />
}
