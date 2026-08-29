import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import {
  archiveGoalAction,
  completeGoalAction,
  deleteGoalAction,
  reopenGoalAction,
  restoreGoalAction,
  setGoalPriorityAction,
} from '../domain/goalServer'
import {
  STATUS_LABEL,
  completeWarning,
  deleteWarning,
  goalDetailFromData,
} from '../lib/goalsView'
import { recordUrl, tasksUrl } from '../lib/urlState'
import { EmptyState, Page } from './AppShell'
import { FlagIcon, GoalProgressView } from './GoalList'
import { useGoalsUi } from './goalsContext'

export function GoalDetailView({ goalId }: { goalId: string }) {
  const { data, applyData, notify } = useGoalsUi()
  const navigate = useNavigate()
  const [strip, setStrip] = useState<'complete' | 'delete' | null>(null)

  const detail = goalDetailFromData(data, goalId)

  if (!detail) {
    return (
      <Page title="Goal not found">
        <EmptyState>
          <p>This goal does not exist.</p>
          <Link className="plain-action" to="/goals">
            Goals
          </Link>
        </EmptyState>
      </Page>
    )
  }

  const { goal, progress, subgoals, tasks } = detail
  const completed = Boolean(goal.completedAt)

  const togglePriority = async () => {
    const result = await setGoalPriorityAction({
      data: { goalId: goal.id, priority: !goal.priority },
    })
    if (result.ok) applyData(result)
    else notify(result.message)
  }

  const complete = async () => {
    const result = await completeGoalAction({ data: { goalId: goal.id } })
    if (result.ok) {
      applyData(result)
      setStrip(null)
    } else {
      notify(result.message)
    }
  }

  const reopen = async () => {
    const result = await reopenGoalAction({ data: { goalId: goal.id } })
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
    void navigate({ to: '/goals' })
    notify('Goal archived.', {
      actionLabel: 'Restore',
      undo: async () => {
        const undo = await restoreGoalAction({ data: { goalId: goal.id } })
        if (undo.ok) applyData(undo)
        else notify(undo.message)
      },
    })
  }

  const destroy = async () => {
    const result = await deleteGoalAction({ data: { goalId: goal.id } })
    if (result.ok) {
      applyData(result)
      void navigate({ to: '/goals' })
      notify('Goal deleted.')
    } else {
      notify(result.message)
    }
  }

  return (
    <Page title={goal.title}>
      <p className="goal-back">
        <Link to="/goals">Goals</Link>
      </p>
      <div className="goal-facts">
        <span className="type-chip">
          {goal.kind === 'one_shot' ? 'One-shot goal' : 'Ongoing goal'}
        </span>
        <button
          type="button"
          className="flag-btn"
          aria-pressed={goal.priority}
          disabled={completed}
          onClick={() => void togglePriority()}
        >
          <FlagIcon size={13} />
          Priority
        </button>
      </div>
      <div className="goal-progress-line">
        <GoalProgressView progress={progress} wide />
      </div>
      {completed ? (
        <p className="done-line">
          Goal completed. Unfinished tasks stay active without it.
          <button
            type="button"
            className="quiet-link"
            onClick={() => void reopen()}
          >
            Undo
          </button>
        </p>
      ) : null}
      {subgoals.length ? (
        <section className="section">
          <h2>Subgoals</h2>
          <ul className="goal-sub-list">
            {subgoals.map((sub) => (
              <li key={sub.id}>
                <Link
                  className="goal-sub-name"
                  to="/goals/$goalId"
                  params={{ goalId: sub.id }}
                >
                  {sub.title}
                </Link>
                <span className="goal-meta">
                  <GoalProgressView progress={data.progress[sub.id]} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="section">
        <h2>Linked tasks</h2>
        {tasks.length ? (
          <ul className="goal-task-list">
            {tasks.map(({ task, status }) => (
              <li
                key={task.id}
                className={status === 'completed' ? 'is-done' : undefined}
              >
                <Link
                  className="goal-task-name"
                  to={recordUrl('tasks', task.id)}
                  search={{ goal: goal.id }}
                >
                  {task.title}
                </Link>
                <span className="goal-task-status">
                  {STATUS_LABEL[status]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="state-line">No linked tasks yet.</p>
        )}
        <Link className="plain-action" to={tasksUrl({ goal: goal.id })}>
          Open in Tasks
        </Link>
      </section>
      {!completed ? (
        <div className="goal-actions">
          {goal.kind === 'one_shot' ? (
            <button
              type="button"
              className="primary-btn"
              onClick={() => setStrip('complete')}
            >
              Complete goal
            </button>
          ) : null}
          <button
            type="button"
            className="secondary-btn"
            onClick={() => void archive()}
          >
            Archive
          </button>
          <button
            type="button"
            className="quiet-danger"
            onClick={() => setStrip('delete')}
          >
            Delete…
          </button>
        </div>
      ) : null}
      {strip === 'complete' ? (
        <div className="goal-strip">
          <p>{completeWarning(detail)}</p>
          <div className="goal-strip-buttons">
            <button
              type="button"
              className="primary-btn"
              onClick={() => void complete()}
            >
              Complete
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setStrip(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {strip === 'delete' ? (
        <div className="goal-strip">
          <p>{deleteWarning(detail)}</p>
          <div className="goal-strip-buttons">
            <button
              type="button"
              className="primary-btn"
              onClick={() => void destroy()}
            >
              Delete
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setStrip(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </Page>
  )
}
