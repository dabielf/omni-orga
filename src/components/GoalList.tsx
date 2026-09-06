import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

import {
  moveGoalAction,
  reorderGoalsAction,
  restoreGoalAction,
  setGoalPriorityAction,
} from '../domain/goalServer'
import type { Goal, GoalProgress } from '../domain/store'
import {
  PRIORITY_LIMIT_MESSAGE,
  priorityInUse,
  topLevelGoals,
  goalParentOptions,
} from '../lib/goalsView'
import { formatShortDate } from '../lib/tasksView'
import { useGoalsUi } from './goalsContext'
import { GoalDialog } from './GoalDialog'
import { GoalRemovalDialog } from './GoalRemovalDialog'
import './goals-redesign.css'

const LONG_PRESS_MS = 350

export function FlagIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 14.5V2.5" />
      <path d="M4.5 3h7.5l-2.2 2.75L12 8.5H4.5" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

/** Factual row progress: bar + text for one-shot, text for ongoing. */
export function GoalProgressView({
  progress,
  wide,
}: {
  progress: GoalProgress | undefined
  wide?: boolean
}) {
  if (!progress) return null
  const text = progress.kind === 'ongoing'
    ? `${progress.completed} ${wide ? 'tasks and subtasks done in total.' : progress.completed === 1 ? 'task done' : 'tasks done'}`
    : progress.total ? `${progress.completed} of ${progress.total} tasks done${wide ? `. ${progress.percentage}% in total.` : ''}` : 'No tasks yet'
  if (progress.kind === 'one_shot' && progress.total) {
    return (
      <>
        <span
          className={wide ? 'goal-bar is-wide' : 'goal-bar'}
          aria-hidden="true"
        >
          <span style={{ width: `${progress.percentage}%` }} />
        </span>
        <span className="goal-count">{text}</span>
      </>
    )
  }
  return <span className="goal-count">{text}</span>
}

type MoveOption = { goal: Goal }

function MovePopover({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { data, applyData, notify } = useGoalsUi()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const options = goalParentOptions([...data.goals, ...data.archivedGoals], goal.kind, goal.id)
  const move = async (parentId: string | null) => {
    if (pending.current) return
    pending.current = true; setSaving(true); setError('')
    try {
      const result = await moveGoalAction({ data: { goalId: goal.id, parentId } })
      if (result.ok) { applyData(result); if (mounted.current) onClose(); notify('Goal moved.') }
      else setError(result.message)
    } catch { setError('The goal was not moved. Try again.') }
    finally { pending.current = false; setSaving(false) }
  }
  return <GoalDialog title={`Move ${goal.title}`} onClose={onClose} compact>
    <div className="goal-dialog-body goal-move-options">
      {options.map(option => <div key={option.id ?? 'top'}>
        <button type="button" className="secondary-btn" disabled={saving || !!option.reason || option.id === goal.parentId} onClick={() => void move(option.id)}>{option.title}{option.id === goal.parentId ? ' (current)' : ''}</button>
        {option.reason ? <p className="goal-field-hint">{option.reason}</p> : null}
      </div>)}
      {error ? <p role="alert" className="goal-error">{error}</p> : null}
    </div>
  </GoalDialog>
}

type GoalDragProps = {
  draggingId: string | null
  dropBeforeId: string | null
  dropAtEnd: boolean
  onPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    goalId: string,
  ) => void
}

function useGoalDrag(): GoalDragProps & {
  justDraggedRef: RefObject<string | null>
} {
  const { applyData, notify } = useGoalsUi()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null)
  const [dropAtEnd, setDropAtEnd] = useState(false)
  const dropBeforeRef = useRef<string | null>(null)
  const dropAtEndRef = useRef(false)
  const justDraggedRef = useRef<string | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)
  const pending = useRef(false)
  useEffect(() => () => cancelRef.current?.(), [])

  const onPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    goalId: string,
  ) => {
    if (pending.current) return
    cancelRef.current?.()
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('a, button, input, select, textarea, label, summary')) return
    const row = event.currentTarget.closest(
      '[data-goal-row]',
    ) as HTMLElement | null
    if (!row) return

    dropBeforeRef.current = null
    dropAtEndRef.current = false
    const startX = event.clientX
    const startY = event.clientY
    const listeners: Array<() => void> = []
    let engaged = false
    let timer = 0

    const removeListeners = () => {
      for (const off of listeners) off()
      listeners.length = 0
    }
    const cancel = () => {
      clearTimeout(timer)
      removeListeners()
      setDropBeforeId(null)
      setDropAtEnd(false)
      justDraggedRef.current = null
      setDraggingId((current) => (current === goalId ? null : current))
      document.body.classList.remove('is-goal-dragging')
    }

    cancelRef.current = cancel
    timer = window.setTimeout(() => {
      engaged = true
      justDraggedRef.current = goalId
      setDraggingId(goalId)
      document.body.classList.add('is-goal-dragging')
    }, LONG_PRESS_MS)

    const onMove = (move: PointerEvent) => {
      if (!engaged) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) > 8) {
          cancel()
        }
        return
      }
      move.preventDefault()
      const list = row.parentElement
      if (!list) return
      const siblings = (
        Array.from(
          list.querySelectorAll(':scope > [data-goal-row][data-goal-active="true"]'),
        ) as HTMLElement[]
      ).filter((item) => item !== row)
      let before: string | null = null
      let atEnd = siblings.length > 0
      for (const sibling of siblings) {
        const rect = sibling.getBoundingClientRect()
        if (move.clientY < rect.top + rect.height / 2) {
          before = sibling.getAttribute('data-goal-row')
          atEnd = false
          break
        }
      }
      dropBeforeRef.current = before
      dropAtEndRef.current = atEnd
      setDropBeforeId(before)
      setDropAtEnd(atEnd)
    }

    const onKeyDown = (key: KeyboardEvent) => { if (key.key === 'Escape') cancel() }
    const onUp = () => {
      cancelRef.current = null
      const wasEngaged = engaged
      clearTimeout(timer)
      removeListeners()
      document.body.classList.remove('is-goal-dragging')
      setDraggingId(null)
      setDropBeforeId(null)
      setDropAtEnd(false)
      if (!wasEngaged) return
      if (!dropBeforeRef.current && !dropAtEndRef.current) { justDraggedRef.current = null; return }

      const list = row.parentElement
      const siblings = (
        Array.from(
          list?.querySelectorAll(':scope > [data-goal-row][data-goal-active="true"]') ?? [],
        ) as HTMLElement[]
      )
        .filter((item) => item !== row)
        .map((item) => item.getAttribute('data-goal-row'))
      let afterGoalId: string | null = null
      if (dropAtEndRef.current && siblings.length) {
        afterGoalId = siblings[siblings.length - 1]
      } else {
        const index = siblings.indexOf(dropBeforeRef.current)
        if (index > 0) afterGoalId = siblings[index - 1]
      }
      pending.current = true
      void (async () => {
        try {
          const result = await reorderGoalsAction({ data: { goalId, afterGoalId } })
          if (result.ok) { applyData(result); notify('Goal reordered.') }
          else notify(result.message)
        } catch { notify('The order was not saved. Try again.') }
        finally { pending.current = false }
      })()
    }

    listeners.push(() => document.removeEventListener('keydown', onKeyDown))
    document.addEventListener('keydown', onKeyDown)
    listeners.push(() => document.removeEventListener('pointermove', onMove))
    listeners.push(() => document.removeEventListener('pointerup', onUp))
    listeners.push(() => document.removeEventListener('pointercancel', cancel))
    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', cancel)
  }

  return {
    draggingId,
    dropBeforeId,
    dropAtEnd,
    onPointerDown,
    justDraggedRef,
  }
}

function GoalRow({ goal, drag, isLastSibling, onOpenMove, onArchive }: {
  goal: Goal
  drag: GoalDragProps
  isLastSibling: boolean
  onOpenMove: (option: MoveOption) => void
  onArchive: (goalId: string) => void
}) {
  const { data, collapsed, toggleCollapsed, applyData, notify } = useGoalsUi()
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const subs = data.goals.filter(item => item.parentId === goal.id)
  const isCollapsed = collapsed.has(goal.id)
  const inactive = !!(goal.completedAt || goal.archivedAt)
  const capped = priorityInUse(data.goals) >= 3 && !goal.priority
  const togglePriority = async () => {
    if (pending.current || inactive || capped) return
    pending.current = true; setSaving(true)
    try {
      const result = await setGoalPriorityAction({ data: { goalId: goal.id, priority: !goal.priority } })
      if (result.ok) applyData(result)
      else notify(result.message)
    } catch { notify('Priority was not saved. Try again.') }
    finally { pending.current = false; setSaving(false) }
  }
  const rowClasses = ['goal-row', inactive ? 'is-history' : '', drag.draggingId === goal.id ? 'is-dragged' : '', drag.dropBeforeId === goal.id ? 'is-drop-before' : '', drag.dropAtEnd && isLastSibling && drag.draggingId !== goal.id ? 'is-drop-end' : ''].filter(Boolean).join(' ')
  const progress = data.progress[goal.id]
  return <li data-goal-row={goal.id} data-goal-active={!inactive} className={subs.length ? 'goal has-subs' : 'goal'}>
    <div className={rowClasses} onPointerDown={event => { if (!inactive) drag.onPointerDown(event, goal.id) }}>
      {subs.length ? <button type="button" className="goal-chevron" aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${goal.title}`} onClick={() => toggleCollapsed(goal.id)}><ChevronIcon /></button> : <span className="goal-chevron" aria-hidden="true">{goal.parentId ? <ChevronIcon /> : <FlagIcon size={21} />}</span>}
      <div className="goal-row-copy">
        <Link className="goal-name" to="/goals/$goalId" params={{goalId:goal.id}}>{goal.title}</Link>
        <span className="goal-meta">{goal.completedAt ? 'Completed' : goal.kind === 'ongoing' ? 'Ongoing' : 'One-shot'} · <GoalProgressView progress={progress} /></span>
      </div>
      {!inactive ? <div className="goal-row-actions">
        {goal.priority ? <button type="button" className="goal-priority-btn" aria-label="Priority" aria-pressed={goal.priority} aria-disabled={capped || undefined} title={capped ? PRIORITY_LIMIT_MESSAGE : 'Priority'} disabled={saving} onClick={() => { if (capped) notify(PRIORITY_LIMIT_MESSAGE); else void togglePriority() }}>{goal.priority ? 'Priority' : 'Set priority'}</button> : null}
        <details className="goal-row-menu"><summary aria-label={`More actions for ${goal.title}`}>⋯</summary><div>
          {!goal.priority ? <button type="button" className="goal-priority-btn" aria-label="Priority" aria-pressed={goal.priority} aria-disabled={capped || undefined} title={capped ? PRIORITY_LIMIT_MESSAGE : 'Priority'} disabled={saving} onClick={() => { if (capped) notify(PRIORITY_LIMIT_MESSAGE); else void togglePriority() }}>{goal.priority ? 'Priority' : 'Set priority'}</button> : null}
          <button type="button" onClick={event => { event.currentTarget.closest('details')?.querySelector('summary')?.focus(); event.currentTarget.closest('details')?.removeAttribute('open'); onOpenMove({goal}) }}>Move…</button>
          <button type="button" aria-label="Archive" onClick={event => { event.currentTarget.closest('details')?.querySelector('summary')?.focus(); event.currentTarget.closest('details')?.removeAttribute('open'); onArchive(goal.id) }}>Archive…</button>
        </div></details>
      </div> : null}
    </div>
    {subs.length && !isCollapsed ? <ul className="goal-subgoals">{subs.map(sub => <GoalRow key={sub.id} goal={sub} drag={drag} isLastSibling={sub.id === subs.filter(item => !item.completedAt).at(-1)?.id} onOpenMove={onOpenMove} onArchive={onArchive} />)}</ul> : null}
  </li>
}

export function GoalsTree() {
  const { data, openCreate } = useGoalsUi()
  const drag = useGoalDrag()
  const [move, setMove] = useState<MoveOption | null>(null)
  const [archiveId, setArchiveId] = useState<string | null>(null)

  const tops = topLevelGoals(data.goals)
  if (!tops.length) {
    return (
      <div className="empty-state">
        <p>No goals yet.</p>
        <button type="button" className="plain-action" onClick={openCreate}>
          Create your first goal
        </button>
      </div>
    )
  }

  return (
    <>
      <ul
        className="goal-tree"
        onClickCapture={(event) => {
          if (drag.justDraggedRef.current) {
            event.preventDefault()
            event.stopPropagation()
            drag.justDraggedRef.current = null
          }
        }}
      >
        {tops.map((goal) => (
          <GoalRow
            key={goal.id}
            goal={goal}
            drag={drag}
            isLastSibling={goal.id === tops.filter(item => !item.completedAt).at(-1)?.id}
            onOpenMove={setMove}
            onArchive={setArchiveId}
          />
        ))}
      </ul>
      {tops.filter(goal => !goal.completedAt).length > 1 ? <p className="goal-reorder-hint">Long press, then drag to reorder.</p> : null}
      {archiveId ? <GoalRemovalDialog goalId={archiveId} action="archive" onClose={() => setArchiveId(null)} /> : null}
      {move ? (
        <MovePopover
          goal={move.goal}
          onClose={() => setMove(null)}
        />
      ) : null}
    </>
  )
}

export function ArchivedGoals() {
  const { data, applyData, notify } = useGoalsUi()
  const [savingId, setSavingId] = useState<string | null>(null)
  const pending = useRef(false)
  const restore = async (goal: Goal) => {
    if (pending.current) return
    pending.current = true; setSavingId(goal.id)
    try {
      const result = await restoreGoalAction({ data: { goalId: goal.id } })
      if (result.ok) { applyData(result); notify('Goal restored.') }
      else notify(result.message)
    } catch { notify('The goal was not restored. Try again.') }
    finally { pending.current = false; setSavingId(null) }
  }
  if (!data.archivedGoals.length) return <div className="empty-state"><p>No archived goals.</p></div>
  const roots = data.archivedGoals.filter(goal => !data.archivedGoals.some(parent => parent.id === goal.parentId))
  return <ul className="goal-tree is-archived">{roots.map(goal => <li key={goal.id}>
    <div className="goal-row is-history">
      <span className="goal-chevron" aria-hidden="true">{goal.parentId ? <ChevronIcon /> : <FlagIcon size={21} />}</span>
      <div className="goal-row-copy"><Link className="goal-name" to="/goals/$goalId" params={{goalId:goal.id}}>{goal.title}</Link><span className="goal-meta">Archived {goal.archivedAt ? formatShortDate(goal.archivedAt.slice(0,10)) : ''}</span></div>
      <button type="button" className="secondary-btn" disabled={savingId !== null} onClick={() => void restore(goal)}>{savingId === goal.id ? 'Restoring…' : 'Restore'}</button>
    </div>
    {data.archivedGoals.some(sub => sub.parentId === goal.id) ? <ul className="goal-subgoals">{data.archivedGoals.filter(sub => sub.parentId === goal.id).map(sub => <li key={sub.id}><div className="goal-row is-history"><span className="goal-chevron" aria-hidden="true"><FlagIcon /></span><Link className="goal-name" to="/goals/$goalId" params={{goalId:sub.id}}>{sub.title}</Link></div></li>)}</ul> : null}
  </li>)}</ul>
}
