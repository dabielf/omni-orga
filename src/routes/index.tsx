import { createFileRoute } from '@tanstack/react-router'

import { TodayPage } from '../components/TodayPage'
import { loadTodayData } from '../domain/server'

export const Route = createFileRoute('/')({
  loader: () => loadTodayData(),
  component: Home,
})

function Home() {
  const initial = Route.useLoaderData()
  return <TodayPage initial={initial} />
}
