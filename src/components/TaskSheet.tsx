import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import {
  archiveTaskAction,
  createTaskAction,
  deleteTaskAction,
  restoreTaskAction,
  setTaskDeadlineAction,
  setTaskGoalLinksAction,
  setTaskIdealDateAction,
  undoTaskCompletionAction,
  updateTaskAction,
} from '../domain/server'
import type { Task } from '../domain/store'
import { childrenOf, formatShortDate } from '../lib/tasksView'
import { tasksUrl } from '../lib/urlState'
import { ScheduleMenu } from './ScheduleMenu'
import { toggleTaskComplete } from './taskActions'
import { useTasksUi } from './tasksContext'

type CreateDraft = {
  name: string
  goalIds: string[]
  addToToday: boolean
  ideal: string | null
  deadline: string | null
  repeatable: boolean
  notes: string
  links: string[]
}

function blankDraft(presetGoalId?: string): CreateDraft {
  return {
    name: '',
    goalIds: presetGoalId ? [presetGoalId] : [],
    addToToday: false,
    ideal: null,
    deadline: null,
    repeatable: false,
    notes: '',
    links: [],
  }
}

/**
 * Creation drafts live in module memory: dismissing the sheet keeps the
 * draft, Create and Cancel clear it.
 */
let createDraft: CreateDraft | null = null

export function loadCreateDraft(presetGoalId?: string): CreateDraft {
  if (!createDraft) createDraft = blankDraft(presetGoalId)
  return createDraft
}

function rememberDraft(draft: CreateDraft | null) {
  createDraft = draft
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])
}

function SheetFrame({
  onClose,
  children,
  label,
}: {
  onClose: () => void
  children: ReactNode
  label: string
}) {
  return (
    <div
      className="sheet-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

function GoalChips({
  goalIds,
  addable,
  onAdd,
  onRemove,
}: {
  goalIds: string[]
  addable: string[]
  onAdd?: (goalId: string) => void
  onRemove?: (goalId: string) => void
}) {
  const { data } = useTasksUi()
  return (
    <div className="field">
      <span className="field-label">Goals</span>
      <div className="chips">
        {goalIds.map((goalId) => {
          const goal = data.goals.find((item) => item.id === goalId)
          if (!goal) return null
          return (
            <span key={goalId} className="link-chip">
              {goal.title}
              {onRemove ? (
                <button
                  type="button"
                  className="chip-remove"
                  aria-label={`Remove goal link ${goal.title}`}
                  onClick={() => onRemove(goalId)}
                >
                  ×
                </button>
              ) : null}
            </span>
          )
        })}
        {onAdd && addable.length ? (
          <details className="add-goal-menu">
            <summary className="link-chip">+ Add goal</summary>
            <div className="schedule-pop">
              {addable.map((goalId) => {
                const goal = data.goals.find((item) => item.id === goalId)
                if (!goal) return null
                return (
                  <button
                    key={goalId}
                    type="button"
                    onClick={() => onAdd(goalId)}
                  >
                    {goal.parentId ? '· ' : ''}
                    {goal.title}
                  </button>
                )
              })}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  )
}

function LinkEditor({
  links,
  onAdd,
  onRemove,
}: {
  links: string[]
  onAdd: (url: string) => void
  onRemove: (index: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const add = () => {
    const value = inputRef.current?.value.trim()
    if (value) {
      onAdd(value)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  return (
    <div className="field">
      <span className="field-label">Links</span>
      <div className="chips">
        {links.map((url, index) => (
          <span key={`${url}-${index}`} className="link-chip">
            {url}
            <button
              type="button"
              className="chip-remove"
              aria-label={`Remove link ${url}`}
              onClick={() => onRemove(index)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="add-inline">
        <input
          ref={inputRef}
          type="url"
          placeholder="Add a URL, one at a time"
          onKeyDown={(event) => {
            if (event.key === 'Enter') add()
          }}
        />
        <button type="button" className="go-btn" onClick={add}>
          Add
        </button>
      </div>
    </div>
  )
}

function DateFields({
  ideal,
  deadline,
  onIdeal,
  onDeadline,
}: {
  ideal: string | null
  deadline: string | null
  onIdeal: (value: string | null) => void
  onDeadline: (value: string | null) => void
}) {
  return (
    <div className="frow">
      <label className="field">
        <span className="field-label">Ideal completion date</span>
        <input
          type="date"
          value={ideal ?? ''}
          onChange={(event) => onIdeal(event.target.value || null)}
        />
      </label>
      <label className="field">
        <span className="field-label">Deadline</span>
        <input
          type="date"
          value={deadline ?? ''}
          onChange={(event) => onDeadline(event.target.value || null)}
        />
      </label>
    </div>
  )
}

function linkSummary(notes: string, links: string[]) {
  const parts = [
    notes ? 'Notes' : '',
    links.length
      ? `${links.length} ${links.length === 1 ? 'link' : 'links'}`
      : '',
  ]
  return parts.filter(Boolean).join(' · ')
}

export function CreateSheet({ onClose }: { onClose: () => void }) {
  const { data, search, applyData, notify } = useTasksUi()
  const [draft, setDraft] = useState(() =>
    loadCreateDraft(
      search.goal && search.goal !== 'priority' ? search.goal : undefined,
    ),
  )
  const [moreOpen, setMoreOpen] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  useEscape(onClose)
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const patch = (changes: Partial<CreateDraft>) => {
    // Apply against the current draft: callbacks captured by notices (the
    // date-replacement Undo) may run after further edits; spreading over the
    // captured render draft would silently drop those interim edits.
    setDraft((current) => {
      const next = { ...current, ...changes }
      rememberDraft(next)
      return next
    })
  }

  const replaceDate = (kind: 'ideal' | 'deadline', value: string | null) => {
    const previous = { ideal: draft.ideal, deadline: draft.deadline }
    const other = kind === 'ideal' ? 'deadline' : 'ideal'
    if (value && previous[other]) {
      patch({ [kind]: value, [other]: null })
      notify(
        kind === 'ideal'
          ? 'Deadline removed.'
          : 'Ideal completion date removed.',
        () => patch(previous),
      )
      return
    }
    patch({ [kind]: value })
  }

  const create = async () => {
    const name = draft.name.trim()
    if (!name) {
      nameRef.current?.focus()
      return
    }
    const result = await createTaskAction({
      data: {
        task: {
          title: name,
          goalIds: draft.goalIds,
          idealCompletionDate: draft.ideal ?? undefined,
          deadline: draft.deadline ?? undefined,
          repeatable: draft.repeatable,
          notes: draft.notes,
          externalLinks: draft.links,
        },
        planForToday: draft.addToToday,
      },
    })
    if (result.ok) {
      rememberDraft(null)
      applyData(result)
      onClose()
      notify('Task created.')
    } else {
      notify(result.message)
    }
  }

  const addable = data.goals
    .filter((goal) => !draft.goalIds.includes(goal.id))
    .map((goal) => goal.id)

  return (
    <SheetFrame onClose={onClose} label="New task">
      <div className="sheet-head">
        <input
          ref={nameRef}
          className="sheet-title"
          value={draft.name}
          placeholder="What is it?"
          aria-label="Task name"
          onChange={(event) => patch({ name: event.target.value })}
        />
        <button
          type="button"
          className="close-x"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={draft.addToToday}
          onChange={(event) => patch({ addToToday: event.target.checked })}
        />
        Add to Today
      </label>
      <GoalChips
        goalIds={draft.goalIds}
        addable={addable}
        onAdd={(goalId) => patch({ goalIds: [...draft.goalIds, goalId] })}
        onRemove={(goalId) =>
          patch({ goalIds: draft.goalIds.filter((id) => id !== goalId) })
        }
      />
      <button
        type="button"
        className="disclosure-btn"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen(!moreOpen)}
      >
        › More options
        <span className="more-summary">
          {linkSummary(draft.notes, draft.links)}
        </span>
      </button>
      {moreOpen ? (
        <div className="disclosure-body">
          <DateFields
            ideal={draft.ideal}
            deadline={draft.deadline}
            onIdeal={(value) => replaceDate('ideal', value)}
            onDeadline={(value) => replaceDate('deadline', value)}
          />
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.repeatable}
              onChange={(event) => patch({ repeatable: event.target.checked })}
            />
            Repeatable
            <span className="check-hint">
              A fresh copy is created after each completion.
            </span>
          </label>
          <label className="field">
            <span className="field-label">Notes</span>
            <textarea
              value={draft.notes}
              rows={3}
              onChange={(event) => patch({ notes: event.target.value })}
            />
          </label>
          <LinkEditor
            links={draft.links}
            onAdd={(url) => patch({ links: [...draft.links, url] })}
            onRemove={(index) =>
              patch({ links: draft.links.filter((_, i) => i !== index) })
            }
          />
        </div>
      ) : null}
      <div className="form-foot">
        <button
          type="button"
          className="primary-btn"
          onClick={() => void create()}
        >
          Create task
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => {
            rememberDraft(null)
            onClose()
          }}
        >
          Cancel
        </button>
      </div>
    </SheetFrame>
  )
}

function AddSubtaskInput({
  parentId,
  onDone,
}: {
  parentId: string
  onDone?: () => void
}) {
  const { applyData, notify } = useTasksUi()
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  const commit = async () => {
    const title = inputRef.current?.value.trim()
    if (!title) return
    const result = await createTaskAction({
      data: { task: { title, parentId } },
    })
    if (result.ok) {
      applyData(result)
      if (inputRef.current) inputRef.current.value = ''
      onDone?.()
    } else {
      notify(result.message)
    }
  }
  return (
    <input
      ref={inputRef}
      className="subtask-add-input"
      placeholder="Subtask name, Enter to add"
      aria-label="New subtask name"
      onKeyDown={(event) => {
        if (event.key === 'Enter') void commit()
        if (event.key === 'Escape') onDone?.()
      }}
    />
  )
}

function SubtaskTree({ parentId }: { parentId: string }) {
  const { data, applyData, notify } = useTasksUi()
  const [addingUnder, setAddingUnder] = useState<string | 'root' | null>(null)
  const siblings = childrenOf(data.tasks).get(parentId) ?? []

  const removeSubtask = async (task: Task) => {
    const result = await deleteTaskAction({ data: { taskId: task.id } })
    if (result.ok) applyData(result)
    else notify(result.message)
  }

  const renameSubtask = (sub: Task, value: string) => {
    const title = value.trim()
    if (!title || title === sub.title) return
    void updateTaskAction({ data: { taskId: sub.id, title } }).then(
      (result) => {
        if (result.ok) applyData(result)
        else notify(result.message)
      },
    )
  }

  return (
    <ul className="subtask-tree">
      {siblings.map((sub) => (
        <li key={sub.id}>
          <div className="subtask-row">
            <button
              type="button"
              className={
                sub.completedAt ? 'task-circle is-done' : 'task-circle'
              }
              aria-label={
                sub.completedAt
                  ? `Reopen ${sub.title}`
                  : `Complete ${sub.title}`
              }
              onClick={() => void toggleTaskComplete(sub, { applyData, notify })}
            >
              ✓
            </button>
            <input
              className="subtask-name"
              defaultValue={sub.title}
              aria-label="Subtask name"
              onBlur={(event) => renameSubtask(sub, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={`Add a subtask under ${sub.title}`}
              onClick={() => setAddingUnder(addingUnder === sub.id ? null : sub.id)}
            >
              +
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Delete ${sub.title}`}
              onClick={() => void removeSubtask(sub)}
            >
              ×
            </button>
          </div>
          {childrenOf(data.tasks).get(sub.id)?.length ? (
            <div className="subtask-children">
              <SubtaskTree parentId={sub.id} />
            </div>
          ) : null}
          {addingUnder === sub.id ? (
            <AddSubtaskInput parentId={sub.id} />
          ) : null}
        </li>
      ))}
      <li>
        {addingUnder === 'root' ? (
          <AddSubtaskInput
            parentId={parentId}
            onDone={() => setAddingUnder(null)}
          />
        ) : (
          <button
            type="button"
            className="disclosure-btn"
            onClick={() => setAddingUnder('root')}
          >
            + Add subtask
          </button>
        )}
      </li>
    </ul>
  )
}

export function TaskSheet({
  taskId,
  onClose,
}: {
  taskId: string
  onClose: () => void
}) {
  const { data } = useTasksUi()
  useEscape(onClose)
  const task = data.tasks.find((item) => item.id === taskId)

  if (!task) {
    return (
      <SheetFrame onClose={onClose} label="Task">
        <div className="sheet-head">
          <p className="sheet-missing">Task not found</p>
          <button
            type="button"
            className="close-x"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <a className="plain-action" href={tasksUrl({})}>
          Tasks
        </a>
      </SheetFrame>
    )
  }
  return <TaskSheetBody key={task.id} task={task} onClose={onClose} />
}

function TaskSheetBody({
  task,
  onClose,
}: {
  task: Task
  onClose: () => void
}) {
  const { data, applyData, notify } = useTasksUi()
  const [title, setTitle] = useState(task.title)
  const [moreOpen, setMoreOpen] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ field: 'title' | 'notes'; value: string } | null>(
    null,
  )

  const flush = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const change = pending.current
    pending.current = null
    if (change) {
      void updateTaskAction({
        data: { taskId: task.id, [change.field]: change.value },
      }).then((result) => {
        if (result.ok) applyData(result)
      })
    }
  }

  useEffect(() => flush, [])

  const scheduleSave = (field: 'title' | 'notes', value: string) => {
    pending.current = { field, value }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flush, 600)
  }

  const replaceDate = async (
    kind: 'ideal' | 'deadline',
    value: string | null,
  ) => {
    const previous = {
      ideal: task.idealCompletionDate,
      deadline: task.deadline,
    }
    const action =
      kind === 'ideal' ? setTaskIdealDateAction : setTaskDeadlineAction
    const result = await action({ data: { taskId: task.id, value } })
    if (!result.ok) {
      notify(result.message)
      return
    }
    applyData(result)
    const other = kind === 'ideal' ? 'deadline' : 'ideal'
    if (value && previous[other]) {
      notify(
        kind === 'ideal'
          ? 'Deadline removed.'
          : 'Ideal completion date removed.',
        async () => {
          const undoAction =
            other === 'ideal' ? setTaskIdealDateAction : setTaskDeadlineAction
          const undo = await undoAction({
            data: { taskId: task.id, value: previous[other] },
          })
          if (undo.ok) applyData(undo)
        },
      )
    }
  }

  const addable = data.goals
    .filter((goal) => !task.goalIds.includes(goal.id))
    .map((goal) => goal.id)
  const lastDone = data.previous[task.id]
  const active = !task.completedAt && !task.archivedAt

  const setGoalLinks = (goalIds: string[]) => {
    void setTaskGoalLinksAction({
      data: { taskId: task.id, goalIds },
    }).then((result) => {
      if (result.ok) applyData(result)
      else notify(result.message)
    })
  }

  const changeLinks = (links: string[]) => {
    void updateTaskAction({
      data: { taskId: task.id, externalLinks: links },
    }).then((result) => {
      if (result.ok) applyData(result)
      else notify(result.message)
    })
  }

  return (
    <SheetFrame onClose={onClose} label="Task">
      <div className="sheet-head">
        <input
          className="sheet-title"
          value={title}
          aria-label="Task name"
          onChange={(event) => {
            setTitle(event.target.value)
            scheduleSave('title', event.target.value)
          }}
          onBlur={flush}
        />
        <button
          type="button"
          className="close-x"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="sheet-facts">
        {task.blocked ? <span className="state-label">Blocked</span> : null}
        {task.repeatable ? <span className="rep-mark">Repeatable</span> : null}
        {task.completedAt ? (
          <span className="date-txt">
            Completed {formatShortDate(task.completedAt.slice(0, 10))}
          </span>
        ) : null}
        {task.archivedAt ? (
          <span className="date-txt">
            Archived {formatShortDate(task.archivedAt.slice(0, 10))}
          </span>
        ) : null}
      </div>
      {active ? (
        <div className="sheet-plan">
          <ScheduleMenu task={task} variant="button" />
        </div>
      ) : null}
      {task.repeatable && lastDone ? (
        <p className="rep-line">
          Last done {formatShortDate(lastDone.slice(0, 10))}
        </p>
      ) : null}
      <DateFields
        ideal={task.idealCompletionDate}
        deadline={task.deadline}
        onIdeal={(value) => void replaceDate('ideal', value)}
        onDeadline={(value) => void replaceDate('deadline', value)}
      />
      {!task.parentId && active ? (
        <GoalChips
          goalIds={task.goalIds}
          addable={addable}
          onAdd={(goalId) => setGoalLinks([...task.goalIds, goalId])}
          onRemove={(goalId) =>
            setGoalLinks(task.goalIds.filter((id) => id !== goalId))
          }
        />
      ) : null}
      <button
        type="button"
        className="disclosure-btn"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen(!moreOpen)}
      >
        › More options
        <span className="more-summary">
          {linkSummary(task.notes, task.externalLinks)}
        </span>
      </button>
      {moreOpen ? (
        <div className="disclosure-body">
          <label className="field">
            <span className="field-label">Notes</span>
            <textarea
              defaultValue={task.notes}
              rows={3}
              onChange={(event) => scheduleSave('notes', event.target.value)}
              onBlur={flush}
            />
          </label>
          <LinkEditor
            links={task.externalLinks}
            onAdd={(url) => changeLinks([...task.externalLinks, url])}
            onRemove={(index) =>
              changeLinks(task.externalLinks.filter((_, i) => i !== index))
            }
          />
        </div>
      ) : null}
      <h2 className="sheet-section">Subtasks</h2>
      <SubtaskTree parentId={task.id} />
      <div className="form-foot">
        {task.archivedAt ? (
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              void restoreTaskAction({ data: { taskId: task.id } }).then(
                (result) => {
                  if (result.ok) {
                    applyData(result)
                    notify('Task restored.')
                  } else notify(result.message)
                },
              )
            }}
          >
            Restore
          </button>
        ) : null}
        {task.completedAt ? (
          <button
            type="button"
            className="secondary-btn"
            onClick={() => void toggleTaskComplete(task, { applyData, notify })}
          >
            Reopen
          </button>
        ) : null}
        {!task.completedAt && !task.archivedAt ? (
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              void archiveTaskAction({ data: { taskId: task.id } }).then(
                (result) => {
                  if (result.ok) {
                    applyData(result)
                    notify('Task archived.', async () => {
                      const undo = await restoreTaskAction({
                        data: { taskId: task.id },
                      })
                      if (undo.ok) applyData(undo)
                    })
                  } else notify(result.message)
                },
              )
            }}
          >
            Archive
          </button>
        ) : null}
        <button type="button" className="secondary-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </SheetFrame>
  )
}
