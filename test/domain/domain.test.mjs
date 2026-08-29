import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createDomainStore } from '../../src/domain/store.ts'

async function useStore(run) {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-domain-'))
  const store = createDomainStore(join(directory, 'omni-orga.sqlite'))

  try {
    await run(store)
  } finally {
    store.close()
    await rm(directory, { recursive: true, force: true })
  }
}

test('a task becomes completable only after its unfinished subtasks are complete', async () => {
  await useStore((store) => {
    const parent = store.createTask({ title: 'Parent' })
    const child = store.createTask({ title: 'Child', parentId: parent.id })

    assert.throws(
      () => store.completeTask(parent.id, '2026-08-29T08:00:00.000Z'),
      { code: 'TASK_BLOCKED' },
    )

    store.completeTask(child.id, '2026-08-29T08:01:00.000Z')
    assert.equal(
      store.completeTask(parent.id, '2026-08-29T08:02:00.000Z').completedAt,
      '2026-08-29T08:02:00.000Z',
    )
  })
})

test('goal progress includes linked task trees and rolls subgoals into their parent', async () => {
  await useStore((store) => {
    const goal = store.createGoal({ title: 'Home', kind: 'one_shot' })
    const subgoal = store.createGoal({
      title: 'Kitchen',
      kind: 'one_shot',
      parentId: goal.id,
    })
    const task = store.createTask({
      title: 'Paint',
      goalIds: [subgoal.id],
    })
    const subtask = store.createTask({ title: 'Buy paint', parentId: task.id })

    store.completeTask(subtask.id, '2026-08-29T08:00:00.000Z')

    assert.deepEqual(store.getGoalProgress(subgoal.id), {
      kind: 'one_shot',
      completed: 1,
      total: 2,
      percentage: 50,
      text: '1 of 2 · 50%',
    })
    assert.deepEqual(store.getGoalProgress(goal.id), {
      kind: 'one_shot',
      completed: 1,
      total: 2,
      percentage: 50,
      text: '1 of 2 · 50%',
    })
  })
})

test('only three active goals can be priority and inactive goals free their slots', async () => {
  await useStore((store) => {
    const goals = ['One', 'Two', 'Three', 'Four', 'Five'].map((title) =>
      store.createGoal({ title, kind: 'one_shot' }),
    )
    for (const goal of goals.slice(0, 3)) store.setGoalPriority(goal.id, true)

    assert.throws(() => store.setGoalPriority(goals[3].id, true), {
      code: 'PRIORITY_LIMIT',
    })

    store.completeGoal(goals[0].id, {
      completedAt: '2026-08-29T08:00:00.000Z',
    })
    assert.equal(store.setGoalPriority(goals[3].id, true).priority, true)

    store.archiveGoal(goals[1].id, '2026-08-29T08:01:00.000Z')
    assert.equal(store.setGoalPriority(goals[4].id, true).priority, true)
  })
})

test('repeatable completions raise one-shot progress while the fresh copy keeps it below 100%', async () => {
  await useStore((store) => {
    const goal = store.createGoal({ title: 'Keep home tidy', kind: 'one_shot' })
    const once = store.createTask({ title: 'Buy supplies', goalIds: [goal.id] })
    const repeatable = store.createTask({
      title: 'Clean floor',
      repeatable: true,
      goalIds: [goal.id],
    })
    store.completeTask(once.id, '2026-08-29T08:00:00.000Z')

    assert.equal(store.getGoalProgress(goal.id).text, '1 of 2 · 50%')

    const first = store.completeTask(
      repeatable.id,
      '2026-08-29T09:00:00.000Z',
    )
    assert.equal(first.freshTask.historyId, repeatable.historyId)
    assert.equal(store.getGoalProgress(goal.id).text, '2 of 3 · 66%')

    store.completeTask(first.freshTask.id, '2026-08-30T09:00:00.000Z')
    assert.equal(store.getGoalProgress(goal.id).text, '3 of 4 · 75%')
    assert.ok(store.getGoalProgress(goal.id).percentage < 100)
  })
})

test('repeatable completion resets the fresh tree, keeps history, and can be undone', async () => {
  await useStore((store) => {
    const repeatable = store.createTask({
      title: 'Weekly reset',
      repeatable: true,
      idealCompletionDate: '2026-08-30',
      scheduledDay: '2026-08-29',
      externalLinks: ['https://example.test/reset'],
    })
    const child = store.createTask({
      title: 'Clear desk',
      parentId: repeatable.id,
      deadline: '2026-08-29',
      scheduledDay: '2026-08-29',
    })
    const archivedChild = store.createTask({
      title: 'Optional dusting',
      parentId: repeatable.id,
    })
    store.archiveTask(archivedChild.id)
    store.completeTask(child.id, '2026-08-29T08:00:00.000Z')

    const completion = store.completeTask(
      repeatable.id,
      '2026-08-29T09:00:00.000Z',
    )
    const fresh = completion.freshTask
    const [freshChild] = store.listTasks({ parentId: fresh.id })

    assert.equal(fresh.historyId, repeatable.historyId)
    assert.equal(fresh.completedAt, null)
    assert.equal(fresh.idealCompletionDate, null)
    assert.equal(fresh.deadline, null)
    assert.equal(fresh.scheduledDay, null)
    assert.deepEqual(fresh.externalLinks, ['https://example.test/reset'])
    assert.equal(freshChild.completedAt, null)
    assert.equal(freshChild.deadline, null)
    assert.equal(freshChild.scheduledDay, null)
    assert.equal(
      store.getPreviousCompletion(fresh.id),
      '2026-08-29T09:00:00.000Z',
    )
    const freshArchived = store
      .listTasks({ parentId: fresh.id, includeArchived: true })
      .find((row) => row.title === 'Optional dusting')
    assert.ok(freshArchived.archivedAt)
    assert.equal(fresh.blocked, true)

    assert.equal(store.undoTaskCompletion(repeatable.id).completedAt, null)
    assert.throws(() => store.getTask(fresh.id), { code: 'TASK_NOT_FOUND' })
  })
})

test('ideal completion date and deadline replace each other', async () => {
  await useStore((store) => {
    const task = store.createTask({
      title: 'Write report',
      idealCompletionDate: '2026-09-01',
    })

    assert.deepEqual(store.setTaskDeadline(task.id, '2026-09-02'), {
      idealCompletionDate: null,
      deadline: '2026-09-02',
    })
    assert.deepEqual(
      store.setTaskIdealCompletionDate(task.id, '2026-09-03'),
      {
        idealCompletionDate: '2026-09-03',
        deadline: null,
      },
    )
  })
})

test('blocked future plans clear quietly on arrival but not before', async () => {
  await useStore((store) => {
    const parent = store.createTask({ title: 'Parent' })
    store.createTask({ title: 'Child', parentId: parent.id })

    store.planTask(parent.id, '2026-08-30', '2026-08-29')
    store.getToday('2026-08-29')
    assert.equal(store.getTask(parent.id).scheduledDay, '2026-08-30')

    assert.deepEqual(store.getToday('2026-08-30'), {
      open: [],
      completed: [],
    })
    assert.equal(store.getTask(parent.id).scheduledDay, null)
    assert.equal(store.getTask(parent.id).blocked, true)
    assert.throws(
      () => store.planTask(parent.id, '2026-08-30', '2026-08-30'),
      { code: 'TASK_BLOCKED' },
    )
  })
})

test('archive and restore keep history while deleting a goal leaves tasks active', async () => {
  await useStore((store) => {
    const goal = store.createGoal({ title: 'Home', kind: 'one_shot' })
    const task = store.createTask({ title: 'Paint', goalIds: [goal.id] })
    const child = store.createTask({ title: 'Prepare', parentId: task.id })
    store.completeTask(child.id, '2026-08-29T08:00:00.000Z')

    store.archiveTask(task.id, '2026-08-29T09:00:00.000Z')
    assert.ok(store.getTask(task.id).archivedAt)
    assert.equal(store.getTask(child.id).completedAt, '2026-08-29T08:00:00.000Z')
    store.restoreTask(task.id)
    assert.equal(store.getTask(task.id).archivedAt, null)
    assert.equal(store.getTask(child.id).completedAt, '2026-08-29T08:00:00.000Z')

    store.archiveGoal(goal.id, '2026-08-29T10:00:00.000Z')
    assert.deepEqual(store.getTask(task.id).goalIds, [])
    store.restoreGoal(goal.id)
    assert.deepEqual(store.getTask(task.id).goalIds, [goal.id])

    store.deleteGoal(goal.id)
    assert.equal(store.getTask(task.id).archivedAt, null)
    assert.equal(store.getTask(task.id).title, 'Paint')
    assert.deepEqual(store.getTask(task.id).goalIds, [])
  })
})

test('repeatable history is countable over a period and survives rename', async () => {
  await useStore((store) => {
    const repeatable = store.createTask({
      title: 'Weekly reset',
      repeatable: true,
    })
    store.completeTask(repeatable.id, '2026-08-01T09:00:00.000Z')
    const [copy] = store.listTasks({ parentId: null })
    const renamed = store.updateTask(copy.id, { title: 'Weekly reset, renamed' })
    store.completeTask(renamed.id, '2026-08-20T09:00:00.000Z')

    assert.deepEqual(store.listTaskHistory(repeatable.id), [
      {
        taskId: repeatable.id,
        title: 'Weekly reset',
        completedAt: '2026-08-01T09:00:00.000Z',
      },
      {
        taskId: copy.id,
        title: 'Weekly reset, renamed',
        completedAt: '2026-08-20T09:00:00.000Z',
      },
    ])
    assert.deepEqual(
      store.listTaskHistory(repeatable.id, { from: '2026-08-15' }),
      [
        {
          taskId: copy.id,
          title: 'Weekly reset, renamed',
          completedAt: '2026-08-20T09:00:00.000Z',
        },
      ],
    )
    assert.equal(
      store.listTaskHistory(repeatable.id, { to: '2026-08-15' }).length,
      1,
    )
  })
})

test('dates obey exclusivity and deadline constraints', async () => {
  await useStore((store) => {
    assert.throws(
      () =>
        store.createTask({
          title: 'Both dates',
          idealCompletionDate: '2126-01-01',
          deadline: '2126-01-02',
        }),
      { code: 'VALIDATION_FAILED' },
    )

    const parent = store.createTask({
      title: 'Report',
      deadline: '2026-09-10',
    })
    const child = store.createTask({ title: 'Draft', parentId: parent.id })
    assert.throws(
      () => store.setTaskIdealCompletionDate(child.id, '2026-09-11'),
      { code: 'VALIDATION_FAILED' },
    )
    assert.equal(
      store.setTaskIdealCompletionDate(child.id, '2026-09-09')
        .idealCompletionDate,
      '2026-09-09',
    )
    assert.throws(
      () => store.setTaskDeadline(parent.id, '2026-09-05'),
      { code: 'VALIDATION_FAILED' },
    )

    assert.throws(
      () => store.planTask(parent.id, '2026-09-12', '2026-08-29'),
      { code: 'VALIDATION_FAILED' },
    )

    const overdue = store.createTask({
      title: 'Overdue chore',
      deadline: '2026-08-20',
    })
    assert.equal(
      store.planTask(overdue.id, '2026-08-30', '2026-08-29').scheduledDay,
      '2026-08-30',
    )

    assert.throws(
      () =>
        store.createTask({
          title: 'Planned past deadline',
          deadline: '2126-01-01',
          scheduledDay: '2126-02-01',
        }),
      { code: 'VALIDATION_FAILED' },
    )
  })
})

test('today clears a blocked schedule and supports undo and unschedule', async () => {
  await useStore((store) => {
    const parent = store.createTask({ title: 'Parent' })
    store.planTask(parent.id, '2026-08-29', '2026-08-29')
    store.createTask({ title: 'Child', parentId: parent.id })
    assert.deepEqual(store.getToday('2026-08-29').open, [])
    assert.equal(store.getTask(parent.id).scheduledDay, null)
    assert.equal(store.getTask(parent.id).blocked, true)
    assert.deepEqual(
      store.listTasks({ availability: 'blocked' }).map((row) => row.id),
      [parent.id],
    )
    const goal = store.createGoal({ title: 'Admin', kind: 'one_shot' })
    const planned = store.createTask({ title: 'Errand' })
    store.planTask(planned.id, '2026-08-29', '2026-08-29')
    store.archiveTask(planned.id)
    assert.deepEqual(store.getToday('2026-08-29').open, [])

    const task = store.createTask({
      title: 'File taxes',
      goalIds: [goal.id],
      idealCompletionDate: '2026-09-01',
    })
    const subtask = store.createTask({
      title: 'Collect receipts',
      parentId: task.id,
    })
    store.completeTask(subtask.id, '2026-08-29T08:00:00.000Z')
    store.planTask(task.id, '2026-08-29', '2026-08-29')
    store.completeTask(task.id, '2026-08-29T09:00:00.000Z')

    const reopened = store.undoTaskCompletion(task.id)
    assert.equal(reopened.completedAt, null)
    assert.deepEqual(reopened.goalIds, [goal.id])
    assert.equal(reopened.idealCompletionDate, '2026-09-01')
    assert.equal(reopened.scheduledDay, '2026-08-29')
    assert.equal(store.getTask(subtask.id).completedAt, '2026-08-29T08:00:00.000Z')
    assert.equal(store.unplanTask(task.id).scheduledDay, null)

    const scheduled = store.createTask({ title: 'Deadline move' })
    store.planTask(scheduled.id, '2126-01-01', '2026-08-29')
    assert.throws(
      () => store.setTaskDeadline(scheduled.id, '2125-12-31'),
      { code: 'VALIDATION_FAILED' },
    )
    assert.equal(store.getTask(scheduled.id).scheduledDay, '2126-01-01')
  })
})

test('goal removal dispositions round-trip through archive, completion, and delete', async () => {
  await useStore((store) => {
    const goal = store.createGoal({ title: 'Home', kind: 'one_shot' })
    const other = store.createGoal({ title: 'Work', kind: 'ongoing' })
    const linked = store.createTask({ title: 'Paint', goalIds: [goal.id] })
    const archived = store.createTask({ title: 'Clean', goalIds: [goal.id] })

    store.archiveGoal(goal.id, '2026-08-29T10:00:00.000Z', {
      linkedTasks: {
        [linked.id]: { action: 'link', goalId: other.id },
        [archived.id]: { action: 'archive' },
      },
    })
    assert.deepEqual(store.getTask(linked.id).goalIds, [other.id])
    assert.ok(store.getTask(archived.id).archivedAt)

    store.restoreGoal(goal.id)
    assert.deepEqual(store.getTask(linked.id).goalIds, [goal.id])
    assert.equal(store.getTask(archived.id).archivedAt, null)
    assert.deepEqual(store.getTask(archived.id).goalIds, [goal.id])

    store.completeGoal(goal.id, {
      completedAt: '2026-08-29T11:00:00.000Z',
      linkedTasks: {
        [linked.id]: { action: 'link', goalId: other.id },
        [archived.id]: { action: 'archive' },
      },
    })
    assert.ok(store.getGoal(goal.id).completedAt)
    assert.deepEqual(store.getTask(linked.id).goalIds, [other.id])
    assert.ok(store.getTask(archived.id).archivedAt)

    store.reopenGoal(goal.id)
    assert.equal(store.getGoal(goal.id).completedAt, null)
    assert.deepEqual(store.getTask(linked.id).goalIds, [goal.id])
    assert.equal(store.getTask(archived.id).archivedAt, null)
    assert.deepEqual(store.getTask(archived.id).goalIds, [goal.id])

    store.archiveGoal(goal.id, '2026-08-29T12:00:00.000Z')
    assert.deepEqual(store.getTask(linked.id).goalIds, [])
    store.deleteGoal(goal.id, {
      linkedTasks: {
        [archived.id]: { action: 'archive' },
      },
    })
    assert.throws(() => store.getGoal(goal.id), { code: 'GOAL_NOT_FOUND' })
    assert.equal(store.getTask(linked.id).archivedAt, null)
    assert.equal(store.getTask(archived.id).archivedAt, null)
    assert.deepEqual(store.getTask(linked.id).goalIds, [])
  })
})

test('delete removes the whole task tree and the whole repeatable history', async () => {
  await useStore((store) => {
    const parent = store.createTask({ title: 'Parent' })
    const child = store.createTask({ title: 'Child', parentId: parent.id })
    store.deleteTask(parent.id)
    assert.throws(() => store.getTask(parent.id), { code: 'TASK_NOT_FOUND' })
    assert.throws(() => store.getTask(child.id), { code: 'TASK_NOT_FOUND' })

    const repeatable = store.createTask({
      title: 'Weekly reset',
      repeatable: true,
    })
    store.completeTask(repeatable.id, '2026-08-01T09:00:00.000Z')
    const [copy] = store.listTasks({ parentId: null })
    store.completeTask(copy.id, '2026-08-20T09:00:00.000Z')
    store.deleteTask(repeatable.id)
    assert.throws(() => store.getTask(repeatable.id), { code: 'TASK_NOT_FOUND' })
    assert.throws(() => store.getTask(copy.id), { code: 'TASK_NOT_FOUND' })
  })
})

test('goals and tasks expose the CRUD and filter surface', async () => {
  await useStore((store) => {
    const priority = store.createGoal({ title: 'One', kind: 'one_shot' })
    const ongoing = store.createGoal({ title: 'Two', kind: 'ongoing' })
    store.setGoalPriority(priority.id, true)
    const archived = store.createGoal({ title: 'Three', kind: 'one_shot' })
    store.archiveGoal(archived.id)

    assert.deepEqual(
      store.listGoals().map((goal) => goal.id),
      [priority.id, ongoing.id],
    )
    assert.deepEqual(
      store.listGoals({ priority: true }).map((goal) => goal.id),
      [priority.id],
    )
    assert.deepEqual(
      store.listGoals({ kind: 'ongoing' }).map((goal) => goal.id),
      [ongoing.id],
    )
    assert.equal(store.listGoals({ includeArchived: true }).length, 3)

    assert.equal(
      store.updateGoal(ongoing.id, { title: 'Two renamed' }).title,
      'Two renamed',
    )
    store.createGoal({ title: 'Sub', kind: 'ongoing', parentId: ongoing.id })
    assert.throws(
      () => store.updateGoal(ongoing.id, { kind: 'one_shot' }),
      { code: 'VALIDATION_FAILED' },
    )

    const taskCount = store.listTasks({ includeArchived: true }).length
    assert.throws(() =>
      store.createTask({ title: 'Broken', externalLinks: ['   '] }),
    )
    assert.equal(store.listTasks({ includeArchived: true }).length, taskCount)
    assert.equal(
      store.updateGoal(priority.id, { kind: 'ongoing' }).kind,
      'ongoing',
    )

    const goal = store.createGoal({ title: 'Home', kind: 'one_shot' })
    const other = store.createGoal({ title: 'Work', kind: 'ongoing' })
    const task = store.createTask({ title: 'Paint', goalIds: [goal.id] })
    store.createTask({ title: 'Prepare', parentId: task.id })

    const updated = store.updateTask(task.id, {
      title: 'Paint renamed',
      notes: 'Use blue',
      externalLinks: ['https://example.test/paint'],
    })
    assert.equal(updated.title, 'Paint renamed')
    assert.equal(updated.notes, 'Use blue')
    assert.deepEqual(updated.externalLinks, ['https://example.test/paint'])

    const relinked = store.setTaskGoalLinks(task.id, [other.id])
    assert.deepEqual(relinked.goalIds, [other.id])
    const [subtask] = store.listTasks({ parentId: task.id })
    assert.throws(
      () => store.setTaskGoalLinks(subtask.id, [goal.id]),
      { code: 'VALIDATION_FAILED' },
    )

    assert.deepEqual(
      store.listTasks({ goalId: goal.id }).map((row) => row.id),
      [],
    )
    store.setTaskGoalLinks(task.id, [goal.id])
    assert.deepEqual(
      store.listTasks({ goalId: goal.id }).map((row) => row.id),
      [task.id, subtask.id],
    )

    assert.deepEqual(
      store.listTasks({ availability: 'blocked' }).map((row) => row.id),
      [task.id],
    )
    assert.ok(
      store
        .listTasks({ availability: 'available' })
        .every((row) => row.id !== task.id),
    )
    store.completeTask(subtask.id, '2026-08-29T08:00:00.000Z')
    assert.deepEqual(
      store.listTasks({ availability: 'available' }).map((row) => row.id),
      [task.id],
    )
    assert.deepEqual(store.listTasks({ availability: 'blocked' }), [])

    store.archiveTask(subtask.id)
    assert.ok(
      store
        .listTasks({ parentId: task.id })
        .every((row) => row.id !== subtask.id),
    )
    assert.equal(
      store.listTasks({ parentId: task.id, includeArchived: true }).length,
      1,
    )

    store.completeTask(task.id, '2026-08-29T09:00:00.000Z')
    assert.throws(
      () => store.createTask({ title: 'Late', parentId: task.id }),
      { code: 'VALIDATION_FAILED' },
    )
    assert.throws(
      () => store.unplanTask(task.id),
      { code: 'VALIDATION_FAILED' },
    )

    const subgoal = store.createGoal({
      title: 'Kitchen',
      kind: 'one_shot',
      parentId: goal.id,
    })
    assert.throws(
      () => store.completeGoal(goal.id),
      { code: 'VALIDATION_FAILED' },
    )
    assert.throws(
      () => store.completeGoal(ongoing.id),
      { code: 'VALIDATION_FAILED' },
    )

    store.createTask({ title: 'Dishes', goalIds: [other.id] })
    store.createTask({ title: 'Wipe', goalIds: [subgoal.id] })
    const [dishes] = store.listTasks({ goalId: other.id })
    store.completeTask(dishes.id, '2026-08-29T10:00:00.000Z')
    assert.deepEqual(store.getGoalProgress(other.id), {
      kind: 'ongoing',
      completed: 1,
      text: '1 done',
    })
  })
})

test('progress counts a task once across multiple link paths', async () => {
  await useStore((store) => {
    const goal = store.createGoal({ title: 'Home', kind: 'one_shot' })
    const subgoal = store.createGoal({
      title: 'Kitchen',
      kind: 'one_shot',
      parentId: goal.id,
    })
    const task = store.createTask({
      title: 'Paint',
      goalIds: [goal.id, subgoal.id],
    })
    store.createTask({ title: 'Buy paint', parentId: task.id })

    assert.deepEqual(store.getGoalProgress(goal.id), {
      kind: 'one_shot',
      completed: 0,
      total: 2,
      percentage: 0,
      text: '0 of 2 · 0%',
    })
    assert.deepEqual(store.getGoalProgress(subgoal.id).total, 2)

    const [subtask] = store.listTasks({ parentId: task.id })
    store.completeTask(subtask.id, '2026-08-29T08:00:00.000Z')
    assert.equal(store.getGoalProgress(goal.id).text, '1 of 2 · 50%')
  })
})
