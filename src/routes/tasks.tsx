import { loadFreshData } from '../lib/loadFreshData'
import { Link, Outlet, createFileRoute, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { AppShell } from '../components/AppShell'
import { CreateSheet } from '../components/TaskSheet'
import { TasksFilters } from '../components/TasksFilters'
import { TasksRail } from '../components/TasksRail'
import { TasksUiContext, type TasksUi } from '../components/tasksContext'
import { loadTasksData } from '../domain/server'
import { tasksHeading } from '../lib/tasksView'
import { sanitizeTasksSearch } from '../lib/urlState'

export const Route = createFileRoute('/tasks')({
  validateSearch: sanitizeTasksSearch,
  loader: (context) => loadFreshData(() => loadTasksData(), context),
  component: TasksLayout,
})

function TasksLayout() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const refresh = () => {
    void router.invalidate()
  }
  const search = Route.useSearch()
  const [notice, setNotice] = useState<{
    message: string
    undo?: () => void
  } | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [expandedTrees, setExpandedTrees] = useState<Set<string>>(new Set())
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)

  const notify = (message: string, undo?: () => void) => {
    setNotice({ message, undo })
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 6000)
  }

  const ui: TasksUi = {
    data,
    applyData: refresh,
    notify,
    search,
    treeExpansion: {
      expanded: expandedTrees,
      toggle: (taskId) => {
        const next = new Set(expandedTrees)
        if (next.has(taskId)) next.delete(taskId)
        else next.add(taskId)
        setExpandedTrees(next)
      },
    },
    goalExpansion: {
      expanded: expandedGoals,
      toggle: (goalId) => {
        const next = new Set(expandedGoals)
        if (next.has(goalId)) next.delete(goalId)
        else next.add(goalId)
        setExpandedGoals(next)
      },
    },
    openCreate: () => setCreateOpen(true),
  }

  return (
    <TasksUiContext.Provider value={ui}>
      <AppShell>
        <div className="page tasks-page">
          <div className="tasks-heading">
            <h1>Tasks</h1>
            {!search.view ? <button type="button" className="primary-btn" onClick={ui.openCreate}>New task</button> : null}
          </div>
          <div className={search.view ? 'tasks-history-layout' : 'tasks-layout'}>
            {!search.view ? <TasksRail /> : null}
            <div className="task-content">
              {!search.view ? <TasksFilters /> : null}
              {search.view ? <nav className="task-history-nav" aria-label="Task history"><Link className="secondary-btn" to="/tasks" search={{ available: search.available, ideal: search.ideal }}>All tasks</Link><span className="primary-btn" aria-current="page">{tasksHeading(data.goals, search)}</span></nav> : <h2 className="task-view-heading">{tasksHeading(data.goals, search)}</h2>}
              <Outlet />
            </div>
          </div>
          {createOpen ? (
            <CreateSheet onClose={() => setCreateOpen(false)} />
          ) : null}
          {notice ? (
            <div className="notice-chip" role="status">
              <span>{notice.message}</span>
              {notice.undo ? (
                <button
                  type="button"
                  className="notice-undo"
                  onClick={() => {
                    notice.undo?.()
                    setNotice(null)
                  }}
                >
                  Undo
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </AppShell>
    </TasksUiContext.Provider>
  )
}
