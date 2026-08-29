import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createDomainStore } from '../../src/domain/store.ts'

async function useStore(run) {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-goal-order-'))
  const store = createDomainStore(join(directory, 'omni-orga.sqlite'))

  try {
    await run(store)
  } finally {
    store.close()
    await rm(directory, { recursive: true, force: true })
  }
}

test('reorderGoals moves a top-level goal to the top and persists the order', async () => {
  await useStore((store) => {
    const one = store.createGoal({ title: 'One', kind: 'one_shot' })
    const two = store.createGoal({ title: 'Two', kind: 'one_shot' })
    const three = store.createGoal({ title: 'Three', kind: 'one_shot' })

    const updated = store.reorderGoals(three.id, null)

    assert.deepEqual(updated.map((goal) => goal.id), [three.id, one.id, two.id])
    assert.deepEqual(
      store.listGoals({ parentId: null }).map((goal) => goal.id),
      [three.id, one.id, two.id],
    )
    assert.equal(store.getGoal(three.id).sortOrder, 0)
  })
})

test('reorderGoals places a goal after an anchor in the same level', async () => {
  await useStore((store) => {
    const parent = store.createGoal({ title: 'Home', kind: 'ongoing' })
    const first = store.createGoal({
      title: 'Kitchen',
      kind: 'one_shot',
      parentId: parent.id,
    })
    const second = store.createGoal({
      title: 'Study',
      kind: 'one_shot',
      parentId: parent.id,
    })
    const third = store.createGoal({
      title: 'Budget',
      kind: 'one_shot',
      parentId: parent.id,
    })

    const updated = store.reorderGoals(first.id, third.id)
    assert.deepEqual(
      updated.map((goal) => goal.id),
      [second.id, third.id, first.id],
    )
    assert.deepEqual(
      store.listGoals({ parentId: parent.id }).map((goal) => goal.id),
      [second.id, third.id, first.id],
    )
    assert.equal(store.getGoal(first.id).parentId, parent.id)
  })
})

test('reorderGoals normalizes the order across the active goals of the level', async () => {
  await useStore((store) => {
    const one = store.createGoal({ title: 'One', kind: 'one_shot' })
    const two = store.createGoal({ title: 'Two', kind: 'one_shot' })
    const three = store.createGoal({ title: 'Three', kind: 'one_shot' })
    store.reorderGoals(one.id, null)

    assert.deepEqual(
      store.listGoals({ parentId: null }).map((goal) => goal.sortOrder),
      [0, 1, 2],
    )
  })
})

test('reorderGoals rejects goals that are not active', async () => {
  await useStore((store) => {
    const one = store.createGoal({ title: 'One', kind: 'one_shot' })
    const two = store.createGoal({ title: 'Two', kind: 'one_shot' })

    const completed = store.createGoal({ title: 'Done', kind: 'one_shot' })
    store.completeGoal(completed.id)
    assert.throws(() => store.reorderGoals(completed.id, null), {
      code: 'VALIDATION_FAILED',
    })

    const archived = store.createGoal({ title: 'Archived', kind: 'one_shot' })
    store.archiveGoal(archived.id)
    assert.throws(() => store.reorderGoals(archived.id, null), {
      code: 'VALIDATION_FAILED',
    })

    store.archiveGoal(two.id)
    assert.throws(() => store.reorderGoals(one.id, two.id), {
      code: 'VALIDATION_FAILED',
    })

    assert.throws(() => store.reorderGoals('g_missing', null), {
      code: 'GOAL_NOT_FOUND',
    })
  })
})

test('reorderGoals rejects an anchor from another level and self anchors', async () => {
  await useStore((store) => {
    const top = store.createGoal({ title: 'Top', kind: 'ongoing' })
    const sub = store.createGoal({
      title: 'Sub',
      kind: 'one_shot',
      parentId: top.id,
    })
    const otherTop = store.createGoal({ title: 'Other top', kind: 'ongoing' })

    assert.throws(() => store.reorderGoals(sub.id, otherTop.id), {
      code: 'VALIDATION_FAILED',
    })
    assert.throws(() => store.reorderGoals(top.id, sub.id), {
      code: 'VALIDATION_FAILED',
    })
    assert.throws(() => store.reorderGoals(top.id, top.id), {
      code: 'VALIDATION_FAILED',
    })

    assert.deepEqual(
      store.listGoals({ parentId: null }).map((goal) => goal.id),
      [top.id, otherTop.id],
    )
  })
})

test('moveGoal re-parents between the top level and top-level goals', async () => {
  await useStore((store) => {
    const parent = store.createGoal({ title: 'Home', kind: 'ongoing' })
    const other = store.createGoal({ title: 'Work', kind: 'one_shot' })
    const sub = store.createGoal({
      title: 'Kitchen',
      kind: 'one_shot',
      parentId: parent.id,
    })

    store.moveGoal(sub.id, other.id)
    assert.equal(store.getGoal(sub.id).parentId, other.id)

    store.moveGoal(sub.id, null)
    assert.equal(store.getGoal(sub.id).parentId, null)

    store.moveGoal(sub.id, parent.id)
    assert.equal(store.getGoal(sub.id).parentId, parent.id)
  })
})

test('moveGoal keeps the two-level tree and kind rules', async () => {
  await useStore((store) => {
    const parent = store.createGoal({ title: 'Home', kind: 'ongoing' })
    const withChild = store.createGoal({ title: 'Busy', kind: 'ongoing' })
    store.createGoal({
      title: 'Inner',
      kind: 'one_shot',
      parentId: withChild.id,
    })
    const ongoingSub = store.createGoal({
      title: 'Steady',
      kind: 'ongoing',
      parentId: parent.id,
    })
    const oneShot = store.createGoal({ title: 'Ship', kind: 'one_shot' })

    assert.throws(() => store.moveGoal(withChild.id, oneShot.id), {
      code: 'VALIDATION_FAILED',
    })
    assert.throws(() => store.moveGoal(ongoingSub.id, oneShot.id), {
      code: 'VALIDATION_FAILED',
    })
    assert.throws(() => store.moveGoal(oneShot.id, 'g_missing'), {
      code: 'GOAL_NOT_FOUND',
    })
  })
})

test('moveGoal rejects inactive goals and inactive targets', async () => {
  await useStore((store) => {
    const parent = store.createGoal({ title: 'Home', kind: 'ongoing' })
    const sub = store.createGoal({
      title: 'Kitchen',
      kind: 'one_shot',
      parentId: parent.id,
    })

    const archived = store.createGoal({ title: 'Old', kind: 'ongoing' })
    store.archiveGoal(archived.id)
    assert.throws(() => store.moveGoal(archived.id, null), {
      code: 'VALIDATION_FAILED',
    })
    assert.throws(() => store.moveGoal(sub.id, archived.id), {
      code: 'VALIDATION_FAILED',
    })

    const completed = store.createGoal({ title: 'Done', kind: 'one_shot' })
    store.completeGoal(completed.id)
    assert.throws(() => store.moveGoal(completed.id, null), {
      code: 'VALIDATION_FAILED',
    })
  })
})
