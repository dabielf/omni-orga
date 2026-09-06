import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { planTaskAction, unplanTaskAction, type TasksActionResult } from '../domain/server'
import type { Task } from '../domain/store'
import { calendarGrid, moveDays, poolTasks } from '../lib/calendarView'
import { formatDay, formatShortDate } from '../lib/tasksView'
import '../calendar-stats.css'
import { ancestorDeadline } from './ScheduleMenu'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function CalendarPage({ data, apply, selectedDate }: {
  data: { today: string; tasks: Task[] }
  apply: (result: TasksActionResult) => void
  selectedDate?: string
}) {
  const [moveTask, setMoveTask] = useState<Task | null>(null)
  const [fullDay, setFullDay] = useState(false)
  const cells = calendarGrid(data.tasks, data.today)
  const pool = poolTasks(data.tasks, data.today)
  const selectedTasks = cells.find(cell => cell.day === selectedDate)?.tasks ?? []
  const heading = selectedDate ? formatDay(selectedDate, data.today) : ''
  const move = (task: Task) => setMoveTask(task)

  return (
    <div className="calendar-view">
      <header className="cal-heading">
        <h2>Coming weeks</h2>
        <p className="cal-range">{formatShortDate(cells[0].day)} to {formatShortDate(cells.at(-1)!.day)}</p>
      </header>
      <div className="cal-layout">
        <section className="cal-weeks" aria-label="Coming weeks">
          <div className="cal-grid">
            {WEEKDAYS.map(day => <span key={day} className="cal-wd">{day}</span>)}
            {cells.map(cell => (
              <Link key={cell.day} to="/calendar" search={{ date: cell.day }}
                data-day={cell.day}
                className={`cal-cell${cell.past ? ' is-past' : ''}${cell.isToday ? ' is-today' : ''}${selectedDate === cell.day ? ' is-selected' : ''}`}
                aria-label={`${formatDay(cell.day, data.today)}, ${cell.tasks.length} ${cell.tasks.length === 1 ? 'task' : 'tasks'}`}
                aria-current={selectedDate === cell.day ? 'date' : undefined}>
                <span className="cal-day-num">{Number(cell.day.slice(8))}</span>
                {cell.tasks.length > 0 && <span className="cal-cell-count">{cell.tasks.length} {cell.tasks.length === 1 ? 'task' : 'tasks'}</span>}
              </Link>
            ))}
          </div>
        </section>
        {selectedDate ? (
          <section className="cal-panel" aria-label="Day plan">
            <h3>{heading}</h3>
            {selectedTasks.length ? <>
              <div className="cal-selected-list">
                {selectedTasks.map(task => <TaskRow key={task.id} task={task} today={data.today} onMove={() => move(task)} />)}
              </div>
              <div className="cal-phone-actions">
                <button type="button" className="secondary-btn" onClick={() => setFullDay(true)}>View {selectedTasks.length} {selectedTasks.length === 1 ? 'task' : 'tasks'}</button>
                <button type="button" className="secondary-btn" onClick={() => move(selectedTasks[0])}>Move task</button>
              </div>
            </> : <p className="cal-count">Nothing planned yet.</p>}
          </section>
        ) : <p className="cal-select-hint">Choose a day to see its tasks.</p>}
      </div>
      <section className="cal-pool" aria-label="Not planned">
        <h2>Not planned</h2>
        {pool.length ? pool.map(task => <TaskRow key={task.id} task={task} today={data.today} inPool onMove={() => move(task)} />) : <p className="cal-count">No unplanned tasks.</p>}
      </section>
      {fullDay && <CalendarDialog label={heading} onClose={() => setFullDay(false)}>
        <div className="cal-dialog-head"><h2>{heading}</h2><button type="button" className="secondary-btn" onClick={() => setFullDay(false)}>Close</button></div>
        {selectedTasks.map(task => <TaskRow key={task.id} task={task} today={data.today} onMove={() => move(task)} />)}
      </CalendarDialog>}
      {moveTask && <MovePopover task={moveTask} tasks={data.tasks} today={data.today} apply={apply} onClose={() => setMoveTask(null)} />}
    </div>
  )
}

function TaskRow({ task, today, inPool = false, onMove }: { task: Task; today: string; inPool?: boolean; onMove: () => void }) {
  return <div className="cal-row">
    <div className="cal-row-copy">
      <span className="cal-task-name">{task.title}</span>
      {task.blocked && <span className="cal-meta">Blocked by subtasks</span>}
      {task.idealCompletionDate && <span className="cal-meta">Ideal {formatShortDate(task.idealCompletionDate)}</span>}
      {task.deadline && <span className={`cal-meta${task.deadline < today ? ' cal-overdue' : ''}`}>
        {task.deadline < today ? '⚠ Overdue. Deadline ' : 'Deadline '}{formatShortDate(task.deadline)}
      </span>}
    </div>
    <button type="button" className="secondary-btn" onClick={onMove}>{inPool ? 'Plan' : 'Move'}</button>
  </div>
}

function CalendarDialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const trigger = document.activeElement as HTMLElement | null
    dialog.showModal()
    return () => { dialog.close(); if (trigger?.isConnected) trigger.focus() }
  }, [])
  return <dialog ref={ref} className="cal-pop" aria-label={label} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]'))
      .filter(element => element.getClientRects().length > 0)
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => {
    if (event.target === event.currentTarget) {
      const box = event.currentTarget.getBoundingClientRect()
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose()
    }
  }}>{children}</dialog>
}

function MovePopover({ task, tasks, today, apply, onClose }: {
  task: Task; tasks: Task[]; today: string; apply: (result: TasksActionResult) => void; onClose: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)
  const inherited = ancestorDeadline(task, tasks)
  const deadline = task.deadline
  const days = moveDays(today, task).map(day => inherited && day.day > inherited
    ? { ...day, disabled: true, reason: `After parent deadline ${inherited}` }
    : day)
  const save = async (day?: string) => {
    if (saving.current) return
    saving.current = true; setPending(true); setError(null)
    try {
      const result = day ? await planTaskAction({ data: { taskId: task.id, day } }) : await unplanTaskAction({ data: { taskId: task.id } })
      if (result.ok) { apply(result); onClose() }
      else setError(result.message)
    } catch { setError('Could not save the day. Try again.') }
    finally { saving.current = false; setPending(false) }
  }
  return <CalendarDialog label={`Move ${task.title}`} onClose={onClose}>
    <div className="cal-dialog-head"><h2>Move task</h2><button type="button" className="secondary-btn" onClick={onClose}>Close</button></div>
    <h3>{task.title}</h3>
    <p className="cal-pop-sub">{task.scheduledDay ? `Currently ${formatDay(task.scheduledDay, today)}.` : 'Not planned.'}{task.deadline ? ` Deadline ${formatShortDate(task.deadline)}.` : ''}</p>
    <div className="cal-day-picker">
      {days.slice(0, 7).map(({ day }) => <span key={day} className="cal-wd">{new Date(`${day}T12:00:00`).toLocaleDateString('en', { weekday: 'short' })}</span>)}
      {days.map(({ day, label, disabled, reason }) => <button key={day} type="button" disabled={disabled || pending}
        className={`${task.scheduledDay === day ? 'is-current ' : ''}${day === today ? 'is-today' : ''}`}
        aria-label={`${label}${reason ? `. ${reason}` : ''}`} title={reason ?? label} aria-pressed={task.scheduledDay === day}
        onClick={() => void save(day)}>{Number(day.slice(8))}</button>)}
    </div>
    {task.blocked && <p className="cal-pop-hint">Blocked tasks cannot be planned for today.</p>}
    {inherited && <p className="cal-pop-hint">The parent deadline is {formatShortDate(inherited)}. Later days are unavailable.</p>}
    {deadline && deadline >= today && <p className="cal-pop-hint">Days after {formatShortDate(deadline)} are unavailable.</p>}
    {pending && <p role="status">Saving…</p>}
    {error && <p className="cal-error" role="alert">{error}</p>}
    <div className="cal-pop-actions"><button type="button" className="primary-btn" onClick={onClose}>Cancel</button>
      {task.scheduledDay && <button type="button" className="secondary-btn" disabled={pending} onClick={() => void save()}>Remove day</button>}
    </div>
  </CalendarDialog>
}
