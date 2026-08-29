import assert from 'node:assert/strict'
import test from 'node:test'

import {
  availableRows,
  childrenOf,
  formatDay,
  formatShortDate,
  idealMatches,
  railCounts,
  remainingCount,
  taskInGoalScope,
  treeRows,
} from '../src/lib/tasksView.ts'

const today = '2026-08-29'

function task(overrides) {
  return {
    id: 't_1',
    parentId: null,
    sourceTaskId: null,
    historyId: 't_1',
    title: 'Task',
    notes: '',
    repeatable: false,
    sortOrder: 0,
    todayOrder: null,
    idealCompletionDate: null,
    deadline: null,
    scheduledDay: null,
    completedAt: null,
    archivedAt: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    blocked: false,
    available: true,
    goalIds: [],
    externalLinks: [],
    ...overrides,
  }
}

const goals = [
  { id: 'g_top1', parentId: null, title: 'Top one', kind: 'ongoing', priority: true, sortOrder: 0, completedAt: null, archivedAt: null, createdAt: '' },
  { id: 'g_top2', parentId: null, title: 'Top two', kind: 'ongoing', priority: false, sortOrder: 1, completedAt: null, archivedAt: null, createdAt: '' },
  { id: 'g_sub1', parentId: 'g_top1', title: 'Sub one', kind: 'ongoing', priority: false, sortOrder: 0, completedAt: null, archivedAt: null, createdAt: '' },
]

const fixtureTasks = [
  // 1: available top-level task linked to priority goal
  task({ id: 't_1', title: 'Tax return', goalIds: ['g_sub1'], deadline: '2026-09-15' }),
  // 2: blocked top-level with two subtasks (first available, nested sub-sub)
  task({
    id: 't_2',
    title: 'Paint walls',
    goalIds: ['g_top2'],
    scheduledDay: '2026-09-01',
    blocked: true,
    available: false,
  }),
  task({ id: 't_2a', parentId: 't_2', title: 'Move furniture', historyId: 't_2a' }),
  task({ id: 't_2b', parentId: 't_2a', title: 'Cover the floor', historyId: 't_2b' }),
  // 3: repeatable with scheduled today
  task({ id: 't_3', title: 'Water plants', repeatable: true, scheduledDay: today }),
  // 4: completed
  task({ id: 't_4', title: 'Insurance form', completedAt: '2026-08-27T10:00:00.000Z' }),
  // 5: archived
  task({ id: 't_5', title: 'Old phone plans', archivedAt: '2026-08-20T10:00:00.000Z' }),
]

const data = { today, goals, tasks: fixtureTasks, previous: { t_3: '2026-08-24' } }

function byId(tasks) {
  return new Map(tasks.map((task) => [task.id, task]))
}

test('goal scope matches direct links, subgoal links and their parent goals', () => {
  assert.equal(taskInGoalScope(data.tasks[0], 'g_sub1', byId(goals)), true)
  // A link to a subgoal also counts for its parent top-level goal.
  assert.equal(taskInGoalScope(data.tasks[0], 'g_top1', byId(goals)), true)
  assert.equal(taskInGoalScope(data.tasks[0], 'g_top2', byId(goals)), false)
  assert.equal(taskInGoalScope(data.tasks[1], 'g_top2', byId(goals)), true)
})

test('ideal date presets evaluate against the task own date and today', () => {
  const dated = task({ idealCompletionDate: today })
  assert.equal(idealMatches(dated, 'today', today), true)
  assert.equal(idealMatches(dated, 'week', today), true)
  assert.equal(idealMatches(dated, 'passed', today), false)
  assert.equal(idealMatches(dated, 'none', today), false)
  assert.equal(idealMatches(dated, undefined, today), true)

  const past = task({ idealCompletionDate: '2026-08-20' })
  assert.equal(idealMatches(past, 'passed', today), true)
  assert.equal(idealMatches(past, 'week', today), false)

  const inAWeek = task({ idealCompletionDate: '2026-09-04' })
  assert.equal(idealMatches(inAWeek, 'week', today), true)
  assert.equal(idealMatches(inAWeek, 'today', today), false)

  assert.equal(idealMatches(task(), 'none', today), true)
})

test('rail counts cover every view exactly', () => {
  const counts = railCounts(data)
  assert.equal(counts.all, 3) // t_1, t_2, t_3 are the active top-level trees
  assert.equal(counts.priority, 1) // t_1 through priority subgoal g_sub1
  assert.equal(counts.none, 1) // t_3 has no goals
  assert.equal(counts.goals.g_top1, 1)
  assert.equal(counts.goals.g_top2, 1)
  assert.equal(counts.completed, 1)
  assert.equal(counts.archived, 1)
})

test('remainingCount counts active incomplete descendants', () => {
  const children = childrenOf(fixtureTasks)
  assert.equal(remainingCount(fixtureTasks[1], children), 2)
  assert.equal(remainingCount(fixtureTasks[0], children), 0)
})

test('availableRows list every available task and subtask in normal order', () => {
  const rows = availableRows(data, {})
  assert.deepEqual(
    rows.map((row) => row.task.id),
    ['t_1', 't_2a', 't_2b', 't_3'],
  )
  // Blocked ancestors are hidden but present in the compact path.
  const nested = rows.find((row) => row.task.id === 't_2b')
  assert.deepEqual(nested.path, ['Paint walls', 'Move furniture'])
  const blockedRoot = rows.find((row) => row.task.id === 't_2a')
  assert.deepEqual(blockedRoot.path, ['Paint walls'])
  const topLevel = rows.find((row) => row.task.id === 't_1')
  assert.deepEqual(topLevel.path, [])
})

test('availableRows composes with goal and ideal date filters', () => {
  const goalRows = availableRows(data, { goal: 'g_top2' })
  assert.deepEqual(goalRows.map((row) => row.task.id), ['t_2a', 't_2b'])

  const idealRows = availableRows(data, { ideal: 'none' })
  // Every row matches because none of the available rows carries an ideal date.
  assert.deepEqual(idealRows.map((row) => row.task.id), ['t_1', 't_2a', 't_2b', 't_3'])

  const dated = data.tasks.map((t) =>
    t.id === 't_1' ? { ...t, idealCompletionDate: today } : t,
  )
  const todayRows = availableRows({ ...data, tasks: dated }, { ideal: 'today' })
  assert.deepEqual(todayRows.map((row) => row.task.id), ['t_1'])
})

test('treeRows render full active trees in normal order', () => {
  const rows = treeRows(data, {})
  assert.deepEqual(
    rows.map((row) => `${row.task.id}@${row.depth}`),
    ['t_1@0', 't_2@0', 't_2a@1', 't_2b@2', 't_3@0'],
  )
  const sub = rows.find((row) => row.task.id === 't_2b')
  assert.deepEqual(sub.path, [])
  assert.deepEqual(sub.ancestorIds, ['t_2', 't_2a'])
})

test('treeRows with an ideal filter keep only exact matches', () => {
  // t_2a gets today's ideal date; its ancestors have none.
  const tasks = data.tasks.map((t) =>
    t.id === 't_2a' ? { ...t, idealCompletionDate: today } : t,
  )
  const rows = treeRows({ ...data, tasks }, { ideal: 'today' })
  // Only the exact match renders, as a lone row with the hidden ancestors in
  // its compact path; the nonmatching root never becomes a row.
  assert.deepEqual(rows.map((row) => row.task.id), ['t_2a'])
  assert.deepEqual(rows[0].path, ['Paint walls'])
  assert.deepEqual(rows[0].ancestorIds, [])
})

test('treeRows with an ideal filter keep matching branches connected', () => {
  // Root and grandchild match, intermediate subtask does not.
  const tasks = data.tasks.map((t) => {
    if (t.id === 't_2') return { ...t, idealCompletionDate: today }
    if (t.id === 't_2b') return { ...t, idealCompletionDate: today }
    return t
  })
  const rows = treeRows({ ...data, tasks }, { ideal: 'today' })
  assert.deepEqual(
    rows.map((row) => `${row.task.id}@${row.depth}`),
    ['t_2@0', 't_2b@1'],
  )
  // The hidden nonmatching ancestor appears inside the descendant path.
  assert.deepEqual(rows[1].path, ['Move furniture'])
})

test('treeRows compose the goal filter with the ideal filter', () => {
  const tasks = data.tasks.map((t) =>
    t.id === 't_1' ? { ...t, idealCompletionDate: today } : t,
  )
  const rows = treeRows({ ...data, tasks }, { goal: 'g_top2', ideal: 'today' })
  assert.deepEqual(rows, [])
  const rowsTop1 = treeRows({ ...data, tasks }, { goal: 'g_top1', ideal: 'today' })
  assert.deepEqual(rowsTop1.map((row) => row.task.id), ['t_1'])
})

test('date labels stay short and factual', () => {
  assert.equal(formatDay(today, today), 'Today')
  assert.equal(formatDay('2026-08-30', today), 'Tomorrow')
  assert.equal(formatDay('2026-09-02', today), 'Wed Sep 2')
  assert.equal(formatShortDate('2026-09-15'), 'Sep 15')
})
