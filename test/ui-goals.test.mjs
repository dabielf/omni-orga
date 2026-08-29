import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRIORITY_LIMIT_MESSAGE,
  STATUS_LABEL,
  completeWarning,
  deleteWarning,
  goalDetailFromData,
  priorityInUse,
  topLevelGoals,
} from '../src/lib/goalsView.ts'

function goal(overrides) {
  return {
    id: 'g_1',
    parentId: null,
    title: 'Goal',
    kind: 'one_shot',
    priority: false,
    sortOrder: 0,
    completedAt: null,
    archivedAt: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  }
}

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

const progress = (overrides) => ({
  kind: 'one_shot',
  completed: 5,
  total: 18,
  percentage: 27,
  text: '5 of 18 · 27%',
  ...overrides,
})

const fixture = {
  goals: [
    goal({ id: 'g_top1', title: 'Steady work', kind: 'ongoing', priority: true }),
    goal({ id: 'g_top2', title: 'Home basics' }),
    goal({ id: 'g_sub1', parentId: 'g_top1', title: 'Admin' }),
    goal({
      id: 'g_done',
      title: 'Wrapped up',
      completedAt: '2026-08-20T08:00:00.000Z',
    }),
  ],
  archivedGoals: [goal({ id: 'g_old', title: 'Old goal', archivedAt: '2026-08-10T08:00:00.000Z' })],
  progress: {
    g_top1: progress({ kind: 'ongoing', completed: 12, total: undefined, percentage: undefined, text: '12 done' }),
    g_sub1: progress({ completed: 2, total: 3, percentage: 66, text: '2 of 3 · 66%' }),
    g_empty: progress({ completed: 0, total: 0, percentage: 0, text: 'No tasks yet' }),
  },
  tasks: [
    task({ id: 't_1', title: 'Book a dentist', goalIds: ['g_sub1'] }),
    task({ id: 't_2', title: 'Compare funds', goalIds: ['g_sub1'], blocked: true, available: false }),
    task({ id: 't_3', title: 'Meal plan', goalIds: ['g_top1'], completedAt: '2026-08-18T08:00:00.000Z' }),
    task({ id: 't_4', title: 'Child step', parentId: 't_1', goalIds: [] }),
    task({ id: 't_5', title: 'Archived work', goalIds: ['g_sub1'], archivedAt: '2026-08-19T08:00:00.000Z' }),
  ],
}

test('topLevelGoals keeps manual order and drops subgoals', () => {
  assert.deepEqual(
    topLevelGoals(fixture.goals).map((goal) => goal.id),
    ['g_top1', 'g_top2', 'g_done'],
  )
})

test('priorityInUse counts only active priority goals', () => {
  assert.equal(priorityInUse(fixture.goals), 1)
  const completedPriority = goal({ id: 'g_p', priority: true, completedAt: '2026-08-01T08:00:00.000Z' })
  const archivedPriority = goal({ id: 'g_a', priority: true, archivedAt: '2026-08-01T08:00:00.000Z' })
  assert.equal(priorityInUse([...fixture.goals, completedPriority, archivedPriority]), 1)
})

test('goalDetailFromData builds the goal page view with linked task statuses', () => {
  const detail = goalDetailFromData(fixture, 'g_top1')
  assert.ok(detail)
  assert.equal(detail.goal.id, 'g_top1')
  assert.deepEqual(detail.subgoals.map((goal) => goal.id), ['g_sub1'])
  assert.deepEqual(
    detail.tasks.map((entry) => [entry.task.id, entry.status]),
    [
      ['t_1', 'available'],
      ['t_2', 'blocked'],
      ['t_3', 'completed'],
    ],
  )
})

test('goalDetailFromData answers null for a missing goal', () => {
  assert.equal(goalDetailFromData(fixture, 'g_missing'), null)
})

test('task statuses use the factual labels', () => {
  assert.deepEqual(STATUS_LABEL, {
    available: 'Available',
    blocked: 'Blocked',
    completed: 'Done',
  })
})

test('completeWarning names the unfinished tasks that stay active', () => {
  const detail = goalDetailFromData(fixture, 'g_top1')
  assert.ok(detail)
  assert.equal(
    completeWarning(detail),
    'Completing keeps 2 unfinished tasks active without this goal. You can undo.',
  )

  const single = goalDetailFromData(
    {
      ...fixture,
      tasks: [task({ id: 't_9', goalIds: ['g_top2'] })],
    },
    'g_top2',
  )
  assert.ok(single)
  assert.equal(
    completeWarning(single),
    'Completing keeps 1 unfinished task active without this goal. You can undo.',
  )
})

test('deleteWarning names the tree, the history, and the kept tasks', () => {
  const detail = goalDetailFromData(fixture, 'g_top1')
  assert.ok(detail)
  assert.equal(
    deleteWarning(detail),
    'Deletes this goal, its subgoal, and their task history. 2 linked tasks stay active without a goal.',
  )

  const bare = goalDetailFromData(
    { ...fixture, tasks: [] },
    'g_top2',
  )
  assert.ok(bare)
  assert.equal(
    deleteWarning(bare),
    'Deletes this goal and its task history. Linked tasks are never deleted automatically.',
  )
})

test('the client cap hint matches the domain PRIORITY_LIMIT message', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const store = await import('../src/domain/store.ts')
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-goal-hint-'))
  const goal = store.createDomainStore(join(directory, 'omni-orga.sqlite'))
  try {
    const first = goal.createGoal({ title: 'One', kind: 'one_shot' })
    const second = goal.createGoal({ title: 'Two', kind: 'one_shot' })
    const third = goal.createGoal({ title: 'Three', kind: 'one_shot' })
    const fourth = goal.createGoal({ title: 'Four', kind: 'one_shot' })
    goal.setGoalPriority(first.id, true)
    goal.setGoalPriority(second.id, true)
    goal.setGoalPriority(third.id, true)
    assert.throws(() => goal.setGoalPriority(fourth.id, true), (error) => {
      assert.equal(error.code, 'PRIORITY_LIMIT')
      assert.equal(error.message, PRIORITY_LIMIT_MESSAGE)
      return true
    })
  } finally {
    goal.close()
    await rm(directory, { recursive: true, force: true })
  }
})
