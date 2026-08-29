import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { archiveTaskAction, restoreTaskAction } from '../domain/server'
import type { Task } from '../domain/store'
import { tasksUrl, type TasksSearch } from '../lib/urlState'
import {
  availableRows,
  childrenOf,
  formatShortDate,
  remainingCount,
  treeRows,
  type AvailableRow,
  type TreeRow,
} from '../lib/tasksView'
import { CompleteCircle, ScheduleMenu } from './ScheduleMenu'
import { toggleTaskComplete } from './taskActions'
import { useTasksUi } from './tasksContext'

function MetaBits({
  task,
  root,
  showGoalChip,
}: {
  task: Task
  root?: Task
  showGoalChip: boolean
}) {
  const { data } = useTasksUi()
  const goalSource = root ?? task
  const bits: ReactNode[] = []
  if (showGoalChip && goalSource.goalIds.length) {
    const goal = data.goals.find((item) => item.id === goalSource.goalIds[0])
    if (goal) {
      bits.push(
        <Link
          key="goal"
          className="goal-chip"
          to="/goals/$goalId"
          params={{ goalId: goal.id }}
        >
          {goal.title}
        </Link>,
      )
    }
    if (goalSource.goalIds.length > 1) {
      bits.push(
        <span key="more" className="goal-chip-more">
          +{goalSource.goalIds.length - 1}
        </span>,
      )
    }
  }
  if (task.repeatable) {
    const lastDone = data.previous[task.id]
    bits.push(
      <span key="repeat" className="rep-mark">
        Repeatable
        {lastDone
          ? ` · last done ${formatShortDate(lastDone.slice(0, 10))}`
          : ''}
      </span>,
    )
  }
  if (task.idealCompletionDate) {
    bits.push(
      <span key="ideal" className="date-txt">
        Ideal {formatShortDate(task.idealCompletionDate)}
      </span>,
    )
  }
  if (task.deadline) {
    if (task.deadline < data.today) {
      bits.push(
        <span key="overdue" className="overdue-chip">
          Overdue
        </span>,
      )
    }
    bits.push(
      <span key="deadline" className="date-txt">
        Deadline {formatShortDate(task.deadline)}
      </span>,
    )
  }
  if (task.blocked) {
    bits.push(
      <span key="blocked" className="state-label">
        Blocked
      </span>,
    )
  }
  return <span className="task-meta">{bits}</span>
}

function TaskTitleLink({ task, search }: { task: Task; search: TasksSearch }) {
  return (
    <Link
      className="task-name"
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
      search={search}
    >
      {task.title}
    </Link>
  )
}

function useCompleter() {
  const { applyData, notify } = useTasksUi()
  return (task: Task) => void toggleTaskComplete(task, { applyData, notify })
}

function AvailableRowItem({ row }: { row: AvailableRow }) {
  const { search } = useTasksUi()
  const onComplete = useCompleter()
  const showChips = !search.goal || search.goal === 'priority'
  return (
    <li className="task-row-item">
      <div className="task-row">
        <span className="tree-toggle" aria-hidden="true" />
        <CompleteCircle task={row.task} onToggle={() => onComplete(row.task)} />
        <span className="task-copy">
          <TaskTitleLink task={row.task} search={search} />
          {row.path.length ? (
            <span className="parent-path">{row.path.join(' › ')}</span>
          ) : null}
        </span>
        <MetaBits task={row.task} root={row.root} showGoalChip={showChips} />
        <ScheduleMenu task={row.task} />
      </div>
    </li>
  )
}

function TreeRowItem({
  row,
  expanded,
  onToggleTree,
}: {
  row: TreeRow
  expanded: Set<string>
  onToggleTree: (taskId: string) => void
}) {
  const { data, search } = useTasksUi()
  const onComplete = useCompleter()
  const siblings = childrenOf(data.tasks)
  const hasChildren = (siblings.get(row.task.id) ?? []).some(
    (child) => !child.archivedAt,
  )
  const collapsed = hasChildren && !expanded.has(row.task.id)
  const remaining = collapsed ? remainingCount(row.task, siblings) : 0
  return (
    <li className="task-row-item">
      <div
        className="task-row"
        style={
          row.depth
            ? { paddingInlineStart: `${row.depth * 1.4}rem` }
            : undefined
        }
      >
        {hasChildren ? (
          <button
            type="button"
            className="tree-toggle"
            aria-expanded={!collapsed}
            aria-label={
              collapsed
                ? `Expand ${row.task.title}`
                : `Collapse ${row.task.title}`
            }
            onClick={() => onToggleTree(row.task.id)}
          >
            ›
          </button>
        ) : (
          <span className="tree-toggle" aria-hidden="true" />
        )}
        <CompleteCircle task={row.task} onToggle={() => onComplete(row.task)} />
        <span className="task-copy">
          <TaskTitleLink task={row.task} search={search} />
          {row.path.length ? (
            <span className="parent-path">{row.path.join(' › ')}</span>
          ) : null}
        </span>
        {collapsed && remaining ? (
          <span className="remaining">{remaining} remaining</span>
        ) : null}
        <MetaBits task={row.task} showGoalChip={row.depth === 0} />
        <ScheduleMenu task={row.task} />
      </div>
    </li>
  )
}

function CompletedList({ tasks }: { tasks: Task[] }) {
  const { search } = useTasksUi()
  const onComplete = useCompleter()
  return (
    <ul className="task-list is-history">
      {tasks.map((task) => (
        <li key={task.id} className="task-row-item">
          <div className="task-row is-history">
            <span className="tree-toggle" aria-hidden="true" />
            <CompleteCircle task={task} onToggle={() => onComplete(task)} />
            <span className="task-copy">
              <TaskTitleLink task={task} search={search} />
            </span>
            <span className="task-meta">
              {task.completedAt ? (
                <span className="date-txt">
                  Completed {formatShortDate(task.completedAt.slice(0, 10))}
                </span>
              ) : null}
              <MetaBits task={task} showGoalChip />
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function ArchivedList({ tasks }: { tasks: Task[] }) {
  const { applyData, notify, search } = useTasksUi()
  const restore = async (task: Task) => {
    const result = await restoreTaskAction({ data: { taskId: task.id } })
    if (result.ok) {
      applyData(result)
      notify('Task restored.', async () => {
        const undo = await archiveTaskAction({ data: { taskId: task.id } })
        if (undo.ok) applyData(undo)
      })
    } else {
      notify(result.message)
    }
  }
  return (
    <ul className="task-list is-history">
      {tasks.map((task) => (
        <li key={task.id} className="task-row-item">
          <div className="task-row is-history">
            <span className="tree-toggle" aria-hidden="true" />
            <span className="task-copy">
              <TaskTitleLink task={task} search={search} />
            </span>
            <span className="task-meta">
              {task.archivedAt ? (
                <span className="date-txt">
                  Archived {formatShortDate(task.archivedAt.slice(0, 10))}
                </span>
              ) : null}
              <MetaBits task={task} showGoalChip />
            </span>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => void restore(task)}
            >
              Restore
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

function EmptyState({
  message,
  action,
}: {
  message: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <p>{message}</p>
      {action}
    </div>
  )
}

export function TasksList() {
  const { data, search, treeExpansion, openCreate } = useTasksUi()
  const hasFilters = Boolean(search.goal || search.ideal)

  if (search.view === 'completed' || search.view === 'archived') {
    const archived = search.view === 'archived'
    const tasks = data.tasks.filter((task) =>
      archived
        ? !task.parentId && Boolean(task.archivedAt)
        : !task.parentId && Boolean(task.completedAt) && !task.archivedAt,
    )
    if (!tasks.length) {
      return (
        <EmptyState
          message={archived ? 'No archived tasks.' : 'No completed tasks.'}
        />
      )
    }
    return archived ? (
      <ArchivedList tasks={tasks} />
    ) : (
      <CompletedList tasks={tasks} />
    )
  }

  if (search.available === '1') {
    const rows = availableRows(data, search)
    if (rows.length) {
      return (
        <ul className="task-list">
          {rows.map((row) => (
            <AvailableRowItem key={row.task.id} row={row} />
          ))}
        </ul>
      )
    }
    const anyTask = data.tasks.some(
      (task) => !task.parentId && !task.completedAt && !task.archivedAt,
    )
    if (!anyTask && !hasFilters) {
      return (
        <EmptyState
          message="No tasks yet."
          action={
            <button type="button" className="plain-action" onClick={openCreate}>
              Create a task
            </button>
          }
        />
      )
    }
    return (
      <EmptyState
        message="No available tasks match these filters."
        action={
          <Link className="plain-action" to={tasksUrl({})}>
            Show all tasks
          </Link>
        }
      />
    )
  }

  const rows = treeRows(data, search)
  if (rows.length) {
    const visible = search.ideal
      ? rows
      : rows.filter(
          (row) =>
            row.depth === 0 ||
            row.ancestorIds.every((id) => treeExpansion.expanded.has(id)),
        )
    return (
      <ul className="task-list">
        {visible.map((row) => (
          <TreeRowItem
            key={row.task.id}
            row={row}
            expanded={treeExpansion.expanded}
            onToggleTree={treeExpansion.toggle}
          />
        ))}
      </ul>
    )
  }
  if (hasFilters) {
    return (
      <EmptyState
        message="No tasks match these filters."
        action={
          <Link className="plain-action" to={tasksUrl({})}>
            Show all tasks
          </Link>
        }
      />
    )
  }
  return (
    <EmptyState
      message="No tasks yet."
      action={
        <button type="button" className="plain-action" onClick={openCreate}>
          Create a task
        </button>
      }
    />
  )
}
