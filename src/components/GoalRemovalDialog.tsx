import { useEffect, useRef, useState } from 'react'
import { archiveGoalAction, completeGoalAction, deleteGoalAction, reopenGoalAction, restoreGoalAction } from '../domain/goalServer'
import type { GoalTaskDisposition } from '../domain/store'
import { goalDetailFromData } from '../lib/goalsView'
import { GoalDialog } from './GoalDialog'
import { useGoalsUi } from './goalsContext'

export type GoalRemovalAction = 'complete' | 'archive' | 'delete'

export function GoalRemovalDialog({ goalId, action, onClose, onRemoved }: {
  goalId: string
  action: GoalRemovalAction
  onClose: () => void
  onRemoved?: () => void
}) {
  const { data, applyData, notify } = useGoalsUi()
  const [choices, setChoices] = useState<Record<string, GoalTaskDisposition>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const detail = goalDetailFromData(data, goalId)
  if (!detail) return <GoalDialog title="Goal not found" onClose={onClose}><p>This goal does not exist.</p></GoalDialog>
  const { goal, subgoals } = detail
  const scope = new Set([goalId, ...subgoals.map(goal => goal.id)])
  const tasks = data.tasks.filter(task => !task.parentId && !task.completedAt && !task.archivedAt && task.goalIds.some(id => action === 'complete' ? id === goalId : scope.has(id)))
  const replacements = data.goals.filter(goal => !goal.completedAt && !goal.archivedAt && !scope.has(goal.id))
  const blocked = action === 'complete' && subgoals.some(goal => !goal.completedAt && !goal.archivedAt)
  const verb = action === 'complete' ? 'Complete' : action === 'archive' ? 'Archive' : 'Delete'
  const submit = async () => {
    if (pending.current || blocked) return
    if (tasks.some(task => choices[task.id]?.action === 'link' && !(choices[task.id] as { goalId?: string }).goalId)) {
      setError('Choose a replacement goal for each linked task.'); return
    }
    pending.current = true; setSaving(true); setError('')
    try {
      const run = action === 'complete' ? completeGoalAction : action === 'archive' ? archiveGoalAction : deleteGoalAction
      const result = await run({ data: { goalId, linkedTasks: choices } })
      if (!result.ok) { setError(result.message); return }
      applyData(result)
      if (mounted.current) { onClose(); onRemoved?.() }
      if (action === 'delete') notify('Goal deleted.')
      else notify(action === 'complete' ? 'Goal completed.' : 'Goal archived.', {
        actionLabel: action === 'complete' ? 'Undo' : 'Restore',
        undo: async () => {
          try {
            const undo = await (action === 'complete' ? reopenGoalAction : restoreGoalAction)({ data: { goalId } })
            if (undo.ok) { applyData(undo); notify(action === 'complete' ? 'Goal reopened.' : 'Goal restored.') }
            else notify(undo.message)
          } catch { notify('The goal was not restored. Try again.') }
        },
      })
    } catch { setError('The change was not saved. Your choices are kept. Try again.') }
    finally { pending.current = false; setSaving(false) }
  }
  return <GoalDialog title={`${verb} ${goal.title}?`} onClose={onClose} compact>
    <form noValidate onSubmit={event => { event.preventDefault(); void submit() }}>
      <div className="goal-dialog-body">
        <p>{action === 'delete' ? `Deletes this goal${subgoals.length ? ', its subgoals' : ''} and their goal history. Linked tasks are not deleted. This cannot be undone.` : action === 'archive' ? `${goal.title}${subgoals.length ? ' and its subgoals' : ''} will leave the active list. Choose what happens to each unfinished task. You can restore this goal.` : 'Choose what happens to each unfinished task. Completed history keeps its goal link. You can undo.'}</p>
        {blocked ? <p className="goal-error" role="alert">Complete or archive active subgoals first.</p> : tasks.map(task => <div className="goal-disposition" key={task.id}>
          <label className="field"><span className="field-label">{task.title}</span>
            <select value={choices[task.id]?.action ?? 'keep_active'} disabled={saving} onChange={event => setChoices(current => ({ ...current, [task.id]: event.target.value === 'link' ? { action: 'link', goalId: '' } : { action: event.target.value as 'keep_active' | 'archive' } }))}>
              <option value="keep_active">Keep active</option><option value="link" disabled={!replacements.length}>Link to another goal</option><option value="archive">Archive task</option>
            </select>
          </label>
          {choices[task.id]?.action === 'link' ? <label className="field"><span className="field-label">Replacement goal for {task.title}</span>
            <select value={(choices[task.id] as {goalId: string}).goalId} disabled={saving} onChange={event => setChoices(current => ({...current, [task.id]: {action:'link', goalId:event.target.value}}))}><option value="">Choose a goal</option>{replacements.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select>
          </label> : null}
          {!replacements.length ? <p className="goal-field-hint">No other active goals to link to.</p> : null}
        </div>)}
        {error ? <p className="goal-error" role="alert">{error}</p> : null}
      </div>
      <footer className="goal-dialog-foot"><button type="submit" className={action === 'delete' ? 'goal-danger-btn' : 'primary-btn'} disabled={saving || blocked}>{saving ? 'Saving…' : `${verb} goal`}</button><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button></footer>
    </form>
  </GoalDialog>
}
