import { Link, useNavigate } from '@tanstack/react-router'
import { Fragment, useEffect, useRef, useState } from 'react'

import {
  planTaskAction,
  unplanTaskAction,
  type TasksActionResult,
} from '../domain/server'
import type { Task } from '../domain/store'
import { calendarGrid, moveDays, poolTasks } from '../lib/calendarView'
import { formatDay, formatShortDate } from '../lib/tasksView'

type CalendarPageData = {
  today: string
  tasks: Task[]
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * The Calendar planning screen: the "Coming weeks" grid, the selected day's
 * plan panel, and the "Not planned" pool. Planning edits go through the
 * move popover, which reuses the shared scheduling server functions.
 */
export function CalendarPage({
  data,
  apply,
  selectedDate,
}: {
  data: CalendarPageData
  apply: (result: TasksActionResult) => void
  selectedDate?: string
}) {
  const navigate = useNavigate()
  const [moveTask, setMoveTask] = useState<Task | null>(null)
  const cells = calendarGrid(data.tasks, data.today)
  const pool = poolTasks(data.tasks, data.today)
  const selected = selectedDate ?? null
  const selectedTasks = selected
    ? (cells.find((cell) => cell.day === selected)?.tasks ?? [])
    : []

  const openDay = (day: string) => {
    void navigate({ to: '/calendar', search: { date: day } })
  }

  return (
    <>
      <div className="cal-legend">
        <span className="cal-legend-item">
          <span className="cal-chip is-scheduled">Scheduled day</span>
        </span>
        <span className="cal-legend-item">
          <span className="cal-chip is-ideal">Ideal completion date</span>
        </span>
        <span className="cal-legend-item">
          <span className="cal-chip is-deadline">Deadline</span>
        </span>
      </div>

      <section className="cal-weeks">
        <h2>
          Coming weeks{' '}
          <span className="cal-range">
            {formatShortDate(cells[0].day)} to{' '}
            {formatShortDate(cells[cells.length - 1].day)}
          </span>
        </h2>
        <div className="cal-frame">
          <div className="cal-grid">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="cal-wd">
                {weekday}
              </span>
            ))}
            {cells.map((cell) => (
              <div
                key={cell.day}
                data-day={cell.day}
                className={[
                  'cal-cell',
                  cell.past ? 'is-past' : '',
                  cell.isToday ? 'is-today' : '',
                  selected === cell.day ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => openDay(cell.day)}
              >
                <Link
                  to="/calendar"
                  search={{ date: cell.day }}
                  className="cal-day-num"
                  aria-label={formatDay(cell.day, data.today)}
                  aria-current={selected === cell.day ? 'date' : undefined}
                  onClick={(event) => event.stopPropagation()}
                >
                  {cell.day.slice(8)}
                </Link>
                {cell.tasks.slice(0, 3).map((task) => (
                  <Fragment key={task.id}>
                    <button
                      type="button"
                      className="cal-chip is-scheduled"
                      onClick={(event) => {
                        event.stopPropagation()
                        setMoveTask(task)
                      }}
                    >
                      {task.title}
                    </button>
                    {task.blocked ? (
                      <span className="cal-flag">Blocked</span>
                    ) : null}
                  </Fragment>
                ))}
                {cell.tasks.length > 3 ? (
                  <span className="cal-more">
                    +{cell.tasks.length - 3} more
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {selected ? (
        <section className="cal-panel" aria-label="Day plan">
          <h3>{formatDay(selected, data.today)}</h3>
          {selectedTasks.length ? (
            <>
              <p className="cal-count">
                {selectedTasks.length}{' '}
                {selectedTasks.length === 1 ? 'task planned' : 'tasks planned'}
              </p>
              {selectedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  today={data.today}
                  onMove={() => setMoveTask(task)}
                />
              ))}
            </>
          ) : (
            <p className="cal-count">Nothing planned yet</p>
          )}
        </section>
      ) : null}

      <section className="cal-pool" aria-label="Not planned">
        <h2>Not planned</h2>
        <p className="cal-count">Available tasks without a day</p>
        {pool.length ? (
          pool.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={data.today}
              inPool
              onMove={() => setMoveTask(task)}
            />
          ))
        ) : (
          <p className="cal-count">No tasks waiting for a day</p>
        )}
      </section>

      {moveTask ? (
        <MovePopover
          task={moveTask}
          today={data.today}
          onPlan={(taskId, day) => {
            setMoveTask(null)
            void planTaskAction({ data: { taskId, day } }).then(apply)
          }}
          onRemove={(taskId) => {
            setMoveTask(null)
            void unplanTaskAction({ data: { taskId } }).then(apply)
          }}
          onClose={() => setMoveTask(null)}
        />
      ) : null}
    </>
  )
}

function TaskRow({
  task,
  today,
  inPool = false,
  onMove,
}: {
  task: Task
  today: string
  inPool?: boolean
  onMove: () => void
}) {
  return (
    <div className="cal-row">
      {inPool ? (
        <span className="cal-pool-name">{task.title}</span>
      ) : (
        <button type="button" className="cal-chip is-scheduled" onClick={onMove}>
          {task.title}
        </button>
      )}
      {task.idealCompletionDate ? (
        <span className="cal-chip is-ideal">
          ideal {formatShortDate(task.idealCompletionDate)}
        </span>
      ) : null}
      {task.deadline ? (
        <span className="cal-chip is-deadline">
          deadline {formatShortDate(task.deadline)}
        </span>
      ) : null}
      {task.blocked ? <span className="cal-flag">Blocked</span> : null}
      <button type="button" className="cal-action" onClick={onMove}>
        {inPool ? 'Plan' : 'Move'}
      </button>
    </div>
  )
}

/**
 * The move popover: pick any of the next 14 days including today (ruling 6)
 * or remove the task from its day. Days the domain would refuse are disabled
 * with the stated reason; the domain re-checks every change.
 */
function MovePopover({
  task,
  today,
  onPlan,
  onRemove,
  onClose,
}: {
  task: Task
  today: string
  onPlan: (taskId: string, day: string) => void
  onRemove: (taskId: string) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const days = moveDays(today, task)
  const deadlineAhead = Boolean(task.deadline && task.deadline >= today)

  useEffect(() => {
    dialogRef.current?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!dialogRef.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div className="cal-overlay">
      <div
        className="cal-pop"
        role="dialog"
        aria-modal="true"
        aria-label={`Move ${task.title}`}
        ref={dialogRef}
        tabIndex={-1}
      >
        <h3>{task.title}</h3>
        <p className="cal-pop-sub">
          {task.scheduledDay
            ? `Currently ${formatDay(task.scheduledDay, today)}`
            : 'Not planned'}
          {task.idealCompletionDate
            ? ` · ideal ${formatShortDate(task.idealCompletionDate)}`
            : ''}
          {task.deadline ? ` · deadline ${formatShortDate(task.deadline)}` : ''}
        </p>
        <div className="cal-day-picker">
          {days.map(({ day, label, disabled, reason }) => (
            <button
              key={day}
              type="button"
              disabled={disabled}
              className={task.scheduledDay === day ? 'is-current' : undefined}
              title={reason ?? undefined}
              onClick={() => onPlan(task.id, day)}
            >
              {label}
              {disabled && day !== today ? ' · after deadline' : ''}
            </button>
          ))}
        </div>
        {task.blocked ? (
          <p className="cal-pop-hint">
            Blocked tasks cannot be planned for today.
          </p>
        ) : null}
        {deadlineAhead ? (
          <p className="cal-pop-hint">
            Days after the {formatShortDate(task.deadline ?? '')} deadline are
            not offered.
          </p>
        ) : null}
        <div className="cal-pop-actions">
          {task.scheduledDay ? (
            <button
              type="button"
              className="cal-pop-remove"
              onClick={() => onRemove(task.id)}
            >
              Remove from {formatDay(task.scheduledDay, today)}
            </button>
          ) : null}
          <button type="button" className="cal-pop-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
