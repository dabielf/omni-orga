import assert from 'node:assert/strict'
import test from 'node:test'

import { coverageSplit, goalNames, longDay } from '../src/lib/todayView.ts'

const today = '2026-08-29'

const goals = [
  { id: 'g_top1', parentId: null, title: 'Top one', kind: 'ongoing', priority: false, sortOrder: 0, completedAt: null, archivedAt: null, createdAt: '' },
  { id: 'g_sub1', parentId: 'g_top1', title: 'Sub one', kind: 'ongoing', priority: false, sortOrder: 0, completedAt: null, archivedAt: null, createdAt: '' },
  { id: 'g_top2', parentId: null, title: 'Top two', kind: 'ongoing', priority: false, sortOrder: 1, completedAt: null, archivedAt: null, createdAt: '' },
  { id: 'g_done', parentId: null, title: 'Finished goal', kind: 'one_shot', priority: false, sortOrder: 2, completedAt: '2026-08-20', archivedAt: null, createdAt: '' },
]

const task = {
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
  scheduledDay: today,
  completedAt: null,
  archivedAt: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  blocked: false,
  available: true,
  goalIds: [],
  externalLinks: [],
}

const data = {
  today,
  goals,
  open: [{ ...task, goalIds: ['g_sub1'] }],
  completed: [{ ...task, id: 't_2', title: 'Done task', goalIds: ['g_top2'] }],
}

test('coverage counts a subgoal link for its parent goal too', () => {
  const { covered, notCovered } = coverageSplit(data)
  assert.deepEqual(
    covered.map((goal) => goal.id),
    ['g_top1', 'g_sub1', 'g_top2'],
  )
  assert.deepEqual(
    notCovered.map((goal) => goal.id),
    ['g_done'],
  )
})

test('row meta shows the goal titles linked to the task', () => {
  assert.deepEqual(goalNames(data.open[0], data), ['Sub one'])
  // A subtask inherits the goal links of its root task.
  const subtask = { ...data.open[0], id: 't_3', parentId: 't_1', goalIds: [] }
  assert.deepEqual(goalNames(subtask, data), ['Sub one'])
  // A task without goal links shows nothing.
  assert.deepEqual(goalNames({ ...task }, data), [])
})

test('longDay formats the heading date factually', () => {
  assert.equal(longDay('2026-08-29'), 'Saturday, August 29')
})
