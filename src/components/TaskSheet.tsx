import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import {
  archiveTaskAction, createTaskAction, deleteTaskAction, restoreTaskAction,
  setTaskDeadlineAction, setTaskGoalLinksAction, setTaskIdealDateAction,
  updateTaskAction,
} from '../domain/server'
import type { TasksActionResult } from '../domain/server'
import type { Task } from '../domain/store'
import { childrenOf, formatShortDate } from '../lib/tasksView'
import { tasksUrl } from '../lib/urlState'
import { CompleteCircle, ScheduleMenu, ancestorDeadline } from './ScheduleMenu'
import { toggleTaskComplete } from './taskActions'
import { useTasksUi } from './tasksContext'
import './task-sheets.css'

type LinkDraft = { value: string; error: string }
type CreateDraft = {
  name: string; goalIds: string[]; addToToday: boolean; ideal: string | null
  deadline: string | null; repeatable: boolean; notes: string; links: string[]; linkDraft: LinkDraft
}
let createDraft: CreateDraft | null = null
let creating = false
const createListeners = new Set<() => void>()
export function loadCreateDraft(presetGoalId?: string): CreateDraft {
  return createDraft ??= { name: '', goalIds: presetGoalId ? [presetGoalId] : [],
    addToToday: false, ideal: null, deadline: null, repeatable: false, notes: '', links: [], linkDraft: { value: '', error: '' } }
}

function SheetFrame({ onClose, children, label }: {
  onClose: () => void; children: ReactNode; label: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const trigger = document.activeElement
    const dialog = ref.current
    dialog?.showModal()
    dialog?.querySelector<HTMLElement>('[data-initial-focus]')?.focus()
    return () => {
      dialog?.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [])
  return (
    <dialog ref={ref} className="sheet-overlay task-sheet-dialog" role="dialog" aria-modal="true" aria-label={label}
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]'))
          .filter(element => element.getClientRects().length > 0)
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="sheet task-sheet">
        <div className="sheet-head"><h2>{label}</h2>
          <button type="button" className="secondary-btn" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="field-error" role="alert">{children}</p> : null
}
function validUrl(value: string) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}

function GoalChips({ goalIds, onChange, busy = false, inherited = false }: {
  goalIds: string[]; onChange?: (ids: string[]) => void; busy?: boolean; inherited?: boolean
}) {
  const { data } = useTasksUi()
  const menu = useRef<HTMLDetailsElement>(null)
  const addable = data.goals.filter(goal => !goal.completedAt && !goal.archivedAt && !goalIds.includes(goal.id))
  return <div className="field"><span className="field-label">Goals</span>
    <div className="chips">
      {goalIds.map(id => <span className="link-chip" key={id}>
        {data.goals.find(goal => goal.id === id)?.title ?? 'Previous goal'}
        {onChange ? <button type="button" className="chip-remove" disabled={busy}
          aria-label={`Remove goal link ${data.goals.find(goal => goal.id === id)?.title ?? id}`}
          onClick={() => onChange(goalIds.filter(value => value !== id))}>×</button> : null}
      </span>)}
      {onChange && addable.length ? <details className="add-goal-menu" ref={menu}>
        <summary className="link-chip">+ Add goal</summary>
        <div className="schedule-pop">{addable.map(goal => <button type="button" key={goal.id}
          disabled={busy} onClick={() => { menu.current?.removeAttribute('open'); onChange([...goalIds, goal.id]) }}>
          {goal.parentId ? '· ' : ''}{goal.title}
        </button>)}</div>
      </details> : null}
      {!goalIds.length && (!onChange || !addable.length) ? <span className="field-hint">{onChange ? "No active goals." : "No goals"}</span> : null}
    </div>
    {inherited ? <p className="field-hint">Linked through the parent task.</p> : null}
  </div>
}

function LinkEditor({ links, onChange, draft, onDraftChange, disabled = false }: {
  links: string[]; onChange?: (links: string[]) => Promise<boolean> | boolean; disabled?: boolean
  draft: LinkDraft; onDraftChange: (patch: Partial<LinkDraft>) => void
}) {
  const { value, error } = draft
  const input = useRef<HTMLInputElement>(null)
  const add = async () => {
    if (!validUrl(value.trim())) { onDraftChange({ error: 'Enter a full http or https URL.' }); input.current?.focus(); return }
    if (await onChange?.([...links, value.trim()])) { onDraftChange({ value: '', error: '' }) }
  }
  return <div className="field"><span className="field-label">Links</span>
    <div className="task-external-links">{links.map((url, i) => <div key={`${url}-${i}`}>
      {validUrl(url) ? <a href={url} target="_blank" rel="noreferrer">{url}</a> : <span>{url}</span>}
      {onChange ? <button type="button" className="chip-remove" disabled={disabled}
        aria-label={`Remove link ${url}`} onClick={() => void onChange(links.filter((_, index) => index !== i))}>×</button> : null}
    </div>)}</div>
    {onChange ? <div className="add-inline"><input ref={input} type="url" value={value}
      placeholder="Add a URL, one at a time" aria-label="New URL" aria-invalid={Boolean(error)}
      disabled={disabled} onChange={event => onDraftChange({ value: event.target.value, error: '' })}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void add() } }} />
      <button type="button" className="go-btn" disabled={disabled} onClick={() => void add()}>Add</button>
    </div> : null}<ErrorText>{error}</ErrorText>
  </div>
}

function DateFields({ ideal, deadline, onIdeal, onDeadline, max, disabled = false }: {
  ideal: string | null; deadline: string | null; max?: string; disabled?: boolean
  onIdeal?: (value: string | null) => void; onDeadline?: (value: string | null) => void
}) {
  return <div className="frow">{([
    ['Ideal completion date', ideal, onIdeal], ['Deadline', deadline, onDeadline],
  ] as const).map(([label, value, change]) => <label className="field" key={label}>
    <span className="field-label">{label}</span>
    {change ? <input type="date" value={value ?? ''} max={max} disabled={disabled}
      onChange={event => change(event.target.value || null)} /> : <span>{value ? formatShortDate(value) : 'None'}</span>}
  </label>)}</div>
}

function MoreOptions({ open, toggle, children, notes, links }: {
  open: boolean; toggle: () => void; children: ReactNode; notes: string; links: string[]
}) {
  return <><button type="button" className="disclosure-btn" aria-expanded={open} onClick={toggle}>
    › More options<span className="more-summary">{[notes ? 'Notes' : '', links.length ? `${links.length} ${links.length === 1 ? 'link' : 'links'}` : ''].filter(Boolean).join(' · ')}</span>
  </button>{open ? <div className="disclosure-body">{children}</div> : null}</>
}

export function CreateSheet({ onClose }: { onClose: () => void }) {
  const { data, search, applyData, notify } = useTasksUi()
  const preset = data.goals.some(goal => goal.id === search.goal && !goal.completedAt && !goal.archivedAt) ? search.goal : undefined
  const [draft, setDraft] = useState(() => loadCreateDraft(preset))
  const [moreOpen, setMoreOpen] = useState(false)
  const [error, setError] = useState('')
  const [nameError, setNameError] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const saving = useSyncExternalStore(listener => { createListeners.add(listener); return () => { createListeners.delete(listener) } }, () => creating, () => false)
  const patch = (changes: Partial<CreateDraft>) => setDraft(current => {
    const next = { ...current, ...changes }; createDraft = next; return next
  })
  const replaceDate = (kind: 'ideal' | 'deadline', value: string | null) => {
    const previous = { ideal: draft.ideal, deadline: draft.deadline }
    const other = kind === 'ideal' ? 'deadline' : 'ideal'
    patch(value ? { [kind]: value, [other]: null } : { [kind]: null })
    if (value && previous[other]) notify(kind === 'ideal' ? 'Deadline removed.' : 'Ideal completion date removed.', () => patch(previous))
  }
  const create = async () => {
    if (creating) return
    if (!draft.name.trim()) { setNameError(true); nameRef.current?.focus(); return }
    creating = true; createListeners.forEach(fn => fn()); setError('')
    try {
      const result = await createTaskAction({ data: { task: {
        title: draft.name.trim(), goalIds: draft.goalIds,
        idealCompletionDate: draft.ideal ?? undefined, deadline: draft.deadline ?? undefined,
        repeatable: draft.repeatable, notes: draft.notes, externalLinks: draft.links,
      }, planForToday: draft.addToToday } })
      if (!result.ok) { setError(result.message); return }
      createDraft = null; applyData(result); onClose(); notify('Task created.')
    } catch { setError('The task was not saved. Try again.') }
    finally { creating = false; createListeners.forEach(fn => fn()) }
  }
  return <SheetFrame onClose={onClose} label="New task">
    <label className="field"><span className="field-label">Task name</span>
      <input ref={nameRef} data-initial-focus className="sheet-title" value={draft.name} disabled={saving}
        aria-label="Task name" aria-invalid={nameError} onChange={event => { patch({ name: event.target.value }); setNameError(false) }} />
    </label><ErrorText>{nameError ? 'Enter a task name.' : ''}</ErrorText>
    <label className="check-row"><input type="checkbox" checked={draft.addToToday} disabled={saving}
      onChange={event => patch({ addToToday: event.target.checked })} />Add to Today</label>
    <GoalChips goalIds={draft.goalIds} busy={saving} onChange={goalIds => patch({ goalIds })} />
    <MoreOptions open={moreOpen} toggle={() => setMoreOpen(!moreOpen)} notes={draft.notes} links={draft.links}>
      <DateFields ideal={draft.ideal} deadline={draft.deadline} disabled={saving}
        onIdeal={value => replaceDate('ideal', value)} onDeadline={value => replaceDate('deadline', value)} />
      <label className="check-row"><input type="checkbox" checked={draft.repeatable} disabled={saving}
        onChange={event => patch({ repeatable: event.target.checked })} />Repeatable</label>
      <p className="field-hint">A fresh copy is created after each completion.</p>
      <label className="field"><span className="field-label">Notes</span><textarea value={draft.notes} rows={3}
        disabled={saving} onChange={event => patch({ notes: event.target.value })} /></label>
      <LinkEditor links={draft.links} draft={draft.linkDraft} onDraftChange={changes => patch({ linkDraft: { ...draft.linkDraft, ...changes } })} disabled={saving} onChange={links => { patch({ links }); return true }} />
    </MoreOptions>
    <ErrorText>{error}</ErrorText>
    <div className="form-foot"><button type="button" className="primary-btn" disabled={saving} onClick={() => void create()}>{saving ? 'Creating…' : 'Create task'}</button>
      <button type="button" className="secondary-btn" disabled={saving} onClick={() => { createDraft = null; onClose() }}>Cancel</button>
    </div>
  </SheetFrame>
}

// Session memory keeps unsaved fields recoverable even if the sheet closes during a request.
type Edits = { title: string; notes: string }
type EditBuffer = { values: Edits; linkDraft: LinkDraft; pending: Partial<Edits>; saving: boolean; error: string; version: number; listeners: Set<() => void> }
const edits = new Map<string, EditBuffer>()
function useTaskEdits(task: Task) {
  const { applyData } = useTasksUi()
  const buffer = edits.get(task.id) ?? { values: { title: task.title, notes: task.notes }, linkDraft: { value: '', error: '' }, pending: {}, saving: false, error: '', version: 0, listeners: new Set<() => void>() }
  if (typeof window !== 'undefined') edits.set(task.id, buffer)
  const emit = () => { buffer.version++; buffer.listeners.forEach(fn => fn()) }
  useSyncExternalStore(listener => { buffer.listeners.add(listener); return () => { buffer.listeners.delete(listener) } }, () => buffer.version, () => buffer.version)
  useEffect(() => {
    if (!buffer.saving && !Object.keys(buffer.pending).length &&
      (buffer.values.title !== task.title || buffer.values.notes !== task.notes)) {
      buffer.values = { title: task.title, notes: task.notes }; emit()
    }
  }, [task.title, task.notes])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flush = async () => {
    if (timer.current) clearTimeout(timer.current)
    if (buffer.saving || !Object.keys(buffer.pending).length) return
    if (!buffer.values.title.trim()) { buffer.error = 'Enter a task name.'; emit(); return }
    buffer.saving = true; buffer.error = ''; emit()
    // Serialize saves. Edits made while a request is pending become the next patch.
    while (Object.keys(buffer.pending).length) {
      const sent = { ...buffer.pending }
      try {
        const result = await updateTaskAction({ data: { taskId: task.id, ...sent } })
        if (!result.ok) { buffer.error = result.message; break }
        for (const field of Object.keys(sent) as (keyof Edits)[]) {
          if (buffer.pending[field] === sent[field]) delete buffer.pending[field]
        }
        applyData(result)
      } catch { buffer.error = 'The changes were not saved.'; break }
    }
    buffer.saving = false; emit()
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (!buffer.error) void flush() }, [task.id])
  const change = (field: keyof Edits, value: string) => {
    buffer.values[field] = value; buffer.pending[field] = value; buffer.error = ''; emit()
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 600)
  }
  const changeLinkDraft = (patch: Partial<LinkDraft>) => { buffer.linkDraft = { ...buffer.linkDraft, ...patch }; emit() }
  return { buffer, change, flush, changeLinkDraft }
}

function AddSubtaskInput({ parentId, onDone }: { parentId: string; onDone: () => void }) {
  const { applyData } = useTasksUi()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const pending = useRef(false)
  useEffect(() => { input.current?.focus() }, [])
  const commit = async () => {
    if (pending.current) return
    if (!value.trim()) { setError('Enter a task name.'); return }
    pending.current = true; setSaving(true)
    try {
      const result = await createTaskAction({ data: { task: { title: value.trim(), parentId } } })
      if (result.ok) { applyData(result); onDone() } else setError(result.message)
    } catch { setError('The subtask was not saved. Try again.') }
    finally { pending.current = false; setSaving(false) }
  }
  return <div><input ref={input} className="subtask-add-input" placeholder="Subtask name, Enter to add" aria-label="New subtask name"
    value={value} disabled={saving} onChange={event => setValue(event.target.value)}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); void commit() }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onDone() }
    }} /><ErrorText>{error}</ErrorText></div>
}

function DeleteWarning({ task, onCancel, onDeleted }: { task: Task; onCancel: () => void; onDeleted: () => void }) {
  const { applyData } = useTasksUi()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const remove = async () => {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try {
      const result = await deleteTaskAction({ data: { taskId: task.id } })
      if (result.ok) { edits.delete(task.id); applyData(result); onDeleted() } else setError(result.message)
    } catch { setError('The task was not deleted. Try again.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <section className="task-delete-warning" role="alert" aria-label="Delete task warning">
    <h3>Delete {task.title}?</h3><p>This deletes this task, all its subtasks and their history. This cannot be undone.</p>
    <ErrorText>{error}</ErrorText><div className="task-inline-actions">
      <button type="button" className="secondary-btn" data-initial-focus onClick={onCancel}>Cancel</button>
      <button type="button" className="danger-btn" disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete task'}</button>
    </div>
  </section>
}

function SubtaskRow({ sub, readOnly, depth }: { sub: Task; readOnly: boolean; depth: number }) {
  const { applyData, notify } = useTasksUi()
  const { buffer, change, flush } = useTaskEdits(sub)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  return <li>
    <div className="subtask-row">
      {readOnly ? <span className="subtask-read-state">{sub.completedAt ? '✓' : '○'}</span> : <CompleteCircle task={sub} onToggle={() => void toggleTaskComplete(sub, { applyData, notify })} />}
      <input className="subtask-name" value={buffer.values.title} readOnly={readOnly || Boolean(sub.archivedAt || sub.completedAt)}
        aria-label="Subtask name" onChange={event => change('title', event.target.value)} onBlur={() => void flush()}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      {!readOnly ? <div className="task-inline-actions">
        {!sub.completedAt && !sub.archivedAt ? <button type="button" className="icon-btn" aria-label={`Add a subtask under ${sub.title}`} onClick={() => setAdding(!adding)}>+</button> : null}
        <button type="button" className="icon-btn" aria-label={`Delete ${sub.title}`} onClick={() => setDeleting(true)}>×</button>
      </div> : null}
    </div>
    {sub.blocked && !sub.completedAt ? <p className="field-hint">Blocked by unfinished subtasks</p> : null}
    {buffer.error || buffer.saving || Object.keys(buffer.pending).length ? <EditStatus buffer={buffer} retry={flush} /> : null}
    {deleting ? <DeleteWarning task={sub} onCancel={() => setDeleting(false)} onDeleted={() => setDeleting(false)} /> : null}
    {adding ? <AddSubtaskInput parentId={sub.id} onDone={() => setAdding(false)} /> : null}
    <SubtaskTree parentId={sub.id} readOnly={readOnly || Boolean(sub.archivedAt || sub.completedAt)} depth={depth + 1} />
  </li>
}
function SubtaskTree({ parentId, readOnly, depth = 0 }: { parentId: string; readOnly: boolean; depth?: number }) {
  const { data } = useTasksUi()
  const [adding, setAdding] = useState(false)
  const siblings = (childrenOf(data.tasks).get(parentId) ?? []).filter(task => readOnly || !task.archivedAt)
  return <div className={depth ? 'subtask-children' : ''} style={depth > 3 ? { marginLeft: 0, paddingLeft: 0, borderLeft: 0 } : undefined}>
    {!siblings.length && depth === 0 ? <p className="field-hint">No subtasks.</p> : null}
    <ul className="subtask-tree">{siblings.map(sub => <SubtaskRow key={sub.id} sub={sub} readOnly={readOnly} depth={depth} />)}</ul>
    {!readOnly && depth === 0 ? adding ? <AddSubtaskInput parentId={parentId} onDone={() => setAdding(false)} /> :
      <button type="button" className="disclosure-btn" onClick={() => setAdding(true)}>+ Add subtask</button> : null}
  </div>
}
function EditStatus({ buffer, retry }: { buffer: EditBuffer; retry: () => Promise<void> }) {
  return <div className="task-save-status" role="status">
    {buffer.error ? <><span className="field-error">{buffer.error}</span><button type="button" className="plain-action" onClick={() => void retry()}>Retry</button></> :
      buffer.saving ? 'Saving…' : Object.keys(buffer.pending).length ? 'Unsaved changes' : 'Saved'}
  </div>
}

export function TaskSheet({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { data } = useTasksUi()
  const task = data.tasks.find(item => item.id === taskId)
  if (!task) return <SheetFrame onClose={onClose} label="Task"><p className="sheet-missing">Task not found</p>
    <a className="plain-action" href={tasksUrl({})}>Open Tasks</a></SheetFrame>
  return <TaskSheetBody key={task.id} task={task} onClose={onClose} />
}
function TaskSheetBody({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data, applyData, notify } = useTasksUi()
  const { buffer, change, flush, changeLinkDraft } = useTaskEdits(task)
  const [moreOpen, setMoreOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const active = !task.completedAt && !task.archivedAt
  let root = task
  while (root.parentId) { const parent = data.tasks.find(item => item.id === root.parentId); if (!parent) break; root = parent }
  const run = async (action: () => Promise<TasksActionResult>) => {
    if (pending.current) return false
    pending.current = true; setBusy(true); setError('')
    try {
      const result = await action()
      if (!result.ok) { setError(result.message); return false }
      applyData(result); return true
    } catch { setError('The change was not saved. Try again.'); return false }
    finally { pending.current = false; setBusy(false) }
  }
  const replaceDate = async (kind: 'ideal' | 'deadline', value: string | null) => {
    const previous = { ideal: task.idealCompletionDate, deadline: task.deadline }
    const other = kind === 'ideal' ? 'deadline' : 'ideal'
    const max = ancestorDeadline(task, data.tasks)
    if (value && max && value > max) { setError(`A subtask date cannot fall after the ${max} deadline above it.`); return }
    if (await run(() => (kind === 'ideal' ? setTaskIdealDateAction : setTaskDeadlineAction)({ data: { taskId: task.id, value } })) && value && previous[other]) {
      notify(kind === 'ideal' ? 'Deadline removed.' : 'Ideal completion date removed.', async () => {
        try {
          const result = await (other === 'ideal' ? setTaskIdealDateAction : setTaskDeadlineAction)({ data: { taskId: task.id, value: previous[other] } })
          if (result.ok) applyData(result); else notify(result.message)
        } catch { notify('The date was not restored. Try again.') }
      })
    }
  }
  const archiveOrRestore = async () => {
    const restoring = Boolean(task.archivedAt)
    if (await run(() => (restoring ? restoreTaskAction : archiveTaskAction)({ data: { taskId: task.id } }))) {
      notify(restoring ? 'Task restored.' : 'Task archived.', async () => {
        try {
          const result = await (restoring ? archiveTaskAction : restoreTaskAction)({ data: { taskId: task.id } })
          if (result.ok) applyData(result); else notify(result.message)
        } catch { notify('The change was not undone. Try again.') }
      })
    }
  }
  const lastDone = data.previous[task.id]
  const latest = task.repeatable && task.completedAt ? data.tasks.find(item => item.historyId === task.historyId && !item.completedAt && !item.archivedAt) : null
  return <SheetFrame onClose={onClose} label="Task">
    <label className="field"><span className="field-label">Task name</span><input className="sheet-title" data-initial-focus
      value={buffer.values.title} aria-label="Task name" aria-invalid={buffer.error === 'Enter a task name.'}
      readOnly={!active} onChange={event => change('title', event.target.value)} onBlur={() => void flush()} /></label>
    <div className="sheet-facts">
      {active ? <div className="sheet-plan"><ScheduleMenu task={task} variant="button" /></div> : null}
      {task.blocked && active ? <span className="state-label">Blocked by unfinished subtasks</span> : null}
      {task.repeatable ? <span className="rep-mark">Repeatable</span> : null}
      {task.completedAt ? <span>Completed {formatShortDate(task.completedAt.slice(0, 10))}</span> : null}
      {task.archivedAt ? <span>Archived {formatShortDate(task.archivedAt.slice(0, 10))}</span> : null}
      {active ? <EditStatus buffer={buffer} retry={flush} /> : null}
    </div>
    {task.deadline && task.deadline < data.today && active ? <p className="field-error">⚠ Overdue · Deadline {formatShortDate(task.deadline)}</p> : null}
    {task.repeatable && lastDone ? <p className="rep-line">Last done {formatShortDate(lastDone.slice(0, 10))}</p> : null}
    <DateFields ideal={task.idealCompletionDate} deadline={task.deadline} max={ancestorDeadline(task, data.tasks)} disabled={busy}
      onIdeal={active ? value => void replaceDate('ideal', value) : undefined} onDeadline={active ? value => void replaceDate('deadline', value) : undefined} />
    <ErrorText>{error}</ErrorText>
    <GoalChips goalIds={root.goalIds} inherited={Boolean(task.parentId)} busy={busy}
      onChange={!task.parentId && active ? goalIds => { void run(() => setTaskGoalLinksAction({ data: { taskId: task.id, goalIds } })) } : undefined} />
    <MoreOptions open={moreOpen} toggle={() => setMoreOpen(!moreOpen)} notes={buffer.values.notes} links={task.externalLinks}>
      <label className="field"><span className="field-label">Notes</span><textarea value={buffer.values.notes} rows={3} readOnly={!active}
        onChange={event => change('notes', event.target.value)} onBlur={() => void flush()} /></label>
      <LinkEditor links={task.externalLinks} draft={buffer.linkDraft} onDraftChange={changeLinkDraft} disabled={busy} onChange={active ? links => run(() => updateTaskAction({ data: { taskId: task.id, externalLinks: links } })) : undefined} />
    </MoreOptions>
    <h3 className="sheet-section">Subtasks</h3><SubtaskTree parentId={task.id} readOnly={!active} />
    {latest ? <a className="plain-action" href={tasksUrl({}) + '/' + latest.id}>Open latest copy</a> : null}
    {deleting ? <DeleteWarning task={task} onCancel={() => setDeleting(false)} onDeleted={onClose} /> : null}
    <div className="form-foot">
      {task.archivedAt || active ? <button type="button" className="secondary-btn" disabled={busy} onClick={() => void archiveOrRestore()}>{task.archivedAt ? 'Restore' : 'Archive'}</button> : null}
      {task.completedAt && !task.archivedAt ? <button type="button" className="secondary-btn" onClick={() => void toggleTaskComplete(task, { applyData, notify })}>Reopen</button> : null}
      <button type="button" className="secondary-btn" onClick={onClose}>Close</button>
      <button type="button" className="plain-action task-delete-action" onClick={() => setDeleting(true)}>Delete</button>
    </div>
  </SheetFrame>
}
