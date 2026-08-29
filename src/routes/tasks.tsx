import { Outlet, createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { AppShell, Page } from '../components/AppShell'
import { CreateSheet } from '../components/TaskSheet'
import { TasksFilters } from '../components/TasksFilters'
import { TasksRail } from '../components/TasksRail'
import { TasksUiContext, type TasksUi } from '../components/tasksContext'
import {
  loadTasksData,
  type TasksActionResult,
  type TasksData,
} from '../domain/server'
import { sanitizeTasksSearch } from '../lib/urlState'

export const Route = createFileRoute('/tasks')({
  validateSearch: sanitizeTasksSearch,
  loader: () => loadTasksData(),
  component: TasksLayout,
})

function TasksLayout() {
  const initial = Route.useLoaderData()
  const search = Route.useSearch()
  const [data, setData] = useState<TasksData>(initial)
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
    applyData: setData,
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
        <Page title="Tasks">
          <div className="tasks-layout">
            <TasksRail />
            <div className="task-content">
              {!search.view ? <TasksFilters /> : null}
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
        </Page>
      </AppShell>
    </TasksUiContext.Provider>
  )
}
