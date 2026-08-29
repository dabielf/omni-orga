import { useEffect, useRef } from 'react'

import { planTaskAction, unplanTaskAction } from '../domain/server'
import type { Task } from '../domain/store'
import { addDays, formatDay, formatShortDate } from '../lib/tasksView'
import { useTasksUi } from './tasksContext'

export function CompleteCircle({
  task,
  onToggle,
}: {
  task: Task
  onToggle: () => void
}) {
  const done = Boolean(task.completedAt)
  if (task.blocked && !done) {
    return (
      <button
        type="button"
        className="task-circle"
        disabled
        aria-label={`${task.title} is blocked by subtasks`}
      />
    )
  }
  return (
    <button
      type="button"
      className={done ? 'task-circle is-done' : 'task-circle'}
      aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
      onClick={onToggle}
    >
      ✓
    </button>
  )
}

/**
 * The one scheduled-day control: plan for today or another day, reschedule,
 * or remove the day. Domain rules are enforced by the server functions and
 * surface as factual messages.
 */
export function ScheduleMenu({
  task,
  variant = 'chip',
}: {
  task: Task
  variant?: 'chip' | 'button'
}) {
  const { data, applyData, notify } = useTasksUi()
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const close = () => detailsRef.current?.removeAttribute('open')
    const onPointerDown = (event: PointerEvent) => {
      const element = detailsRef.current
      if (element?.open && !element.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const plan = async (day: string) => {
    detailsRef.current?.removeAttribute('open')
    const result = await planTaskAction({ data: { taskId: task.id, day } })
    if (result.ok) applyData(result)
    else notify(result.message)
  }

  const unplan = async () => {
    detailsRef.current?.removeAttribute('open')
    const result = await unplanTaskAction({ data: { taskId: task.id } })
    if (result.ok) applyData(result)
    else notify(result.message)
  }

  const scheduled = task.scheduledDay
  const isToday = scheduled === data.today
  const label = scheduled
    ? formatDay(scheduled, data.today)
    : formatShortDate(addDays(data.today, 1))

  return (
    <details
      className={
        variant === 'button' ? 'schedule-menu menu-btn' : 'schedule-menu'
      }
      ref={detailsRef}
    >
      <summary
        className={
          scheduled
            ? isToday
              ? 'when-chip is-today'
              : 'when-chip'
            : 'when-chip when-chip-add'
        }
      >
        {scheduled ? label : 'Schedule'}
      </summary>
      <div className="schedule-pop">
        <button
          type="button"
          disabled={task.blocked}
          onClick={() => plan(data.today)}
        >
          Today
        </button>
        {task.blocked ? (
          <p className="schedule-hint">
            Blocked tasks cannot be planned for today.
          </p>
        ) : null}
        <button type="button" onClick={() => plan(addDays(data.today, 1))}>
          Tomorrow
        </button>
        <label className="schedule-pick">
          <span>Pick a date</span>
          <input
            type="date"
            onChange={(event) => {
              if (event.target.value) void plan(event.target.value)
            }}
          />
        </label>
        {scheduled ? (
          <button type="button" onClick={unplan}>
            Remove
          </button>
        ) : null}
      </div>
    </details>
  )
}
