import { useEffect, useRef, useState } from 'react'
import { createGoalAction } from '../domain/goalServer'
import { goalParentOptions } from '../lib/goalsView'
import { GoalDialog } from './GoalDialog'
import { useGoalsUi } from './goalsContext'

export function GoalSheet({ onClose }: { onClose: () => void }) {
  const { data, applyData, notify } = useGoalsUi()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<'one_shot' | 'ongoing'>('one_shot')
  const [parentId, setParentId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const nameRef = useRef<HTMLInputElement>(null)
  const options = goalParentOptions([...data.goals, ...data.archivedGoals], kind)
  const parentError = options.find(option => option.id === parentId)?.reason
  const create = async () => {
    if (pending.current) return
    if (!title.trim()) { setError('Enter a goal name.'); nameRef.current?.focus(); return }
    if (parentError) { setError(parentError); return }
    pending.current = true
    setSaving(true)
    setError('')
    try {
      const result = await createGoalAction({ data: { goal: { title: title.trim(), kind, parentId: parentId || undefined } } })
      if (result.ok) { applyData(result); if (mounted.current) onClose(); notify('Goal created.') }
      else setError(result.message)
    } catch { setError('The goal was not saved. Try again.') }
    finally { pending.current = false; setSaving(false) }
  }
  return (
    <GoalDialog title="New goal" onClose={onClose}>
      <form className="goal-create-form" noValidate onSubmit={event => { event.preventDefault(); void create() }}>
        <div className="goal-dialog-body">
          <label className="field"><span className="field-label">Goal name</span>
            <input autoFocus ref={nameRef} value={title} onChange={event => setTitle(event.target.value)} aria-invalid={!!error && !title.trim()} aria-describedby={error ? 'goal-create-error' : undefined} />
          </label>
          <label className="field"><span className="field-label">Type</span>
            <select value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="one_shot">One-shot goal</option><option value="ongoing">Ongoing goal</option></select>
          </label>
          <label className="field"><span className="field-label">Parent goal</span>
            <select value={parentId} onChange={event => setParentId(event.target.value)} aria-describedby="goal-parent-hints">
              {options.map(option => <option key={option.id ?? ''} value={option.id ?? ''} disabled={!!option.reason}>{option.title}{option.reason ? ` — ${option.reason}` : ''}</option>)}
            </select>
          </label>
          <div id="goal-parent-hints" className="goal-field-hint">{parentError || (kind === 'ongoing' && options.some(option => option.reason.includes('one-shot')) ? 'Ongoing goals cannot sit under a one-shot goal.' : null)}</div>
          {error ? <p className="goal-error" role="alert" id="goal-create-error">{error}</p> : null}
        </div>
        <footer className="goal-dialog-foot"><button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Creating…' : 'Create goal'}</button><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button></footer>
      </form>
    </GoalDialog>
  )
}
