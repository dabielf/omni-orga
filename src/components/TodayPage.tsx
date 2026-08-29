import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'

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

/** How long a press must hold before a drag starts. */
const HOLD_MS = 350

export function TodayPage({ initial }: { initial: TodayData }) {
  const [data, setData] = useState<TodayData>(initial)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openListRef = useRef<HTMLUListElement>(null)

  const apply = (result: TodayActionResult) => {
    if (result.ok) {
      setData(result)
      return
    }
    // Success is the state change itself; only failures say anything.
    setNotice(result.message)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 6000)
  }

  const complete = (task: Task) => {
    void completeTodayTaskAction({ data: { taskId: task.id } }).then(apply)
  }

  const undoCompletion = (task: Task) => {
    void undoTodayTaskCompletionAction({ data: { taskId: task.id } }).then(
      apply,
    )
  }

  const empty = !data.open.length && !data.completed.length

  return (
    <AppShell>
      <div className="page today-page">
        <div className="today-heading">
          <h1>Today</h1>
          <p className="today-day">{longDay(data.today)}</p>
          <p className="today-counts">
            {data.open.length} open · {data.completed.length} complete
          </p>
        </div>

        {empty ? (
          <div className="empty-state">
            <p>Nothing planned for today</p>
            <Link className="plain-action" to="/tasks">
              Open Tasks
            </Link>
          </div>
        ) : (
          <>
            <Coverage data={data} />

            <section className="section" aria-label="Open tasks">
              {data.open.length ? (
                <ul
                  className="task-list today-open"
                  ref={openListRef}
                  onPointerDown={onListPointerDown(persistOrder)}
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
              ) : (
                <TaskRows tasks={[]} data={data} emptyText="No open tasks." onToggle={complete} />
              )}
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
          </>
        )}
      </div>
      {notice ? (
        <div className="notice-chip" role="status">
          <span>{notice}</span>
        </div>
      ) : null}
    </AppShell>
  )

  /** Sends the dropped position unless the order did not change. */
  function persistOrder(row: HTMLElement) {
    const list = openListRef.current
    if (!list) return
    const taskId = row.dataset.taskId
    if (!taskId) return
    const ids = Array.from(
      list.querySelectorAll('li[data-task-id]'),
      (item) =>
        (item instanceof HTMLElement ? item.dataset.taskId : null) ?? '',
    )
    const current = data.open.map((task) => task.id)
    if (
      current.length === ids.length &&
      current.every((id, index) => id === ids[index])
    ) {
      return
    }
    const index = ids.indexOf(taskId)
    if (index < 0) return
    void reorderTodayAction({
      data: { taskId, afterTaskId: index > 0 ? ids[index - 1] : null },
    }).then(apply)
  }
}

/**
 * Long-press drag on open rows: hold past the threshold, follow the pointer
 * by moving the row in the list, then persist the dropped position.
 */
function onListPointerDown(persistOrder: (row: HTMLElement) => void) {
  return (event: React.PointerEvent<HTMLUListElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('a, button, input, select, textarea')) return
    const list = event.currentTarget
    const row = target.closest('li[data-task-id]')
    if (!(row instanceof HTMLElement) || !list.contains(row)) return

    const dragRow: HTMLElement = row
    const { pointerId, clientX: startX, clientY: startY } = event
    let held = false
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
      clearTimeout(timer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      dragRow.classList.remove('is-held')
      if (held && commit) persistOrder(dragRow)
    }
    const up = (upEvent: PointerEvent) => {
      if (upEvent.pointerId === pointerId) finish(true)
    }
    const cancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) finish(false)
    }

    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
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
    return (
      <ul className="task-list">
        <li>
          <div className="task-row">
            <span className="task-copy">
              <span className="today-none">{emptyText}</span>
            </span>
          </div>
        </li>
      </ul>
    )
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
