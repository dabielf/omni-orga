import { useEffect, useRef, useState } from 'react'

import { createGoalAction } from '../domain/goalServer'
import { topLevelGoals } from '../lib/goalsView'
import { useGoalsUi } from './goalsContext'

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])
}

/** Minimal create-goal form: name, kind, optional parent. */
export function GoalSheet({ onClose }: { onClose: () => void }) {
  const { data, applyData, notify } = useGoalsUi()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<'one_shot' | 'ongoing'>('one_shot')
  const [parentId, setParentId] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  useEscape(onClose)
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const tops = topLevelGoals(data.goals)

  const create = async () => {
    const name = title.trim()
    if (!name) {
      nameRef.current?.focus()
      return
    }
    const result = await createGoalAction({
      data: {
        goal: {
          title: name,
          kind,
          parentId: parentId || undefined,
        },
      },
    })
    if (result.ok) {
      applyData(result)
      onClose()
      notify('Goal created.')
    } else {
      notify(result.message)
    }
  }

  return (
    <div
      className="sheet-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label="New goal">
        <div className="sheet-head">
          <input
            ref={nameRef}
            className="sheet-title"
            value={title}
            placeholder="What is it?"
            aria-label="Goal name"
            onChange={(event) => setTitle(event.target.value)}
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
        <div className="goal-form-fields">
          <label className="field">
            <span className="field-label">Type</span>
            <select
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as 'one_shot' | 'ongoing')
              }
            >
              <option value="one_shot">One-shot goal</option>
              <option value="ongoing">Ongoing goal</option>
            </select>
          </label>
          {tops.length ? (
            <label className="field">
              <span className="field-label">Parent goal</span>
              <select
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">Top level</option>
                {tops.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="form-foot">
          <button
            type="button"
            className="primary-btn"
            onClick={() => void create()}
          >
            Create goal
          </button>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
