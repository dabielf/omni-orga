import { Link, createFileRoute } from '@tanstack/react-router'

import { AppShell, Page } from '../components/AppShell'
import { shellGoals, shellTasks } from '../components/shellData'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const task = shellTasks[0]
  const goal = shellGoals.find((item) => item.id === task.goalId)
  return (
    <AppShell>
      <Page title="Today">
        <section className="section" aria-labelledby="today-tasks">
          <h2 id="today-tasks">Tasks</h2>
          <ul className="record-list">
            <li>
              <Link
                className="record-row"
                to="/tasks/$taskId"
                params={{ taskId: task.id }}
                search={{}}
              >
                <span>{task.name}</span>
                <span className="state-label">Available</span>
              </Link>
            </li>
          </ul>
        </section>
        {goal ? (
          <section className="section" aria-labelledby="today-goals">
            <h2 id="today-goals">Goals</h2>
            <Link
              className="record-row"
              to="/tasks"
              search={{ goal: goal.id, available: '1' }}
            >
              <span>{goal.name}</span>
              <span className="state-label">Covered today</span>
            </Link>
          </section>
        ) : null}
      </Page>
    </AppShell>
  )
}
