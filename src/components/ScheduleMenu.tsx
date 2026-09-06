import { useEffect, useRef, useState } from 'react'
import { planTaskAction, unplanTaskAction } from '../domain/server'
import type { Task } from '../domain/store'
import { addDays, formatDay } from '../lib/tasksView'
import { useTasksUi } from './tasksContext'

export function ancestorDeadline(task: Task, tasks: Task[]): string | undefined {
  let parentId = task.parentId
  let limit: string | undefined
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = tasks.find(item => item.id === parentId)
    if (!parent) break
    if (parent.deadline && (!limit || parent.deadline < limit)) limit = parent.deadline
    parentId = parent.parentId
  }
  return limit
}

export function CompleteCircle({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const done = Boolean(task.completedAt)
  if (task.blocked && !done) return <button type="button" className="task-circle" disabled aria-label={`${task.title} is blocked by subtasks`} />
  return <button type="button" className={done ? 'task-circle is-done' : 'task-circle'}
    aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`} onClick={onToggle}>✓</button>
}

export function ScheduleMenu({ task, variant = 'chip' }: { task: Task; variant?: 'chip' | 'button' }) {
  const { data, applyData } = useTasksUi()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const inherited = ancestorDeadline(task, data.tasks)
  const own = task.deadline && task.deadline >= data.today ? task.deadline : undefined
  const max = inherited && own ? (inherited < own ? inherited : own) : inherited ?? own
  const min = task.blocked ? addDays(data.today, 1) : data.today
  const allowed = (day: string) => day >= min && (!max || day <= max)
  useEffect(() => {
    const close = (focus = false) => {
      if (!detailsRef.current?.open) return
      detailsRef.current.removeAttribute('open')
      if (focus) detailsRef.current.querySelector('summary')?.focus()
    }
    const pointer = (event: PointerEvent) => { if (!detailsRef.current?.contains(event.target as Node)) close() }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current?.open) { event.preventDefault(); event.stopPropagation(); close(true) }
    }
    document.addEventListener('pointerdown', pointer)
    detailsRef.current?.addEventListener('keydown', key)
    const element = detailsRef.current
    return () => { document.removeEventListener('pointerdown', pointer); element?.removeEventListener('keydown', key) }
  }, [])
  const save = async (day?: string) => {
    if (pending.current) return
    if (day && !allowed(day)) { setError(max && day > max ? `Choose a day on or before ${max}.` : 'Choose an available day.'); return }
    pending.current = true; setBusy(true); setError('')
    try {
      const result = await (day ? planTaskAction({ data: { taskId: task.id, day } }) : unplanTaskAction({ data: { taskId: task.id } }))
      if (!result.ok) { setError(result.message); return }
      applyData(result); detailsRef.current?.removeAttribute('open'); detailsRef.current?.querySelector('summary')?.focus()
    } catch { setError('The day was not saved. Try again.') }
    finally { pending.current = false; setBusy(false) }
  }
  const scheduled = task.scheduledDay
  return <details className={variant === 'button' ? 'schedule-menu menu-btn' : 'schedule-menu'} ref={detailsRef}>
    <summary className={scheduled ? scheduled === data.today ? 'when-chip is-today' : 'when-chip' : 'when-chip when-chip-add'}>
      {scheduled ? formatDay(scheduled, data.today) : 'Schedule'}
    </summary>
    <div className="schedule-pop">
      <button type="button" disabled={busy || !allowed(data.today)} onClick={() => void save(data.today)}>Today</button>
      {task.blocked ? <p className="schedule-hint">Blocked tasks cannot be planned for today.</p> : null}
      <button type="button" disabled={busy || !allowed(addDays(data.today, 1))} onClick={() => void save(addDays(data.today, 1))}>Tomorrow</button>
      {max ? <p className="schedule-hint">Plan on or before {max}.</p> : null}
      <label className="schedule-pick"><span>Pick a date</span><input type="date" min={min} max={max} disabled={busy}
        onChange={event => { if (event.target.value) void save(event.target.value) }} /></label>
      {scheduled ? <button type="button" disabled={busy} onClick={() => void save()}>Remove</button> : null}
      {busy ? <p role="status">Saving…</p> : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </div>
  </details>
}
