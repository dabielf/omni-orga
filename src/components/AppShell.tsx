import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'

const pages = [
  { to: '/', label: 'Today', icon: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> },
  { to: '/goals', label: 'Goals', icon: <path d="M5 22V4c5-5 9 5 14 0v12c-5 5-9-5-14 0" /> },
  { to: '/tasks', label: 'Tasks', icon: <path d="m3 6 2 2 3-3m4 1h9M3 13l2 2 3-3m4 1h9M3 20l2 2 3-3m4 1h9" /> },
  { to: '/calendar', label: 'Calendar', icon: <><rect x="3" y="5" width="18" height="17" rx="2" /><path d="M7 2v6m10-6v6M3 11h18M7 15h1m4 0h1m4 0h1M7 18h1m4 0h1m4 0h1" /></> },
  { to: '/stats', label: 'Stats', icon: <path d="M5 21V13m7 8V3m7 18V8" /> },
] as const

function navLinks() {
  return pages.map((page) => (
    <Link
      key={page.to}
      to={page.to}
      activeOptions={{ exact: page.to === '/' }}
      activeProps={{ className: 'global-link is-current' }}
      inactiveProps={{ className: 'global-link' }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{page.icon}</svg>
      <span>{page.label}</span>
    </Link>
  ))
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const refreshError = useRouterState({
    select: state => state.matches.some(match =>
      (match.loaderData as { refreshError?: boolean } | undefined)?.refreshError),
  })
  return (
    <div className="app-shell" data-omni-orga="app">
      <header className="global-nav">
        <span className="wordmark">Omni-orga</span>
        <nav
          className="global-links global-links-plain"
          aria-label="Main navigation"
        >
          {navLinks()}
        </nav>
      </header>
      <main className="app-main">{children}</main>
      {refreshError ? (
        <div className="notice-chip" role="alert">
          <span>Could not refresh. Shown data may be old.</span>
          <button type="button" className="notice-undo" onClick={() => void router.invalidate()}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="page">
      <h1>{title}</h1>
      {children}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>
}
