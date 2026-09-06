import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import {
  completeTodayTaskAction,
  reorderTodayAction,
  undoTodayTaskCompletionAction,
  type TodayActionResult,
  type TodayData,
} from '../domain/server'
import type { Goal, Task } from '../domain/store'
import { coverageSplit, goalNames, longDay } from '../lib/todayView'
import { AppShell } from './AppShell'
import { Notice } from './Notice'

/** How long a press must hold before a drag starts. */
const HOLD_MS = 350

export function TodayPage({ initial: data }: { initial: TodayData }) {
  const router = useRouter()
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null)
  const noticeId = useRef(0)
  const notify = (message: string) => setNotice({ id: ++noticeId.current, message })
  const openListRef = useRef<HTMLUListElement>(null)
  const cancelDrag = useRef<(() => void) | null>(null)
  const pending = useRef(new Set<string>())
  const [saving, setSaving] = useState(false)
  useEffect(() => () => {
    cancelDrag.current?.()
  }, [])

  const apply = async (result: TodayActionResult) => {
    if (result.ok) {
      await router.invalidate().catch(() => notify('Could not refresh. Try again.'))
      return
    }
    // Success is the state change itself; only failures say anything.
    notify(result.message)
  }

  const run = async (key: string, action: () => Promise<TodayActionResult>) => {
    if (pending.current.has(key)) return
    pending.current.add(key)
    setSaving(true)
    try { await apply(await action()) }
    catch { await apply({ ok: false, code: 'network', message: 'Could not save the change. Try again.' }) }
    finally { pending.current.delete(key); setSaving(pending.current.size > 0) }
  }
  const complete = (task: Task) => { void run(task.id, () => completeTodayTaskAction({ data: { taskId: task.id } })) }
  const undoCompletion = (task: Task) => { void run(task.id, () => undoTodayTaskCompletionAction({ data: { taskId: task.id } })) }

  const empty = !data.open.length && !data.completed.length

  return (
    <AppShell>
      <div className="page today-page">
        <div className="today-heading">
          <h1>Today</h1>
          <p className="today-day">{longDay(data.today)}</p>
        </div>

        {empty ? (
          <div className="empty-state">
            <p>Nothing planned for today</p>
            <Link className="primary-btn" to="/tasks">
              Open Tasks
            </Link>
          </div>
        ) : (
          <div className="today-layout">
            <div className="today-work" aria-busy={saving}>
            <section className="section" aria-label="Open tasks">
              <p className="today-counts">{data.open.length ? `${data.open.length} open` : 'No open tasks.'}</p>
              {data.open.length ? (
                <ul
                  className="task-list today-open"
                  ref={openListRef}
                  onPointerDown={(event) => { if (!pending.current.size) { cancelDrag.current?.(); cancelDrag.current = onListPointerDown(persistOrder)(event) ?? null } }}
                >
                  {data.open.map((task) => (
                    <TodayRow
                      key={task.id}
                      task={task}
                      data={data}
                      onToggle={complete}
                    />
                  ))}
                </ul>
              ) : null}
              {data.open.length > 1 ? (
                <p className="today-hold">Long press, then drag to reorder.</p>
              ) : null}
            </section>

            <section className="section" aria-label="Completed today">
              <h2>Completed</h2>
              <TaskRows
                tasks={data.completed}
                data={data}
                emptyText="No completed tasks."
                onToggle={undoCompletion}
              />
            </section>
            </div>
            <Coverage data={data} />
          </div>
        )}
      </div>
      {notice ? (
        <Notice key={notice.id} message={notice.message} onDismiss={() => setNotice(null)} />
      ) : null}
    </AppShell>
  )

  /** The drag preview is restored before a save; only confirmed data changes the list. */
  function persistOrder(taskId: string, ids: string[]) {
    const current = data.open.map(task => task.id)
    if (current.every((id, index) => id === ids[index])) return
    const index = ids.indexOf(taskId)
    if (index < 0) return
    void run('reorder', () => reorderTodayAction({ data: { taskId, afterTaskId: index > 0 ? ids[index - 1] : null } }))
  }
}

/**
 * Long-press drag on open rows: hold past the threshold, follow the pointer
 * by moving the row in the list, then persist the dropped position.
 */
function onListPointerDown(persistOrder: (taskId: string, ids: string[]) => void) {
  return (event: React.PointerEvent<HTMLUListElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('a, button, input, select, textarea')) return
    const list = event.currentTarget
    const row = target.closest('li[data-task-id]')
    if (!(row instanceof HTMLElement) || !list.contains(row)) return

    const original = Array.from(list.children)
    const dragRow: HTMLElement = row
    const { pointerId, clientX: startX, clientY: startY } = event
    let held = false
    let finished = false
    const timer = setTimeout(() => {
      held = true
      dragRow.classList.add('is-held')
    }, HOLD_MS)
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      if (!held) {
        if (
          Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 8
        ) {
          finish(false)
        }
        return
      }
      moveEvent.preventDefault()
      const over = document
        .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest('li[data-task-id]')
      if (
        !(over instanceof HTMLElement) ||
        !list.contains(over) ||
        over === dragRow
      ) {
        return
      }
      const rect = over.getBoundingClientRect()
      list.insertBefore(
        dragRow,
        moveEvent.clientY < rect.top + rect.height / 2 ? over : over.nextSibling,
      )
    }

    function finish(commit: boolean) {
      if (finished) return
      finished = true
      clearTimeout(timer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', escape)
      window.removeEventListener('blur', blur)
      dragRow.classList.remove('is-held')
      const ids = Array.from(list.children, child => (child as HTMLElement).dataset.taskId ?? '')
      for (const child of original) if (child.parentElement === list) list.append(child)
      if (held && commit && dragRow.dataset.taskId) persistOrder(dragRow.dataset.taskId, ids)
    }
    const up = (upEvent: PointerEvent) => {
      if (upEvent.pointerId === pointerId) finish(true)
    }
    const cancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) finish(false)
    }

    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(false) }
    const blur = () => finish(false)
    window.addEventListener('keydown', escape)
    window.addEventListener('blur', blur)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => finish(false)
  }
}

function Coverage({ data }: { data: TodayData }) {
  const { covered, notCovered } = coverageSplit(data)
  return (
    <section className="today-coverage" aria-label="Goal coverage">
      <div>
        <p className="today-coverage-label">Covered today</p>
        <div className="today-goals">
          {covered.length
            ? covered.map(goalLink)
            : <span className="today-none">None</span>}
        </div>
      </div>
      <div>
        <p className="today-coverage-label">Not covered today</p>
        <div className="today-goals">
          {notCovered.length
            ? notCovered.map(goalLink)
            : <span className="today-none">None</span>}
        </div>
      </div>
    </section>
  )
}

function goalLink(goal: Goal) {
  return (
    <Link
      key={goal.id}
      className="today-goal"
      aria-label={goal.title}
      to="/tasks"
      search={{ goal: goal.id, available: '1' }}
    >
      {goal.title}
    </Link>
  )
}

function TaskRows({
  tasks,
  data,
  emptyText,
  onToggle,
}: {
  tasks: Task[]
  data: TodayData
  emptyText: string
  onToggle: (task: Task) => void
}) {
  if (!tasks.length) {
    return <p className="today-none">{emptyText}</p>
  }
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TodayRow key={task.id} task={task} data={data} onToggle={onToggle} />
      ))}
    </ul>
  )
}

function TodayRow({
  task,
  data,
  onToggle,
}: {
  task: Task
  data: TodayData
  onToggle: (task: Task) => void
}) {
  const done = Boolean(task.completedAt)
  return (
    <li data-task-id={task.id}>
      <div className="task-row" data-state={done ? 'complete' : 'open'}>
        <button
          type="button"
          className={done ? 'task-circle is-done' : 'task-circle'}
          aria-label={`${done ? 'Undo' : 'Complete'} ${task.title}`}
          onClick={() => onToggle(task)}
        >
          ✓
        </button>
        <span className="task-copy">
          <Link
            className="task-name"
            to="/tasks/$taskId"
            params={{ taskId: task.id }}
            search={{}}
          >
            {task.title}
          </Link>
          <GoalMeta task={task} data={data} />
        </span>
      </div>
    </li>
  )
}

function GoalMeta({ task, data }: { task: Task; data: TodayData }) {
  const names = goalNames(task, data)
  if (!names.length) return null
  const extra = names.length > 1 ? ` +${names.length - 1}` : ''
  return (
    <span className="task-meta">
      {names[0]}
      {extra}
    </span>
  )
}
