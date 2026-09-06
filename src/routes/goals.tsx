import { loadFreshData } from '../lib/loadFreshData'
import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { Notice } from '../components/Notice'

import { AppShell } from '../components/AppShell'
import { GoalSheet } from '../components/GoalSheet'
import { GoalsUiContext, type GoalsUi } from '../components/goalsContext'
import { loadGoalsData } from '../domain/goalServer'

export const Route = createFileRoute('/goals')({
  loader: (context) => loadFreshData(() => loadGoalsData(), context),
  component: GoalsLayout,
})

function GoalsLayout() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const refresh = () => {
    void router.invalidate()
  }
  const noticeId = useRef(0)
  const [notice, setNotice] = useState<{
    id: number
    message: string
    actionLabel?: string
    undo?: () => void
  } | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)

  const notify = (
    message: string,
    options?: { actionLabel?: string; undo?: () => void },
  ) => {
    setNotice({ id: ++noticeId.current, message, actionLabel: options?.actionLabel, undo: options?.undo })
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
    applyData: refresh,
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
          <Notice key={notice.id} message={notice.message} onDismiss={() => setNotice(null)}>
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
          </Notice>
        ) : null}
      </AppShell>
    </GoalsUiContext.Provider>
  )
}
