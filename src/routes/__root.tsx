import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

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
  shellComponent: RootDocument,
})

function LoadErrorPage() {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  return (
    <AppShell><Page title="Could not load">
      <p role="alert">Check your connection and try again.</p>
      <button type="button" className="primary-btn" disabled={retrying} onClick={async () => {
        setRetrying(true)
        try { await router.invalidate() } finally { setRetrying(false) }
      }}>{retrying ? 'Retrying…' : 'Try again'}</button>
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
