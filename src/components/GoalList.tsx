import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

import {
  archiveGoalAction,
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
} from '../lib/goalsView'
import { formatShortDate } from '../lib/tasksView'
import { tasksUrl } from '../lib/urlState'
import { useGoalsUi } from './goalsContext'

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

function MoveIcon() {
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
      <path d="M3.5 13.5V8a3 3 0 0 1 3-3h6" />
      <path d="M10 2.5L12.5 5 10 7.5" />
    </svg>
  )
}

function ArchiveIcon() {
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
      <rect x="2.5" y="3" width="11" height="3" rx="0.5" />
      <path d="M4 6v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6" />
      <path d="M6.5 8.5h3" />
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
  if (progress.kind === 'one_shot' && progress.total) {
    return (
      <>
        <span
          className={wide ? 'goal-bar is-wide' : 'goal-bar'}
          aria-hidden="true"
        >
          <span style={{ width: `${progress.percentage}%` }} />
        </span>
        <span className="goal-count">{progress.text}</span>
      </>
    )
  }
  return <span className="goal-count">{progress.text}</span>
}

type MoveOption = { goal: Goal; anchor: DOMRect }

function MovePopover({
  goal,
  anchor,
  onClose,
}: {
  goal: Goal
  anchor: DOMRect
  onClose: () => void
}) {
  const { data, applyData, notify } = useGoalsUi()
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const options: Array<{
    label: string
    parentId: string | null
    disabled?: boolean
  }> = []
  if (goal.parentId) options.push({ label: 'Top level', parentId: null })
  else
    options.push({
      label: 'Top level (current)',
      parentId: null,
      disabled: true,
    })
  for (const top of topLevelGoals(data.goals)) {
    if (top.id === goal.id || top.id === goal.parentId) continue
    options.push({ label: top.title, parentId: top.id })
  }

  const move = async (parentId: string | null) => {
    const result = await moveGoalAction({
      data: { goalId: goal.id, parentId },
    })
    if (result.ok) {
      applyData(result)
      onClose()
    } else {
      notify(result.message)
    }
  }

  return (
    <div
      className="move-popover"
      ref={popoverRef}
      style={{
        top: anchor.bottom + 6,
        left: Math.max(12, Math.min(anchor.left, window.innerWidth - 240)),
      }}
    >
      <div className="move-popover-title">Move to</div>
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          disabled={option.disabled}
          onClick={() => void move(option.parentId)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
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

  const onPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    goalId: string,
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('a, button, input, select, textarea, label')) return
    const row = event.currentTarget.closest(
      '[data-goal-row]',
    ) as HTMLElement | null
    if (!row) return

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
      setDraggingId((current) => (current === goalId ? null : current))
      document.body.classList.remove('is-goal-dragging')
    }

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
          list.querySelectorAll(':scope > [data-goal-row]'),
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

    const onUp = () => {
      const wasEngaged = engaged
      clearTimeout(timer)
      removeListeners()
      document.body.classList.remove('is-goal-dragging')
      setDraggingId(null)
      setDropBeforeId(null)
      setDropAtEnd(false)
      if (!wasEngaged) return

      const list = row.parentElement
      const siblings = (
        Array.from(
          list?.querySelectorAll(':scope > [data-goal-row]') ?? [],
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
      void (async () => {
        const result = await reorderGoalsAction({
          data: { goalId, afterGoalId: afterGoalId },
        })
        if (result.ok) applyData(result)
        else notify(result.message)
      })()
    }

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

function GoalRow({
  goal,
  drag,
  isLastSibling,
  onOpenMove,
}: {
  goal: Goal
  drag: GoalDragProps
  isLastSibling: boolean
  onOpenMove: (option: MoveOption) => void
}) {
  const { data, collapsed, toggleCollapsed, applyData, notify } = useGoalsUi()

  const subs = data.goals.filter((item) => item.parentId === goal.id)
  const isCollapsed = collapsed.has(goal.id)
  const full = priorityInUse(data.goals) >= 3
  const capped = full && !goal.priority
  const togglePriority = async () => {
    const result = await setGoalPriorityAction({
      data: { goalId: goal.id, priority: !goal.priority },
    })
    if (result.ok) applyData(result)
    else notify(result.message)
  }

  const archive = async () => {
    const result = await archiveGoalAction({ data: { goalId: goal.id } })
    if (!result.ok) {
      notify(result.message)
      return
    }
    applyData(result)
    notify('Goal archived.', {
      actionLabel: 'Restore',
      undo: async () => {
        const undo = await restoreGoalAction({ data: { goalId: goal.id } })
        if (undo.ok) applyData(undo)
        else notify(undo.message)
      },
    })
  }

  const rowClasses = [
    'goal-row',
    drag.draggingId === goal.id ? 'is-dragged' : '',
    drag.dropBeforeId === goal.id ? 'is-drop-before' : '',
    drag.dropAtEnd && isLastSibling && drag.draggingId !== goal.id
      ? 'is-drop-end'
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li
      data-goal-row={goal.id}
      className={subs.length ? 'goal has-subs' : 'goal'}
    >
      <div
        className={rowClasses}
        onPointerDown={(event) => drag.onPointerDown(event, goal.id)}
      >
        {subs.length ? (
          <button
            type="button"
            className="goal-chevron"
            aria-expanded={!isCollapsed}
            aria-label={
              isCollapsed ? `Expand ${goal.title}` : `Collapse ${goal.title}`
            }
            onClick={() => toggleCollapsed(goal.id)}
          >
            <ChevronIcon />
          </button>
        ) : (
          <span className="goal-chevron" aria-hidden="true" />
        )}
        <Link
          className="goal-name"
          to="/goals/$goalId"
          params={{ goalId: goal.id }}
        >
          {goal.title}
        </Link>
        {goal.priority ? (
          <span className="flag-mark" aria-label="Priority goal">
            <FlagIcon />
          </span>
        ) : null}
        <span className="goal-spacer" />
        <span className="goal-meta">
          <GoalProgressView progress={data.progress[goal.id]} />
        </span>
        <span className="goal-row-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label="Priority"
            aria-pressed={goal.priority}
            aria-disabled={capped || undefined}
            title={capped ? PRIORITY_LIMIT_MESSAGE : 'Priority'}
            onClick={() => {
              if (capped) {
                notify(PRIORITY_LIMIT_MESSAGE)
                return
              }
              void togglePriority()
            }}
          >
            <FlagIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Move to another place in the hierarchy"
            onClick={(event) =>
              onOpenMove({
                goal,
                anchor: event.currentTarget.getBoundingClientRect(),
              })
            }
          >
            <MoveIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Archive"
            onClick={() => void archive()}
          >
            <ArchiveIcon />
          </button>
        </span>
      </div>
      {subs.length && !isCollapsed ? (
        <ul className="goal-subgoals">
          {subs.map((sub, index) => (
            <GoalRow
              key={sub.id}
              goal={sub}
              drag={drag}
              isLastSibling={index === subs.length - 1}
              onOpenMove={onOpenMove}
            />
          ))}
          <li className="goal-tasks-link">
            <Link to={tasksUrl({ goal: goal.id })}>View tasks</Link>
          </li>
        </ul>
      ) : null}
    </li>
  )
}

export function GoalsTree() {
  const { data, openCreate } = useGoalsUi()
  const drag = useGoalDrag()
  const [move, setMove] = useState<MoveOption | null>(null)

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
        {tops.map((goal, index) => (
          <GoalRow
            key={goal.id}
            goal={goal}
            drag={drag}
            isLastSibling={index === tops.length - 1}
            onOpenMove={setMove}
          />
        ))}
      </ul>
      {move ? (
        <MovePopover
          goal={move.goal}
          anchor={move.anchor}
          onClose={() => setMove(null)}
        />
      ) : null}
    </>
  )
}

export function ArchivedGoals() {
  const { data, applyData, notify } = useGoalsUi()

  const restore = async (goal: Goal) => {
    const result = await restoreGoalAction({ data: { goalId: goal.id } })
    if (result.ok) applyData(result)
    else notify(result.message)
  }

  if (!data.archivedGoals.length) {
    return (
      <div className="empty-state">
        <p>No archived goals.</p>
      </div>
    )
  }
  return (
    <ul className="goal-tree is-archived">
      {data.archivedGoals.map((goal) => (
        <li key={goal.id}>
          <div className="goal-row is-history">
            <span className="goal-chevron" aria-hidden="true" />
            <Link
              className="goal-name"
              to="/goals/$goalId"
              params={{ goalId: goal.id }}
            >
              {goal.title}
            </Link>
            <span className="goal-spacer" />
            <span className="goal-meta">
              {goal.archivedAt ? (
                <span className="goal-count">
                  Archived {formatShortDate(goal.archivedAt.slice(0, 10))}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => void restore(goal)}
            >
              Restore
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
