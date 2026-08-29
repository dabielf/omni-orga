import { randomBytes } from 'node:crypto'

import {
  applyMigrations,
  defaultMigrationsDirectory,
  openDatabase,
  // @ts-expect-error The foundation migration runner is a JavaScript module.
} from '../db/migrations.mjs'

export type DomainErrorCode =
  | 'GOAL_NOT_FOUND'
  | 'PRIORITY_LIMIT'
  | 'TASK_BLOCKED'
  | 'TASK_NOT_FOUND'
  | 'VALIDATION_FAILED'

export class DomainError extends Error {
  code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

type TaskRow = {
  id: string
  parent_id: string | null
  source_task_id: string | null
  history_id: string
  title: string
  notes: string
  is_repeatable: number
  sort_order: number
  today_order: number | null
  ideal_completion_date: string | null
  deadline: string | null
  scheduled_day: string | null
  completed_at: string | null
  archived_at: string | null
  created_at: string
}

type GoalRow = {
  id: string
  parent_id: string | null
  title: string
  kind: 'one_shot' | 'ongoing'
  is_priority: number
  sort_order: number
  completed_at: string | null
  archived_at: string | null
  created_at: string
}

export type Goal = {
  id: string
  parentId: string | null
  title: string
  kind: 'one_shot' | 'ongoing'
  priority: boolean
  sortOrder: number
  completedAt: string | null
  archivedAt: string | null
  createdAt: string
}

export type CreateGoalInput = {
  title: string
  kind: 'one_shot' | 'ongoing'
  parentId?: string
}

export type GoalTaskDisposition =
  | { action: 'keep_active' }
  | { action: 'link'; goalId: string }
  | { action: 'archive' }

export type CompleteGoalInput = {
  completedAt?: string
  linkedTasks?: Record<string, GoalTaskDisposition>
}

export type GoalRemovalInput = {
  linkedTasks?: Record<string, GoalTaskDisposition>
}

export type UpdateGoalInput = {
  title?: string
  kind?: 'one_shot' | 'ongoing'
}

export type ListGoalsInput = {
  parentId?: string | null
  priority?: boolean
  kind?: 'one_shot' | 'ongoing'
  includeArchived?: boolean
}

export type GoalProgress =
  | {
      kind: 'one_shot'
      completed: number
      total: number
      percentage: number
      text: string
    }
  | { kind: 'ongoing'; completed: number; text: string }

export type Task = {
  id: string
  parentId: string | null
  sourceTaskId: string | null
  historyId: string
  title: string
  notes: string
  repeatable: boolean
  sortOrder: number
  todayOrder: number | null
  idealCompletionDate: string | null
  deadline: string | null
  scheduledDay: string | null
  completedAt: string | null
  archivedAt: string | null
  createdAt: string
  blocked: boolean
  available: boolean
  goalIds: string[]
  externalLinks: string[]
}

export type TaskCompletion = Task & { freshTask: Task | null }
export type UpdateTaskInput = {
  title?: string
  notes?: string
  externalLinks?: string[]
}

export type CreateTaskInput = {
  title: string
  parentId?: string
  notes?: string
  repeatable?: boolean
  goalIds?: string[]
  externalLinks?: string[]
  idealCompletionDate?: string
  deadline?: string
  scheduledDay?: string
}

const localDay = () => {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}
export type ListTasksInput = {
  parentId?: string | null
  goalId?: string
  availability?: 'available' | 'blocked'
  includeArchived?: boolean
}

export type ListTaskHistoryInput = {
  from?: string
  to?: string
}

export type TaskHistoryEntry = {
  taskId: string
  title: string
  completedAt: string
}

const timestamp = () => new Date().toISOString()
const id = (prefix: 'g' | 't') =>
  `${prefix}_${randomBytes(5).toString('base64url').toLowerCase()}`

function requiredTitle(value: string) {
  const title = value.trim()
  if (!title) {
    throw new DomainError('VALIDATION_FAILED', 'Title is required')
  }
  return title
}

function optionalDay(value: string | null | undefined) {
  if (value == null) return null
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'Dates must use YYYY-MM-DD',
    )
  }
  return value
}

export function createDomainStore(
  databasePath: string,
  migrationsDirectory = defaultMigrationsDirectory,
) {
  applyMigrations({ databasePath, migrationsDirectory })
  const database = openDatabase(databasePath)

  const transaction = <T>(run: () => T) => {
    database.exec('BEGIN IMMEDIATE')
    try {
      const result = run()
      database.exec('COMMIT')
      return result
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }

  const getGoalRow = (goalId: string) => {
    const row = database
      .prepare('SELECT * FROM goals WHERE id = ?')
      .get(goalId) as GoalRow | undefined
    if (!row) {
      throw new DomainError('GOAL_NOT_FOUND', `Goal ${goalId} was not found`)
    }
    return row
  }

  const toGoal = (row: GoalRow): Goal => ({
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    kind: row.kind,
    priority: row.is_priority === 1,
    sortOrder: row.sort_order,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  })

  const getGoal = (goalId: string) => toGoal(getGoalRow(goalId))

  const createGoal = (input: CreateGoalInput) => {
    let parent: GoalRow | undefined
    if (input.parentId) {
      parent = getGoalRow(input.parentId)
      if (parent.parent_id) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'Goals can only have two levels',
        )
      }
      if (parent.archived_at || parent.completed_at) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'A subgoal cannot be added to an inactive goal',
        )
      }
      if (parent.kind === 'one_shot' && input.kind === 'ongoing') {
        throw new DomainError(
          'VALIDATION_FAILED',
          'A one-shot goal can only contain one-shot subgoals',
        )
      }
    }

    const goalId = id('g')
    const sortOrder = Number(
      database
        .prepare(
          `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
           FROM goals WHERE parent_id IS ?`,
        )
        .get(input.parentId ?? null)?.next,
    )
    database
      .prepare(
        `INSERT INTO goals (
          id, parent_id, title, kind, sort_order, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        goalId,
        input.parentId ?? null,
        requiredTitle(input.title),
        input.kind,
        sortOrder,
        timestamp(),
      )
    return getGoal(goalId)
  }

  const updateGoal = (goalId: string, input: UpdateGoalInput = {}) => {
    const goal = getGoalRow(goalId)
    const title = input.title === undefined ? goal.title : requiredTitle(input.title)
    let kind = goal.kind
    if (input.kind !== undefined && input.kind !== goal.kind) {
      if (goal.archived_at || goal.completed_at) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'An inactive goal cannot change kind',
        )
      }
      if (input.kind === 'one_shot') {
        const ongoingSubgoal = database
          .prepare(
            `SELECT 1 FROM goals WHERE parent_id = ? AND kind = 'ongoing' LIMIT 1`,
          )
          .get(goalId)
        if (ongoingSubgoal) {
          throw new DomainError(
            'VALIDATION_FAILED',
            'A one-shot goal can only contain one-shot subgoals',
          )
        }
      }
      kind = input.kind
    }
    database
      .prepare('UPDATE goals SET title = ?, kind = ? WHERE id = ?')
      .run(title, kind, goalId)
    return getGoal(goalId)
  }

  const listGoals = (input: ListGoalsInput = {}) => {
    const clauses: string[] = []
    const params: unknown[] = []
    if (!input.includeArchived) clauses.push('archived_at IS NULL')
    if (Object.hasOwn(input, 'parentId')) {
      clauses.push('parent_id IS ?')
      params.push(input.parentId ?? null)
    }
    if (input.priority !== undefined) {
      clauses.push('is_priority = ?')
      params.push(input.priority ? 1 : 0)
    }
    if (input.kind) {
      clauses.push('kind = ?')
      params.push(input.kind)
    }
    const rows = database
      .prepare(
        `SELECT * FROM goals${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''}
         ORDER BY sort_order, created_at, rowid`,
      )
      .all(...params) as GoalRow[]
    return rows.map(toGoal)
  }

  const setGoalPriority = (goalId: string, priority: boolean) => {
    const goal = getGoalRow(goalId)
    if (goal.archived_at || goal.completed_at) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Only active goals can be priority',
      )
    }
    if (priority && !goal.is_priority) {
      const used = Number(
        database
          .prepare(
            `SELECT COUNT(*) AS count FROM goals
             WHERE is_priority = 1 AND completed_at IS NULL AND archived_at IS NULL`,
          )
          .get()?.count,
      )
      if (used >= 3) {
        throw new DomainError(
          'PRIORITY_LIMIT',
          'All 3 priority slots are in use',
        )
      }
    }
    database
      .prepare('UPDATE goals SET is_priority = ? WHERE id = ?')
      .run(priority ? 1 : 0, goalId)
    return getGoal(goalId)
  }

  const getTaskRow = (taskId: string) => {
    const row = database
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(taskId) as TaskRow | undefined
    if (!row) {
      throw new DomainError('TASK_NOT_FOUND', `Task ${taskId} was not found`)
    }
    return row
  }

  const taskBlocked = (taskId: string) =>
    Boolean(
      database
        .prepare(
          `SELECT 1 FROM tasks
           WHERE parent_id = ? AND completed_at IS NULL AND archived_at IS NULL
           LIMIT 1`,
        )
        .get(taskId),
    )

  const toTask = (row: TaskRow): Task => {
    const blocked = row.completed_at === null && taskBlocked(row.id)
    const goalIds = database
      .prepare('SELECT goal_id FROM task_goal_links WHERE task_id = ? ORDER BY goal_id')
      .all(row.id)
      .map((link: Record<string, unknown>) => String(link.goal_id))
    const externalLinks = database
      .prepare(
        'SELECT url FROM task_external_links WHERE task_id = ? ORDER BY position',
      )
      .all(row.id)
      .map((link: Record<string, unknown>) => String(link.url))

    return {
      id: row.id,
      parentId: row.parent_id,
      sourceTaskId: row.source_task_id,
      historyId: row.history_id,
      title: row.title,
      notes: row.notes,
      repeatable: row.is_repeatable === 1,
      sortOrder: row.sort_order,
      todayOrder: row.today_order,
      idealCompletionDate: row.ideal_completion_date,
      deadline: row.deadline,
      scheduledDay: row.scheduled_day,
      completedAt: row.completed_at,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      blocked,
      available:
        row.completed_at === null && row.archived_at === null && !blocked,
      goalIds,
      externalLinks,
    }
  }

  const getTask = (taskId: string) => toTask(getTaskRow(taskId))

  const ancestorDeadline = (taskId: string) => {
    const row = database
      .prepare(
        `WITH RECURSIVE ancestors(id, parent_id, deadline) AS (
          SELECT parent.id, parent.parent_id, parent.deadline
          FROM tasks child JOIN tasks parent ON parent.id = child.parent_id
          WHERE child.id = ?
          UNION ALL
          SELECT parent.id, parent.parent_id, parent.deadline
          FROM ancestors JOIN tasks parent ON parent.id = ancestors.parent_id
        )
        SELECT MIN(deadline) AS deadline FROM ancestors WHERE deadline IS NOT NULL`,
      )
      .get(taskId) as { deadline: string | null }
    return row.deadline
  }

  const validateAgainstAncestorDeadline = (
    taskId: string,
    day: string | null,
  ) => {
    const deadline = ancestorDeadline(taskId)
    if (day && deadline && day > deadline) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `A subtask date cannot fall after the ${deadline} deadline above it`,
      )
    }
  }

  const validateNewSubtaskDate = (
    parentId: string | undefined,
    day: string | null,
  ) => {
    if (!parentId || !day) return
    const row = database
      .prepare(
        `WITH RECURSIVE ancestors(id, parent_id, deadline) AS (
          SELECT id, parent_id, deadline FROM tasks WHERE id = ?
          UNION ALL
          SELECT tasks.id, tasks.parent_id, tasks.deadline
          FROM tasks JOIN ancestors ON tasks.id = ancestors.parent_id
        )
        SELECT MIN(deadline) AS deadline FROM ancestors WHERE deadline IS NOT NULL`,
      )
      .get(parentId) as { deadline: string | null }
    if (row.deadline && day > row.deadline) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `A subtask date cannot fall after the ${row.deadline} deadline above it`,
      )
    }
  }

  const listTasks = (input: ListTasksInput = {}) => {
    const clauses: string[] = []
    const params: unknown[] = []
    if (input.availability) {
      const childExists = `EXISTS (
        SELECT 1 FROM tasks child
        WHERE child.parent_id = tasks.id
          AND child.completed_at IS NULL
          AND child.archived_at IS NULL
      )`
      clauses.push(
        'completed_at IS NULL',
        'archived_at IS NULL',
        input.availability === 'available' ? `NOT ${childExists}` : childExists,
      )
    } else if (!input.includeArchived) {
      clauses.push('archived_at IS NULL')
    }
    if (Object.hasOwn(input, 'parentId')) {
      clauses.push('parent_id IS ?')
      params.push(input.parentId ?? null)
    }
    if (input.goalId) {
      clauses.push(`id IN (
        WITH RECURSIVE linked(id) AS (
          SELECT task_id FROM task_goal_links WHERE goal_id = ?
          UNION ALL
          SELECT tasks.id FROM tasks JOIN linked ON tasks.parent_id = linked.id
        )
        SELECT id FROM linked
      )`)
      params.push(input.goalId)
    }
    const rows = database
      .prepare(
        `SELECT * FROM tasks${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''}
         ORDER BY sort_order, created_at, rowid`,
      )
      .all(...params) as TaskRow[]
    return rows.map(toTask)
  }

  const getPreviousCompletion = (taskId: string) => {
    const task = getTaskRow(taskId)
    const row = database
      .prepare(
        `SELECT completed_at FROM tasks
         WHERE history_id = ? AND id <> ? AND completed_at IS NOT NULL
         ORDER BY completed_at DESC LIMIT 1`,
      )
      .get(task.history_id, task.id) as
      | { completed_at: string }
      | undefined
    return row?.completed_at ?? null
  }

  const listTaskHistory = (
    taskId: string,
    input: ListTaskHistoryInput = {},
  ): TaskHistoryEntry[] => {
    const task = getTaskRow(taskId)
    const from = optionalDay(input.from)
    const to = optionalDay(input.to)
    const rows = database
      .prepare(
        `SELECT id, title, completed_at FROM tasks
         WHERE history_id = ? AND completed_at IS NOT NULL
         ORDER BY completed_at, created_at`,
      )
      .all(task.history_id) as Array<{
      id: string
      title: string
      completed_at: string
    }>
    return rows
      .filter(
        (row) =>
          (!from || row.completed_at.slice(0, 10) >= from) &&
          (!to || row.completed_at.slice(0, 10) <= to),
      )
      .map((row) => ({
        taskId: row.id,
        title: row.title,
        completedAt: row.completed_at,
      }))
  }

  const createTask = (input: CreateTaskInput) => {
    let parent: TaskRow | undefined
    if (input.parentId) {
      parent = getTaskRow(input.parentId)
      if (parent.archived_at) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'A subtask cannot be added to an archived task',
        )
      }
      if (parent.completed_at) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'A subtask cannot be added to a completed task',
        )
      }
    }
    if (input.repeatable && parent) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Only top-level tasks can be repeatable',
      )
    }
    if (parent && input.goalIds?.length) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Only top-level tasks can link to goals',
      )
    }
    const goalIds = [...new Set(input.goalIds ?? [])]
    for (const goalId of goalIds) {
      const goal = getGoalRow(goalId)
      if (goal.archived_at || goal.completed_at) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'Tasks can only link to active goals',
        )
      }
    }
    const idealCompletionDate = optionalDay(input.idealCompletionDate)
    const deadline = optionalDay(input.deadline)
    const scheduledDay = optionalDay(input.scheduledDay)
    if (idealCompletionDate && deadline) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'A task cannot have both an ideal completion date and a deadline',
      )
    }
    validateNewSubtaskDate(
      input.parentId,
      idealCompletionDate ?? deadline,
    )
    validateNewSubtaskDate(input.parentId, scheduledDay)
    if (
      scheduledDay &&
      deadline &&
      deadline >= localDay() &&
      scheduledDay > deadline
    ) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `A task cannot be planned after its unpassed ${deadline} deadline`,
      )
    }

    const taskId = id('t')
    const createdAt = timestamp()
    const historyId = taskId
    const sortOrder = Number(
      database
        .prepare(
          `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
           FROM tasks WHERE parent_id IS ?`,
        )
        .get(input.parentId ?? null)?.next,
    )

    return transaction(() => {
      database
        .prepare(
          `INSERT INTO tasks (
            id, parent_id, history_id, title, notes, is_repeatable, sort_order,
            ideal_completion_date, deadline, scheduled_day, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          taskId,
          input.parentId ?? null,
          historyId,
          requiredTitle(input.title),
          input.notes ?? '',
          input.repeatable ? 1 : 0,
          sortOrder,
          idealCompletionDate,
          deadline,
          scheduledDay,
          createdAt,
        )

      const addGoalLink = database.prepare(
        'INSERT INTO task_goal_links (task_id, goal_id) VALUES (?, ?)',
      )
      for (const goalId of goalIds) {
        addGoalLink.run(taskId, goalId)
      }
      const addExternalLink = database.prepare(
        `INSERT INTO task_external_links (task_id, position, url)
         VALUES (?, ?, ?)`,
      )
      for (const [position, url] of (input.externalLinks ?? []).entries()) {
        addExternalLink.run(taskId, position, url.trim())
      }

      if (parent?.scheduled_day && parent.scheduled_day <= localDay()) {
        database
          .prepare(
            'UPDATE tasks SET scheduled_day = NULL, today_order = NULL WHERE id = ?',
          )
          .run(parent.id)
      }

      return getTask(taskId)
    })
  }

  const cloneRepeatableTree = (root: TaskRow, createdAt: string) => {
    const rows = database
      .prepare(
        `WITH RECURSIVE task_tree(id, depth) AS (
          SELECT ?, 0
          UNION ALL
          SELECT tasks.id, task_tree.depth + 1
          FROM tasks JOIN task_tree ON tasks.parent_id = task_tree.id
        )
        SELECT tasks.*, task_tree.depth
        FROM tasks JOIN task_tree ON tasks.id = task_tree.id
        ORDER BY task_tree.depth, tasks.sort_order`,
      )
      .all(root.id) as Array<TaskRow & { depth: number }>
    const ids = new Map<string, string>()
    const insert = database.prepare(
      `INSERT INTO tasks (
        id, parent_id, source_task_id, history_id, title, notes, is_repeatable,
        sort_order, ideal_completion_date, deadline, scheduled_day,
        completed_at, archived_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
    )
    const copyExternalLink = database.prepare(
      `INSERT INTO task_external_links (task_id, position, url)
       SELECT ?, position, url FROM task_external_links WHERE task_id = ?`,
    )

    for (const row of rows) {
      const copyId = id('t')
      ids.set(row.id, copyId)
      insert.run(
        copyId,
        row.parent_id ? ids.get(row.parent_id) : null,
        row.id,
        row.history_id,
        row.title,
        row.notes,
        row.is_repeatable,
        row.sort_order,
        row.archived_at,
        createdAt,
      )
      copyExternalLink.run(copyId, row.id)
    }

    const freshRootId = ids.get(root.id)
    if (!freshRootId) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'The repeatable task could not be copied',
      )
    }
    database
      .prepare(
        `INSERT INTO task_goal_links (task_id, goal_id)
         SELECT ?, goal_id FROM task_goal_links WHERE task_id = ?`,
      )
      .run(freshRootId, root.id)
    return getTask(freshRootId)
  }

  const completeTask = (
    taskId: string,
    completedAt = timestamp(),
  ): TaskCompletion => {
    const task = getTaskRow(taskId)
    if (task.archived_at) {
      throw new DomainError('VALIDATION_FAILED', 'Archived tasks cannot be completed')
    }
    if (task.completed_at) {
      return { ...toTask(task), freshTask: null }
    }
    if (taskBlocked(taskId)) {
      throw new DomainError(
        'TASK_BLOCKED',
        `Task ${taskId} has unfinished subtasks`,
      )
    }

    return transaction(() => {
      database
        .prepare('UPDATE tasks SET completed_at = ? WHERE id = ?')
        .run(completedAt, taskId)
      const completedTask = getTask(taskId)
      const freshTask = task.is_repeatable
        ? cloneRepeatableTree(task, completedAt)
        : null
      return { ...completedTask, freshTask }
    })
  }

  const undoTaskCompletion = (taskId: string) => {
    const task = getTaskRow(taskId)
    if (!task.completed_at) return toTask(task)

    return transaction(() => {
      if (task.is_repeatable) {
        const nextCopy = database
          .prepare(
            `SELECT id, completed_at FROM tasks
             WHERE source_task_id = ? AND parent_id IS NULL
             ORDER BY created_at DESC LIMIT 1`,
          )
          .get(taskId) as
          | { id: string; completed_at: string | null }
          | undefined
        if (!nextCopy || nextCopy.completed_at) {
          throw new DomainError(
            'VALIDATION_FAILED',
            'Only the latest repeatable completion can be undone',
          )
        }
        database.prepare('DELETE FROM tasks WHERE id = ?').run(nextCopy.id)
      }
      database
        .prepare('UPDATE tasks SET completed_at = NULL WHERE id = ?')
        .run(taskId)
      return getTask(taskId)
    })
  }

  const setTaskDeadline = (taskId: string, value: string | null) => {
    const task = getTaskRow(taskId)
    const deadline = optionalDay(value)
    validateAgainstAncestorDeadline(taskId, deadline)
    if (
      deadline &&
      task.scheduled_day &&
      deadline >= localDay() &&
      task.scheduled_day > deadline
    ) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Unschedule the task first: it is planned for ${task.scheduled_day}, after the new ${deadline} deadline`,
      )
    }
    if (deadline) {
      const laterDescendant = database
        .prepare(
          `WITH RECURSIVE descendants(id) AS (
            SELECT id FROM tasks WHERE parent_id = ?
            UNION ALL
            SELECT tasks.id FROM tasks JOIN descendants ON tasks.parent_id = descendants.id
          )
          SELECT 1 FROM tasks
          WHERE id IN (SELECT id FROM descendants)
            AND COALESCE(deadline, ideal_completion_date) > ?
          LIMIT 1`,
        )
        .get(taskId, deadline)
      if (laterDescendant) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'A deadline cannot fall before a subtask completion date',
        )
      }
    }
    database
      .prepare(
        `UPDATE tasks
         SET deadline = ?, ideal_completion_date = NULL
         WHERE id = ?`,
      )
      .run(deadline, taskId)
    const updated = getTask(taskId)
    return {
      idealCompletionDate: updated.idealCompletionDate,
      deadline: updated.deadline,
    }
  }

  const setTaskIdealCompletionDate = (taskId: string, value: string | null) => {
    getTaskRow(taskId)
    const idealCompletionDate = optionalDay(value)
    validateAgainstAncestorDeadline(taskId, idealCompletionDate)
    database
      .prepare(
        `UPDATE tasks
         SET ideal_completion_date = ?, deadline = NULL
         WHERE id = ?`,
      )
      .run(idealCompletionDate, taskId)
    const task = getTask(taskId)
    return {
      idealCompletionDate: task.idealCompletionDate,
      deadline: task.deadline,
    }
  }

  const refreshSchedules = (day: string) => {
    database
      .prepare(
        `UPDATE tasks
         SET scheduled_day = NULL, today_order = NULL
         WHERE completed_at IS NULL
           AND archived_at IS NULL
           AND scheduled_day IS NOT NULL
           AND (
             scheduled_day < ?
             OR (
               scheduled_day <= ?
               AND EXISTS (
                 SELECT 1 FROM tasks child
                 WHERE child.parent_id = tasks.id
                   AND child.completed_at IS NULL
                   AND child.archived_at IS NULL
               )
             )
           )`,
      )
      .run(day, day)
  }

  const planTask = (
    taskId: string,
    value: string,
    today = localDay(),
  ) => {
    const task = getTaskRow(taskId)
    const scheduledDay = optionalDay(value)
    const observedDay = optionalDay(today)
    if (!scheduledDay || !observedDay) {
      throw new DomainError('VALIDATION_FAILED', 'A scheduled day is required')
    }
    if (task.completed_at || task.archived_at) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Only active incomplete tasks can be planned',
      )
    }
    if (scheduledDay < observedDay) {
      throw new DomainError('VALIDATION_FAILED', 'A task cannot be planned in the past')
    }
    if (scheduledDay === observedDay && taskBlocked(taskId)) {
      throw new DomainError(
        'TASK_BLOCKED',
        `Task ${taskId} has unfinished subtasks`,
      )
    }
    if (
      task.deadline &&
      task.deadline >= observedDay &&
      scheduledDay > task.deadline
    ) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `This task cannot be planned after its ${task.deadline} deadline`,
      )
    }
    validateAgainstAncestorDeadline(taskId, scheduledDay)

    const todayOrder =
      scheduledDay === observedDay
        ? Number(
            database
              .prepare(
                `SELECT COALESCE(MAX(today_order), -1) + 1 AS next
                 FROM tasks WHERE scheduled_day = ? AND completed_at IS NULL`,
              )
              .get(scheduledDay)?.next,
          )
        : null
    database
      .prepare(
        `UPDATE tasks SET scheduled_day = ?, today_order = ? WHERE id = ?`,
      )
      .run(scheduledDay, todayOrder, taskId)
    return getTask(taskId)
  }

  const updateTask = (taskId: string, input: UpdateTaskInput = {}) => {
    const row = getTaskRow(taskId)
    const title = input.title === undefined ? row.title : requiredTitle(input.title)
    const notes = input.notes === undefined ? row.notes : input.notes
    return transaction(() => {
      database
        .prepare('UPDATE tasks SET title = ?, notes = ? WHERE id = ?')
        .run(title, notes, taskId)
      if (input.externalLinks !== undefined) {
        database
          .prepare('DELETE FROM task_external_links WHERE task_id = ?')
          .run(taskId)
        const insert = database.prepare(
          'INSERT INTO task_external_links (task_id, position, url) VALUES (?, ?, ?)',
        )
        for (const [position, url] of input.externalLinks.entries()) {
          insert.run(taskId, position, url.trim())
        }
      }
      return getTask(taskId)
    })
  }

  const setTaskGoalLinks = (taskId: string, goalIds: string[]) => {
    const task = getTaskRow(taskId)
    if (task.parent_id) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Only top-level tasks can link to goals',
      )
    }
    const unique = [...new Set(goalIds)]
    for (const goalId of unique) {
      const goal = getGoalRow(goalId)
      if (goal.archived_at || goal.completed_at) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'Tasks can only link to active goals',
        )
      }
    }
    return transaction(() => {
      database.prepare('DELETE FROM task_goal_links WHERE task_id = ?').run(taskId)
      const insert = database.prepare(
        'INSERT INTO task_goal_links (task_id, goal_id) VALUES (?, ?)',
      )
      for (const goalId of unique) insert.run(taskId, goalId)
      return getTask(taskId)
    })
  }

  const unplanTask = (taskId: string) => {
    const task = getTaskRow(taskId)
    if (task.completed_at || task.archived_at) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Only open tasks can be unscheduled',
      )
    }
    database
      .prepare(
        'UPDATE tasks SET scheduled_day = NULL, today_order = NULL WHERE id = ?',
      )
      .run(taskId)
    return getTask(taskId)
  }

  const getToday = (value = localDay()) => {
    const day = optionalDay(value)
    if (!day) {
      throw new DomainError('VALIDATION_FAILED', 'A day is required')
    }
    refreshSchedules(day)
    const open = database
      .prepare(
        `SELECT tasks.* FROM tasks
         WHERE scheduled_day = ?
           AND completed_at IS NULL
           AND archived_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM tasks child
             WHERE child.parent_id = tasks.id
               AND child.completed_at IS NULL
               AND child.archived_at IS NULL
           )
         ORDER BY today_order, created_at`,
      )
      .all(day) as TaskRow[]
    const completed = database
      .prepare(
        `SELECT * FROM tasks
         WHERE scheduled_day = ? AND completed_at IS NOT NULL AND archived_at IS NULL
         ORDER BY completed_at DESC`,
      )
      .all(day) as TaskRow[]
    return {
      open: open.map(toTask),
      completed: completed.map(toTask),
    }
  }

  const setTaskTreeArchived = (
    taskId: string,
    archivedAt: string | null,
  ) => {
    database
      .prepare(
        `WITH RECURSIVE task_tree(id) AS (
          SELECT ?
          UNION ALL
          SELECT tasks.id FROM tasks JOIN task_tree ON tasks.parent_id = task_tree.id
        )
        UPDATE tasks
        SET archived_at = ?
        WHERE id IN (SELECT id FROM task_tree)`,
      )
      .run(taskId, archivedAt)
  }

  const goalTreeIds = (goalId: string) =>
    (
      database
        .prepare(
          `WITH RECURSIVE goal_tree(id) AS (
            SELECT ?
            UNION ALL
            SELECT goals.id FROM goals JOIN goal_tree ON goals.parent_id = goal_tree.id
          )
          SELECT id FROM goal_tree`,
        )
        .all(goalId) as Array<{ id: string }>
    ).map((row) => row.id)

  const activeLinkedTasks = (goalIds: string[]) =>
    goalIds.length
      ? (database
          .prepare(
            `SELECT DISTINCT tasks.id FROM tasks
             JOIN task_goal_links ON task_goal_links.task_id = tasks.id
             WHERE task_goal_links.goal_id IN (${goalIds.map(() => '?').join(', ')})
               AND tasks.completed_at IS NULL
               AND tasks.archived_at IS NULL
             ORDER BY tasks.id`,
          )
          .all(...goalIds) as Array<{ id: string }>)
      : []

  const replacementGoalFor = (
    disposition: GoalTaskDisposition,
    removedGoalIds: string[],
  ) => {
    if (disposition.action !== 'link') return null
    const replacement = getGoalRow(disposition.goalId)
    if (replacement.archived_at || replacement.completed_at) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'The replacement goal must be active',
      )
    }
    if (removedGoalIds.includes(replacement.id)) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'The replacement goal cannot be inside the removed goal tree',
      )
    }
    return replacement
  }

  const completeGoal = (goalId: string, input: CompleteGoalInput = {}) => {
    const goal = getGoalRow(goalId)
    if (goal.kind === 'ongoing') {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Ongoing goals cannot be completed',
      )
    }
    if (goal.archived_at) {
      throw new DomainError('VALIDATION_FAILED', 'Archived goals cannot be completed')
    }
    if (goal.completed_at) return toGoal(goal)
    if (
      database
        .prepare(
          `SELECT 1 FROM goals
           WHERE parent_id = ? AND completed_at IS NULL AND archived_at IS NULL
           LIMIT 1`,
        )
        .get(goalId)
    ) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Complete or archive active subgoals first',
      )
    }

    const linkedTasks = database
      .prepare(
        `SELECT tasks.id
         FROM tasks
         JOIN task_goal_links ON task_goal_links.task_id = tasks.id
         WHERE task_goal_links.goal_id = ?
           AND tasks.completed_at IS NULL
           AND tasks.archived_at IS NULL`,
      )
      .all(goalId) as Array<{ id: string }>

    return transaction(() => {
      database
        .prepare('DELETE FROM goal_completion_changes WHERE goal_id = ?')
        .run(goalId)
      const unlink = database.prepare(
        'DELETE FROM task_goal_links WHERE task_id = ? AND goal_id = ?',
      )
      const link = database.prepare(
        'INSERT OR IGNORE INTO task_goal_links (task_id, goal_id) VALUES (?, ?)',
      )
      const record = database.prepare(
        `INSERT INTO goal_completion_changes (
          goal_id, task_id, replacement_goal_id, replacement_added, task_archived
        ) VALUES (?, ?, ?, ?, ?)`,
      )

      for (const task of linkedTasks) {
        const disposition = input.linkedTasks?.[task.id] ?? {
          action: 'keep_active',
        }
        unlink.run(task.id, goalId)
        let replacementGoalId: string | null = null
        let replacementAdded = 0
        let taskArchived = 0
        if (disposition.action === 'link') {
          const replacement = replacementGoalFor(disposition, [goalId])
          if (!replacement) {
            throw new DomainError(
              'VALIDATION_FAILED',
              'The replacement goal must be active',
            )
          }
          replacementGoalId = replacement.id
          replacementAdded = Number(
            !database
              .prepare(
                'SELECT 1 FROM task_goal_links WHERE task_id = ? AND goal_id = ?',
              )
              .get(task.id, replacement.id),
          )
          link.run(task.id, replacement.id)
        } else if (disposition.action === 'archive') {
          taskArchived = 1
          setTaskTreeArchived(task.id, input.completedAt ?? timestamp())
        }
        record.run(
          goalId,
          task.id,
          replacementGoalId,
          replacementAdded,
          taskArchived,
        )
      }
      database
        .prepare(
          'UPDATE goals SET completed_at = ?, is_priority = 0 WHERE id = ?',
        )
        .run(input.completedAt ?? timestamp(), goalId)
      return getGoal(goalId)
    })
  }

  const archiveGoal = (
    goalId: string,
    archivedAt = timestamp(),
    input: GoalRemovalInput = {},
  ) => {
    const goal = getGoalRow(goalId)
    if (goal.archived_at) return toGoal(goal)

    return transaction(() => {
      database
        .prepare('DELETE FROM goal_archive_links WHERE archived_goal_id = ?')
        .run(goalId)
      database
        .prepare(
          'DELETE FROM goal_archive_archived_tasks WHERE archived_goal_id = ?',
        )
        .run(goalId)
      const removedGoalIds = goalTreeIds(goalId)
      const recordLink = database.prepare(
        `INSERT INTO goal_archive_links (
          archived_goal_id, task_id, linked_goal_id, replacement
        ) VALUES (?, ?, ?, ?)`,
      )
      const removeLink = database.prepare(
        'DELETE FROM task_goal_links WHERE task_id = ? AND goal_id = ?',
      )
      for (const task of activeLinkedTasks(removedGoalIds)) {
        const disposition = input.linkedTasks?.[task.id] ?? {
          action: 'keep_active',
        }
        for (const linked of database
          .prepare(
            `SELECT goal_id FROM task_goal_links
             WHERE task_id = ? AND goal_id IN (${removedGoalIds.map(() => '?').join(', ')})`,
          )
          .all(task.id, ...removedGoalIds) as Array<{ goal_id: string }>) {
          recordLink.run(goalId, task.id, linked.goal_id, 0)
          removeLink.run(task.id, linked.goal_id)
        }
        const replacement = replacementGoalFor(disposition, removedGoalIds)
        if (replacement) {
          const alreadyLinked = database
            .prepare(
              'SELECT 1 FROM task_goal_links WHERE task_id = ? AND goal_id = ?',
            )
            .get(task.id, replacement.id)
          if (!alreadyLinked) {
            database
              .prepare(
                'INSERT INTO task_goal_links (task_id, goal_id) VALUES (?, ?)',
              )
              .run(task.id, replacement.id)
            recordLink.run(goalId, task.id, replacement.id, 1)
          }
        } else if (disposition.action === 'archive') {
          setTaskTreeArchived(task.id, archivedAt)
          database
            .prepare(
              `INSERT INTO goal_archive_archived_tasks (
                archived_goal_id, task_id
              ) VALUES (?, ?)`,
            )
            .run(goalId, task.id)
        }
      }
      database
        .prepare(
          `WITH RECURSIVE goal_tree(id) AS (
            SELECT ?
            UNION ALL
            SELECT goals.id FROM goals JOIN goal_tree ON goals.parent_id = goal_tree.id
          )
          UPDATE goals SET archived_at = ?, is_priority = 0
          WHERE id IN (SELECT id FROM goal_tree)`,
        )
        .run(goalId, archivedAt)
      return getGoal(goalId)
    })
  }
  const restoreGoal = (goalId: string) => {
    const goal = getGoalRow(goalId)
    if (!goal.archived_at) return toGoal(goal)

    return transaction(() => {
      database
        .prepare(
          `WITH RECURSIVE goal_tree(id) AS (
            SELECT ?
            UNION ALL
            SELECT goals.id FROM goals JOIN goal_tree ON goals.parent_id = goal_tree.id
          )
          UPDATE goals SET archived_at = NULL
          WHERE id IN (SELECT id FROM goal_tree)`,
        )
        .run(goalId)
      database
        .prepare(
          `INSERT OR IGNORE INTO task_goal_links (task_id, goal_id)
           SELECT task_id, linked_goal_id FROM goal_archive_links
           WHERE archived_goal_id = ? AND replacement = 0`,
        )
        .run(goalId)
      database
        .prepare(
          `DELETE FROM task_goal_links
           WHERE (task_id, goal_id) IN (
             SELECT task_id, linked_goal_id FROM goal_archive_links
             WHERE archived_goal_id = ? AND replacement = 1
           )`,
        )
        .run(goalId)
      for (const change of database
        .prepare(
          'SELECT task_id FROM goal_archive_archived_tasks WHERE archived_goal_id = ?',
        )
        .all(goalId) as Array<{ task_id: string }>) {
        setTaskTreeArchived(change.task_id, null)
      }
      database
        .prepare('DELETE FROM goal_archive_links WHERE archived_goal_id = ?')
        .run(goalId)
      database
        .prepare(
          'DELETE FROM goal_archive_archived_tasks WHERE archived_goal_id = ?',
        )
        .run(goalId)
      return getGoal(goalId)
    })
  }

  const deleteGoal = (goalId: string, input: GoalRemovalInput = {}) => {
    getGoalRow(goalId)
    transaction(() => {
      const removedGoalIds = goalTreeIds(goalId)
      for (const task of activeLinkedTasks(removedGoalIds)) {
        const disposition = input.linkedTasks?.[task.id] ?? {
          action: 'keep_active',
        }
        const replacement = replacementGoalFor(disposition, removedGoalIds)
        if (replacement) {
          database
            .prepare(
              'INSERT OR IGNORE INTO task_goal_links (task_id, goal_id) VALUES (?, ?)',
            )
            .run(task.id, replacement.id)
        } else if (disposition.action === 'archive') {
          setTaskTreeArchived(task.id, timestamp())
        }
      }
      database.prepare('DELETE FROM goals WHERE id = ?').run(goalId)
    })
  }

  const reopenGoal = (goalId: string) => {
    const goal = getGoalRow(goalId)
    if (!goal.completed_at) return toGoal(goal)

    return transaction(() => {
      const changes = database
        .prepare('SELECT * FROM goal_completion_changes WHERE goal_id = ?')
        .all(goalId) as Array<{
        task_id: string
        replacement_goal_id: string | null
        replacement_added: number
        task_archived: number
      }>
      for (const change of changes) {
        if (change.task_archived) setTaskTreeArchived(change.task_id, null)
        if (change.replacement_added && change.replacement_goal_id) {
          database
            .prepare(
              'DELETE FROM task_goal_links WHERE task_id = ? AND goal_id = ?',
            )
            .run(change.task_id, change.replacement_goal_id)
        }
        database
          .prepare(
            'INSERT OR IGNORE INTO task_goal_links (task_id, goal_id) VALUES (?, ?)',
          )
          .run(change.task_id, goalId)
      }
      database
        .prepare('DELETE FROM goal_completion_changes WHERE goal_id = ?')
        .run(goalId)
      database
        .prepare('UPDATE goals SET completed_at = NULL WHERE id = ?')
        .run(goalId)
      return getGoal(goalId)
    })
  }
  const archiveTask = (taskId: string, archivedAt = timestamp()) => {
    const task = getTaskRow(taskId)
    if (task.archived_at) return toTask(task)
    setTaskTreeArchived(taskId, archivedAt)
    return getTask(taskId)
  }

  const restoreTask = (taskId: string) => {
    const task = getTaskRow(taskId)
    if (!task.archived_at) return toTask(task)
    if (task.parent_id && getTaskRow(task.parent_id).archived_at) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Restore the parent task first',
      )
    }
    setTaskTreeArchived(taskId, null)
    return getTask(taskId)
  }

  const deleteTask = (taskId: string) => {
    const task = getTaskRow(taskId)
    transaction(() => {
      if (task.parent_id === null) {
        database
          .prepare('DELETE FROM tasks WHERE history_id = ?')
          .run(task.history_id)
      } else {
        database.prepare('DELETE FROM tasks WHERE id = ?').run(taskId)
      }
    })
  }

  const getGoalProgress = (goalId: string): GoalProgress => {
    const goal = getGoalRow(goalId)
    const counts = database
      .prepare(
        `WITH RECURSIVE
          goal_scope(id) AS (
            SELECT ?
            UNION ALL
            SELECT goals.id FROM goals JOIN goal_scope ON goals.parent_id = goal_scope.id
          ),
          linked_tasks AS (
            SELECT tasks.*
            FROM tasks
            JOIN task_goal_links ON task_goal_links.task_id = tasks.id
            WHERE task_goal_links.goal_id IN (SELECT id FROM goal_scope)
          ),
          task_tree AS (
            SELECT * FROM linked_tasks
            UNION
            SELECT tasks.*
            FROM tasks
            JOIN task_tree ON tasks.parent_id = task_tree.id
          )
        SELECT
          COALESCE(SUM(completed_at IS NOT NULL), 0) AS completed,
          COALESCE(SUM(completed_at IS NOT NULL OR archived_at IS NULL), 0) AS total
        FROM task_tree`,
      )
      .get(goalId) as { completed: number; total: number }

    if (goal.kind === 'ongoing') {
      return {
        kind: 'ongoing',
        completed: counts.completed,
        text: `${counts.completed} done`,
      }
    }

    const percentage = counts.total
      ? Math.floor((counts.completed / counts.total) * 100)
      : 0
    return {
      kind: 'one_shot',
      completed: counts.completed,
      total: counts.total,
      percentage,
      text: counts.total
        ? `${counts.completed} of ${counts.total} · ${percentage}%`
        : 'No tasks yet',
    }
  }

  return {
    archiveGoal,
    archiveTask,
    close: () => database.close(),
    completeGoal,
    completeTask,
    createGoal,
    createTask,
    deleteGoal,
    deleteTask,
    getGoal,
    getGoalProgress,
    getPreviousCompletion,
    getTask,
    getToday,
    listGoals,
    listTaskHistory,
    listTasks,
    planTask,
    reopenGoal,
    restoreGoal,
    restoreTask,
    setGoalPriority,
    setTaskDeadline,
    setTaskGoalLinks,
    setTaskIdealCompletionDate,
    unplanTask,
    undoTaskCompletion,
    updateGoal,
    updateTask,
  }
}
