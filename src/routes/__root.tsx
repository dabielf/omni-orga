import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AppShell, EmptyState, Page } from '../components/AppShell'
import type { ViewContext } from '../lib/loadFreshData'
import styles from '../styles.css?url'

export const Route = createRootRouteWithContext<ViewContext>()({
  head: () => ({
    links: [{ rel: 'stylesheet', href: styles }],
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Omni-orga' },
    ],
  }),
  notFoundComponent: NotFoundPage,
  errorComponent: LoadErrorPage,
  pendingComponent: LoadingPage,
  pendingMs: 200,
  shellComponent: RootDocument,
})

function LoadingPage() {
  return <AppShell><p role="status">Loading…</p></AppShell>
}

function LoadErrorPage() {
  const router = useRouter()
  return (
    <AppShell><Page title="Could not load">
      <p role="alert">Check your connection and try again.</p>
      <button type="button" className="primary-btn" onClick={() => void router.invalidate()}>Try again</button>
    </Page></AppShell>
  )
}

function NotFoundPage() {
  return (
    <main className="minimal-page" data-omni-orga="app">
      <EmptyState>
        <h1>Page not found</h1>
        <a href="/">Today</a>
      </EmptyState>
    </main>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
