import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createDomainStore } from '../../src/domain/store.ts'

const localDay = () => {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

async function useStore(run) {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-reorder-'))
  const store = createDomainStore(join(directory, 'omni-orga.sqlite'))

  try {
    await run(store)
  } finally {
    store.close()
    await rm(directory, { recursive: true, force: true })
  }
}

const planToday = (store, ...tasks) => {
  const day = localDay()
  for (const task of tasks) store.planTask(task.id, day)
  return day
}

test('reorderToday moves an open task within its scheduled day open list', async () => {
  await useStore((store) => {
    const first = store.createTask({ title: 'First' })
    const second = store.createTask({ title: 'Second' })
    const third = store.createTask({ title: 'Third' })
    planToday(store, first, second, third)

    const day = store.reorderToday(second.id, null).open.map((task) => task.id)
    assert.deepEqual(day, [second.id, first.id, third.id])

    const after = store
      .reorderToday(third.id, second.id)
      .open.map((task) => task.id)
    assert.deepEqual(after, [second.id, third.id, first.id])
  })
})

test('reorderToday persists the order and returns the day view', async () => {
  await useStore((store) => {
    const one = store.createTask({ title: 'One' })
    const two = store.createTask({ title: 'Two' })
    const day = planToday(store, one, two)

    const result = store.reorderToday(two.id, null)
    assert.deepEqual(result, store.getToday(day))
    assert.deepEqual(
      store.getToday(day).open.map((task) => task.id),
      [two.id, one.id],
    )
  })
})

test('reorderToday normalizes today_order across the open list', async () => {
  await useStore((store) => {
    const one = store.createTask({ title: 'One' })
    const two = store.createTask({ title: 'Two' })
    planToday(store, one, two)

    store.reorderToday(two.id, one.id)
    const open = store.getToday(localDay()).open
    assert.deepEqual(
      open.map((task) => [task.id, task.todayOrder]),
      [
        [one.id, 0],
        [two.id, 1],
      ],
    )
  })
})

test('reorderToday rejects a task that is not an open scheduled task', async () => {
  await useStore((store) => {
    const unscheduled = store.createTask({ title: 'Unscheduled' })
    assert.throws(() => store.reorderToday(unscheduled.id, null), {
      code: 'VALIDATION_FAILED',
    })

    const completed = store.createTask({ title: 'Completed' })
    planToday(store, completed)
    store.completeTask(completed.id)
    assert.throws(() => store.reorderToday(completed.id, null), {
      code: 'VALIDATION_FAILED',
    })

    const archived = store.createTask({ title: 'Archived' })
    store.archiveTask(archived.id)
    assert.throws(() => store.reorderToday(archived.id, null), {
      code: 'VALIDATION_FAILED',
    })

    assert.throws(() => store.reorderToday('t_missing', null), {
      code: 'TASK_NOT_FOUND',
    })
  })
})

test('reorderToday rejects an anchor that is not open and scheduled the same day', async () => {
  await useStore((store) => {
    const today = localDay()
    const task = store.createTask({ title: 'Task' })
    const anchor = store.createTask({ title: 'Anchor' })
    planToday(store, task, anchor)

    const elsewhere = store.createTask({ title: 'Elsewhere' })
    store.planTask(elsewhere.id, '2027-01-01')
    assert.throws(() => store.reorderToday(task.id, elsewhere.id), {
      code: 'VALIDATION_FAILED',
    })

    const done = store.createTask({ title: 'Done' })
    planToday(store, done)
    store.completeTask(done.id)
    assert.throws(() => store.reorderToday(task.id, done.id), {
      code: 'VALIDATION_FAILED',
    })

    const archived = store.createTask({ title: 'Archived anchor' })
    store.archiveTask(archived.id)
    assert.throws(() => store.reorderToday(task.id, archived.id), {
      code: 'VALIDATION_FAILED',
    })

    assert.throws(() => store.reorderToday(task.id, 't_missing'), {
      code: 'TASK_NOT_FOUND',
    })
    assert.equal(store.getToday(today).open.length, 2)
  })
})

test('undo restores the exact previous open position without a reorder', async () => {
  await useStore((store) => {
    const one = store.createTask({ title: 'One' })
    const two = store.createTask({ title: 'Two' })
    const three = store.createTask({ title: 'Three' })
    planToday(store, one, two, three)

    store.completeTask(two.id)
    store.undoTaskCompletion(two.id)
    assert.deepEqual(
      store.getToday(localDay()).open.map((task) => task.id),
      [one.id, two.id, three.id],
    )
  })
})

test('undo after a reorder lands the reopened task at its old index', async () => {
  await useStore((store) => {
    const a = store.createTask({ title: 'A' })
    const b = store.createTask({ title: 'B' })
    const c = store.createTask({ title: 'C' })
    planToday(store, a, b, c)

    store.completeTask(b.id)
    // Order while B is completed: A=0, C=1.
    store.reorderToday(a.id, c.id)
    assert.deepEqual(
      store.getToday(localDay()).open.map((task) => task.id),
      [c.id, a.id],
    )

    store.undoTaskCompletion(b.id)
    // B was at index 1 before completion; it returns there, not first.
    assert.deepEqual(
      store.getToday(localDay()).open.map((task) => task.id),
      [c.id, b.id, a.id],
    )
  })
})
