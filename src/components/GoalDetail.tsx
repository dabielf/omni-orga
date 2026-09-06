import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { reopenGoalAction, restoreGoalAction, setGoalPriorityAction } from '../domain/goalServer'
import { PRIORITY_LIMIT_MESSAGE, STATUS_LABEL, goalDetailFromData, priorityInUse } from '../lib/goalsView'
import { recordUrl, tasksUrl } from '../lib/urlState'
import { EmptyState, Page } from './AppShell'
import { GoalProgressView } from './GoalList'
import { GoalRemovalDialog } from './GoalRemovalDialog'
import type { GoalRemovalAction } from './GoalRemovalDialog'
import { useGoalsUi } from './goalsContext'
import './goals-redesign.css'

export function GoalDetailView({ goalId }: { goalId: string }) {
  const { data, applyData, notify } = useGoalsUi()
  const navigate = useNavigate()
  const [removal, setRemoval] = useState<GoalRemovalAction | null>(null)
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const detail = goalDetailFromData(data, goalId)
  if (!detail) return <Page title="Goal not found"><EmptyState><p>This goal does not exist.</p><Link className="plain-action" to="/goals">Open Goals</Link></EmptyState></Page>
  const { goal, progress, subgoals, tasks } = detail
  const archived = !!goal.archivedAt
  const completed = !!goal.completedAt
  const inactive = archived || completed
  const capped = priorityInUse(data.goals) >= 3 && !goal.priority
  const blocked = subgoals.some(sub => !sub.archivedAt && !sub.completedAt)
  const parent = [...data.goals, ...data.archivedGoals].find(item => item.id === goal.parentId)
  const mutate = async (action: 'priority' | 'reopen' | 'restore') => {
    if (pending.current) return
    pending.current = true; setSaving(true)
    try {
      const result = action === 'priority' ? await setGoalPriorityAction({ data: { goalId, priority: !goal.priority } }) : await (action === 'restore' ? restoreGoalAction : reopenGoalAction)({ data: { goalId } })
      if (result.ok) { applyData(result); if (action !== 'priority') notify(action === 'restore' ? 'Goal restored.' : 'Goal reopened.') }
      else notify(result.message)
    } catch { notify('The change was not saved. Try again.') }
    finally { pending.current = false; setSaving(false) }
  }
  return <div className="page goal-detail-page">
    <nav className="goal-back" aria-label="Goal path"><Link to="/goals" search={archived ? { view:'archived' } : {}}>Goals</Link>{parent ? <><span> / </span><Link to="/goals/$goalId" params={{goalId:parent.id}}>{parent.title}</Link></> : null}</nav>
    <h1>{goal.title}</h1>
    <div className="goal-facts"><span className="type-chip">{goal.kind === 'one_shot' ? 'One-shot goal' : 'Ongoing goal'}</span>
      {!inactive ? <button type="button" className="goal-priority-btn" aria-label="Priority" aria-pressed={goal.priority} aria-disabled={capped || undefined} title={capped ? PRIORITY_LIMIT_MESSAGE : 'Priority'} disabled={saving} onClick={() => { if (capped) notify(PRIORITY_LIMIT_MESSAGE); else void mutate('priority') }}>{goal.priority ? 'Priority' : 'Set priority'}</button> : <span className="goal-inactive-label">{archived ? 'Archived' : 'Completed'}</span>}
    </div>
    {!inactive && capped ? <p className="goal-field-hint">{PRIORITY_LIMIT_MESSAGE}. Turn one off to choose another.</p> : null}
    <div className="goal-progress-line"><GoalProgressView progress={progress} wide /></div>
    {inactive ? <div className="goal-state-line"><p>{archived ? 'This goal is archived. Its history is kept.' : 'Goal completed.'}</p><button type="button" className="secondary-btn" disabled={saving || (archived && !!parent?.archivedAt)} onClick={() => void mutate(archived ? 'restore' : 'reopen')}>{saving ? 'Saving…' : archived ? 'Restore' : 'Reopen'}</button></div> : null}
    {archived && parent?.archivedAt ? <p className="goal-field-hint">Restore <Link to="/goals/$goalId" params={{goalId:parent.id}}>{parent.title}</Link> first. This goal will return with it.</p> : null}
    {subgoals.length ? <section className="section"><h2>Subgoals</h2><ul className="goal-sub-list">{subgoals.map(sub => <li key={sub.id}><div className="goal-row-copy"><Link className="goal-sub-name" to="/goals/$goalId" params={{goalId:sub.id}}>{sub.title}</Link><span className="goal-meta">{sub.archivedAt ? 'Archived' : sub.completedAt ? 'Completed' : sub.kind === 'ongoing' ? 'Ongoing' : 'One-shot'} · <GoalProgressView progress={data.progress[sub.id]} /></span></div></li>)}</ul></section> : null}
    <section className="section"><h2>Linked tasks</h2>
      {tasks.length ? <ul className="goal-task-list">{tasks.map(({ task, status }) => <li key={task.id} className={status === 'completed' ? 'is-done' : undefined}>
        <span className={`goal-task-symbol is-${status}`} aria-hidden="true">{status === 'completed' ? '✓' : status === 'blocked' ? '−' : ''}</span>
        <div className="goal-row-copy"><Link className="goal-task-name" to={recordUrl('tasks', task.id)} search={{goal:goal.id}}>{task.title}</Link><span className="goal-task-status">{STATUS_LABEL[status]}</span></div>
      </li>)}</ul> : <p className="state-line">No linked tasks yet.</p>}
    </section>
    <div className="goal-actions">
      {!inactive && goal.kind === 'one_shot' ? <button type="button" className="primary-btn" disabled={blocked} aria-describedby={blocked ? 'goal-completion-blocked' : undefined} onClick={() => setRemoval('complete')}>Complete goal</button> : null}
      <Link className="secondary-btn" to={tasksUrl({goal:goal.id})}>Open in Tasks</Link>
      {!archived ? <button type="button" className="secondary-btn" onClick={() => setRemoval('archive')}>Archive</button> : null}
    </div>
    {!inactive && goal.kind === 'one_shot' && blocked ? <p id="goal-completion-blocked" className="goal-field-hint">Complete or archive active subgoals first.</p> : null}
    <button type="button" className="quiet-danger goal-delete-link" onClick={() => setRemoval('delete')}>Delete…</button>
    {removal ? <GoalRemovalDialog goalId={goalId} action={removal} onClose={() => setRemoval(null)} onRemoved={removal === 'complete' ? undefined : () => { void navigate({to:'/goals'}) }} /> : null}
  </div>
}
