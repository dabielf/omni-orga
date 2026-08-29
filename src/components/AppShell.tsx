import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

const pages = [
  { to: '/', label: 'Today' },
  { to: '/goals', label: 'Goals' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/stats', label: 'Stats' },
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
      {page.label}
    </Link>
  ))
}

export function AppShell({ children }: { children: ReactNode }) {
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
        <details className="global-nav-disclosure">
          <summary>Menu</summary>
          <nav
            className="global-links global-links-menu"
            aria-label="Main navigation"
          >
            {navLinks()}
          </nav>
        </details>
      </header>
      <main className="app-main">{children}</main>
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
