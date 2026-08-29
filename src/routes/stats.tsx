import { Link, createFileRoute } from '@tanstack/react-router'

import { AppShell, EmptyState, Page } from '../components/AppShell'
import { useCanonicalUrl } from '../components/useCanonicalUrl'
import { loadStatsData } from '../domain/statsServer'
import {
  PERIOD_LABELS,
  statsViewModel,
} from '../lib/statsView'
import {
  sanitizeStatsSearch,
  statsUrl,
  type StatsPeriod,
} from '../lib/urlState'

export const Route = createFileRoute('/stats')({
  validateSearch: sanitizeStatsSearch,
  loaderDeps: ({ search }) => ({ period: search.period }),
  loader: ({ deps }) =>
    loadStatsData({ data: { period: deps.period ?? '30' } }),
  component: StatsPage,
})

// The 30-day default keeps the URL free of a period parameter, so its link
// points at the bare /stats path.
const PERIOD_LINKS: Array<{
  period: StatsPeriod
  label: string
  search: Record<string, never> | { period: StatsPeriod }
}> = [
  { period: '30', label: PERIOD_LABELS['30'], search: {} },
  { period: '90', label: PERIOD_LABELS['90'], search: { period: '90' } },
  { period: '365', label: PERIOD_LABELS['365'], search: { period: '365' } },
]

function StatsPage() {
  const search = Route.useSearch()
  const data = Route.useLoaderData()
  useCanonicalUrl(statsUrl({ period: search.period }))

  const view = statsViewModel({
    goals: data.goals,
    tasks: data.tasks,
    period: data.period,
    now: data.now,
  })

  return (
    <AppShell>
      <Page title="Stats">
        <nav className="segmented-links" aria-label="Stats period">
          {PERIOD_LINKS.map((link) => (
            <Link
              key={link.period}
              to="/stats"
              search={link.search}
              activeOptions={{ exact: true }}
              aria-current={
                (search.period ?? '30') === link.period ? 'page' : undefined
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <ul className="stats-counters">
          {view.counterItems.map((counter) => (
            <li className="stats-counter" key={counter.label}>
              <span className="stats-counter-number">{counter.value}</span>
              <span className="stats-counter-label">{counter.label}</span>
            </li>
          ))}
        </ul>
        {view.hasGoals ? (
          <>
            <div className="stats-sections">
              {view.sections.map((section) => (
                <section
                  className="stats-goal"
                  key={section.goalId}
                  aria-label={`${section.title} (${section.kind === 'ongoing' ? 'ongoing' : 'one-shot'})`}
                >
                  <h2 className="stats-goal-name">
                    {section.title}
                    <span className="type-chip">
                      {section.kind === 'ongoing' ? 'Ongoing' : 'One-shot'}
                    </span>
                  </h2>
                  {section.kind === 'ongoing' ? (
                    <>
                      <p className="stats-goal-line">
                        {`${section.doneCount} tasks and subtasks done`}
                      </p>
                      {section.repeatables.length ? (
                        <ul className="stats-repeatables">
                          {section.repeatables.map((row) => (
                            <li className="stats-repeatable" key={row.taskId}>
                              <span className="stats-repeatable-name">
                                {row.title}
                              </span>
                              <span className="stats-repeatable-count">
                                {row.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p className="stats-goal-line">
                        {`${section.completed} of ${section.total} tasks done · ${section.percentage}%`}
                      </p>
                      <div className="goal-bar is-wide" aria-hidden="true">
                        <span style={{ width: `${section.percentage}%` }} />
                      </div>
                    </>
                  )}
                </section>
              ))}
            </div>
            {view.completedGoals.length ? (
              <section
                className="stats-completed"
                aria-label="One-shot goals completed in the period"
              >
                <h2 className="stats-heading">
                  One-shot goals completed in this period
                </h2>
                <ul className="stats-completed-list">
                  {view.completedGoals.map((goal) => (
                    <li key={goal.goalId}>
                      {`${goal.title}, completed ${goal.day}`}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <EmptyState>
            <p>No goals yet.</p>
          </EmptyState>
        )}
      </Page>
    </AppShell>
  )
}
