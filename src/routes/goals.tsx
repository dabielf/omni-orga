import { Outlet, createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { AppShell } from '../components/AppShell'
import { GoalSheet } from '../components/GoalSheet'
import { GoalsUiContext, type GoalsUi } from '../components/goalsContext'
import {
  loadGoalsData,
  type GoalsData,
} from '../domain/goalServer'

export const Route = createFileRoute('/goals')({
  loader: () => loadGoalsData(),
  component: GoalsLayout,
})

function GoalsLayout() {
  const initial = Route.useLoaderData()
  const [data, setData] = useState<GoalsData>(initial)
  const [notice, setNotice] = useState<{
    message: string
    actionLabel?: string
    undo?: () => void
  } | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)

  const notify = (
    message: string,
    options?: { actionLabel?: string; undo?: () => void },
  ) => {
    setNotice({ message, actionLabel: options?.actionLabel, undo: options?.undo })
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 6000)
  }

  const toggleCollapsed = (goalId: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(goalId)) next.delete(goalId)
      else next.add(goalId)
      return next
    })
  }

  const ui: GoalsUi = {
    data,
    applyData: setData,
    notify,
    collapsed,
    toggleCollapsed,
    openCreate: () => setCreateOpen(true),
  }

  return (
    <GoalsUiContext.Provider value={ui}>
      <AppShell>
        <Outlet />
        {createOpen ? (
          <GoalSheet onClose={() => setCreateOpen(false)} />
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
                {notice.actionLabel ?? 'Undo'}
              </button>
            ) : null}
          </div>
        ) : null}
      </AppShell>
    </GoalsUiContext.Provider>
  )
}
