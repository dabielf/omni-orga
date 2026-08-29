import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const bin = new URL('../../bin/omni-orga.mjs', import.meta.url).pathname
const localDay = () => {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

const futureDay = (days) => {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset + days * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

async function useCli(run) {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-cli-'))
  const env = {
    ...process.env,
    OMNI_ORGA_DATABASE_PATH: join(directory, 'omni-orga.sqlite'),
  }
  const cli = (...args) => {
    const result = spawnSync(process.execPath, [bin, ...args], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    })
    assert.equal(
      result.error,
      undefined,
      `the command did not run: ${result.error}`,
    )
    let data
    try {
      data = JSON.parse(result.stdout)
    } catch {
      // help output is plain text
    }
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, data }
  }

  try {
    await run(cli)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('a created goal id round-trips through get, update, complete, and delete', async () => {
  await useCli((cli) => {
    const created = cli('goal', 'create', 'Ship it', '--kind', 'one-shot')
    assert.equal(created.status, 0)
    assert.equal(created.stderr, '')
    assert.match(created.data.id, /^g_/)
    assert.equal(created.data.title, 'Ship it')
    assert.equal(created.data.kind, 'one_shot')
    const goalId = created.data.id

    const got = cli('goal', 'get', goalId)
    assert.equal(got.status, 0)
    assert.equal(got.data.id, goalId)
    assert.deepEqual(got.data.progress, {
      kind: 'one_shot',
      completed: 0,
      total: 0,
      percentage: 0,
      text: 'No tasks yet',
    })

    const updated = cli('goal', 'update', goalId, '--title', 'Ship it v2')
    assert.equal(updated.status, 0)
    assert.equal(updated.data.title, 'Ship it v2')

    const listed = cli('goal', 'list')
    assert.deepEqual(
      listed.data.map((goal) => goal.id),
      [goalId],
    )

    const priority = cli('goal', 'priority', goalId, 'on')
    assert.equal(priority.status, 0)
    assert.equal(priority.data.priority, true)
    assert.equal(cli('goal', 'priority', goalId, 'off').data.priority, false)

    const completed = cli('goal', 'complete', goalId)
    assert.equal(completed.status, 0)
    assert.match(completed.data.completedAt, /^\d{4}-\d{2}-\d{2}T/)

    const reopened = cli('goal', 'reopen', goalId)
    assert.equal(reopened.status, 0)
    assert.equal(reopened.data.completedAt, null)

    const archived = cli('goal', 'archive', goalId)
    assert.equal(archived.status, 0)
    assert.match(archived.data.archivedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(cli('goal', 'restore', goalId).data.archivedAt, null)

    const deleted = cli('goal', 'delete', goalId)
    assert.equal(deleted.status, 0)
    assert.deepEqual(deleted.data, {})

    const gone = cli('goal', 'get', goalId)
    assert.equal(gone.status, 1)
    assert.deepEqual(gone.data, {
      error: { code: 'GOAL_NOT_FOUND', message: gone.data.error.message },
    })
  })
})

test('goal update changes kind and guards ongoing completion', async () => {
  await useCli((cli) => {
    const created = cli('goal', 'create', 'Ship it', '--kind', 'one-shot')
    assert.equal(created.status, 0)
    const goalId = created.data.id

    const ongoing = cli('goal', 'update', goalId, '--kind', 'ongoing')
    assert.equal(ongoing.status, 0)
    assert.equal(ongoing.data.kind, 'ongoing')
    const refused = cli('goal', 'complete', goalId)
    assert.equal(refused.status, 1)
    assert.equal(refused.data.error.code, 'VALIDATION_FAILED')

    const back = cli('goal', 'update', goalId, '--kind', 'one-shot')
    assert.equal(back.status, 0)
    assert.equal(back.data.kind, 'one_shot')
    const invalid = cli('goal', 'update', goalId, '--kind', 'recurring')
    assert.equal(invalid.status, 1)
    assert.equal(invalid.data.error.code, 'VALIDATION_FAILED')
  })
})

test('a created task id round-trips through the full task verb set', async () => {
  await useCli((cli) => {
    const goal = cli('goal', 'create', 'Home', '--kind', 'ongoing').data
    const created = cli(
      'task',
      'create',
      'Paint kitchen',
      '--notes',
      'Two coats',
      '--goal',
      goal.id,
    )
    assert.equal(created.status, 0)
    const taskId = created.data.id
    assert.match(taskId, /^t_/)
    assert.equal(created.data.notes, 'Two coats')
    assert.deepEqual(created.data.goalIds, [goal.id])

    const got = cli('task', 'get', taskId)
    assert.equal(got.status, 0)
    assert.equal(got.data.id, taskId)
    assert.equal(got.data.previousCompletion, undefined)

    const updated = cli('task', 'update', taskId, '--title', 'Paint living room')
    assert.equal(updated.data.title, 'Paint living room')

    const ideal = cli('task', 'ideal-date', taskId, '2027-01-05')
    assert.deepEqual(ideal.data, {
      idealCompletionDate: '2027-01-05',
      deadline: null,
    })
    const deadline = cli('task', 'deadline', taskId, 'none')
    assert.deepEqual(deadline.data, {
      idealCompletionDate: null,
      deadline: null,
    })

    const otherGoal = cli('goal', 'create', 'Craft', '--kind', 'ongoing').data
    const relinked = cli('task', 'goals', taskId, '--goal', otherGoal.id)
    assert.deepEqual(relinked.data.goalIds, [otherGoal.id])
    const unlinked = cli('task', 'goals', taskId)
    assert.deepEqual(unlinked.data.goalIds, [])

    const archived = cli('task', 'archive', taskId)
    assert.match(archived.data.archivedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(cli('task', 'restore', taskId).data.archivedAt, null)

    const completed = cli('task', 'complete', taskId)
    assert.equal(completed.status, 0)
    assert.match(completed.data.completedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(completed.data.freshTask, null)

    const undone = cli('task', 'undo', taskId)
    assert.equal(undone.status, 0)
    assert.equal(undone.data.completedAt, null)

    const deleted = cli('task', 'delete', taskId)
    assert.equal(deleted.status, 0)
    assert.deepEqual(deleted.data, {})
    assert.equal(cli('task', 'get', taskId).status, 1)
  })
})

test('repeatable tasks expose their previous completion and history', async () => {
  await useCli((cli) => {
    const created = cli('task', 'create', 'Water plants', '--repeatable')
    const taskId = created.data.id
    assert.equal(created.data.repeatable, true)

    const completed = cli('task', 'complete', taskId)
    assert.equal(completed.status, 0)
    assert.match(completed.data.freshTask.id, /^t_/)
    assert.notEqual(completed.data.freshTask.id, taskId)

    const fresh = completed.data.freshTask
    const got = cli('task', 'get', fresh.id)
    assert.match(got.data.previousCompletion, /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(cli('task', 'get', taskId).data.previousCompletion, null)

    const history = cli('task', 'history', taskId)
    assert.deepEqual(
      history.data.map((entry) => entry.taskId),
      [taskId],
    )

    const undone = cli('task', 'undo', taskId)
    assert.equal(undone.status, 0)
    assert.deepEqual(cli('task', 'history', taskId).data, [])
  })
})

test('subtasks block their parent until they are complete', async () => {
  await useCli((cli) => {
    const parent = cli('task', 'create', 'Parent').data
    const child = cli('task', 'create', 'Child', '--parent', parent.id).data

    const blocked = cli('task', 'list', '--state', 'blocked')
    assert.deepEqual(blocked.data.map((task) => task.id), [parent.id])
    assert.equal(cli('task', 'complete', parent.id).status, 1)

    assert.equal(cli('task', 'complete', child.id).status, 0)
    const available = cli('task', 'list', '--state', 'available')
    assert.deepEqual(available.data.map((task) => task.id), [parent.id])
    assert.equal(cli('task', 'complete', parent.id).status, 0)

    const done = cli('task', 'list', '--state', 'done')
    assert.deepEqual(
      done.data.map((task) => task.id).sort(),
      [child.id, parent.id].sort(),
    )
  })
})

test('goal completion and removal hand linked tasks to the chosen goal', async () => {
  await useCli((cli) => {
    const one = cli('goal', 'create', 'One', '--kind', 'one-shot').data
    const two = cli('goal', 'create', 'Two', '--kind', 'one-shot').data
    const task = cli('task', 'create', 'Linked', '--goal', one.id).data

    const completed = cli('goal', 'complete', one.id, '--task', `${task.id}=link:${two.id}`)
    assert.equal(completed.status, 0)
    assert.match(completed.data.completedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.deepEqual(cli('task', 'get', task.id).data.goalIds, [two.id])

    const removalGoal = cli('goal', 'create', 'Three', '--kind', 'one-shot').data
    const removalTask = cli('task', 'create', 'Doomed', '--goal', removalGoal.id).data
    const removed = cli('goal', 'delete', removalGoal.id, '--task', `${removalTask.id}=archive`)
    assert.equal(removed.status, 0)
    assert.match(cli('task', 'get', removalTask.id).data.archivedAt, /^\d{4}-\d{2}-\d{2}T/)
  })
})

test('the priority limit surfaces as PRIORITY_LIMIT', async () => {
  await useCli((cli) => {
    const goals = ['One', 'Two', 'Three', 'Four'].map((title) =>
      cli('goal', 'create', title, '--kind', 'ongoing').data,
    )
    for (const goal of goals.slice(0, 3)) {
      assert.equal(cli('goal', 'priority', goal.id, 'on').status, 0)
    }
    const limited = cli('goal', 'priority', goals[3].id, 'on')
    assert.equal(limited.status, 1)
    assert.deepEqual(limited.data, {
      error: {
        code: 'PRIORITY_LIMIT',
        message: limited.data.error.message,
      },
    })
  })
})

test('today add, reorder, complete, undo, and remove drive the day plan', async () => {
  await useCli((cli) => {
    const day = localDay()
    const first = cli('task', 'create', 'First').data
    const second = cli('task', 'create', 'Second').data
    const third = cli('task', 'create', 'Third').data
    for (const task of [first, second, third]) {
      assert.equal(cli('today', 'add', task.id).status, 0)
    }

    const listed = cli('today', 'list')
    assert.deepEqual(
      listed.data.open.map((task) => task.id),
      [first.id, second.id, third.id],
    )
    assert.deepEqual(listed.data.completed, [])

    const moved = cli('today', 'reorder', second.id, '--top')
    assert.deepEqual(
      moved.data.open.map((task) => task.id),
      [second.id, first.id, third.id],
    )
    const after = cli('today', 'reorder', third.id, '--after', second.id)
    assert.deepEqual(
      after.data.open.map((task) => task.id),
      [second.id, third.id, first.id],
    )
    const bottom = cli('today', 'reorder', second.id, '--bottom')
    assert.deepEqual(
      bottom.data.open.map((task) => task.id),
      [third.id, first.id, second.id],
    )

    const done = cli('today', 'complete', third.id)
    assert.equal(done.status, 0)
    const dayView = cli('today', 'list')
    assert.deepEqual(
      dayView.data.open.map((task) => task.id),
      [first.id, second.id],
    )
    assert.deepEqual(
      dayView.data.completed.map((task) => task.id),
      [third.id],
    )

    assert.equal(cli('today', 'undo', third.id).status, 0)
    assert.deepEqual(cli('today', 'list').data.completed, [])

    const removed = cli('today', 'remove', first.id)
    assert.equal(removed.data.scheduledDay, null)

    assert.deepEqual(
      cli('today', 'list').data.open.map((task) => task.id),
      [third.id, second.id],
    )

    const explicitDay = cli('today', 'list', '--on', day)
    assert.equal(explicitDay.status, 0)
  })
})

test('calendar move and remove share the domain action with today', async () => {
  await useCli((cli) => {
    const task = cli('task', 'create', 'Someday').data
    const day = futureDay(3)

    const moved = cli('calendar', 'move', task.id, day)
    assert.equal(moved.status, 0)
    assert.equal(moved.data.scheduledDay, day)

    const thatDay = cli('task', 'list', '--on', day)
    assert.deepEqual(thatDay.data.map((entry) => entry.id), [task.id])
    const today = cli('today', 'list')
    assert.deepEqual(today.data.open, [])

    assert.equal(cli('calendar', 'remove', task.id).data.scheduledDay, null)

    const movedToToday = cli('calendar', 'move', task.id, localDay())
    assert.equal(movedToToday.data.scheduledDay, localDay())
    assert.deepEqual(
      cli('today', 'list').data.open.map((entry) => entry.id),
      [task.id],
    )
  })
})

test('failures exit 1 with a coded error object and nothing else', async () => {
  await useCli((cli) => {
    const taskMissing = cli('task', 'get', 't_missing')
    assert.equal(taskMissing.status, 1)
    assert.equal(taskMissing.stderr, '')
    assert.equal(taskMissing.parseError, undefined)
    assert.deepEqual(Object.keys(taskMissing.data), ['error'])
    assert.deepEqual(Object.keys(taskMissing.data.error), ['code', 'message'])
    assert.equal(taskMissing.data.error.code, 'TASK_NOT_FOUND')
    assert.doesNotMatch(taskMissing.stdout, /\n\s+at /)

    const goalMissing = cli('goal', 'get', 'g_missing')
    assert.equal(goalMissing.status, 1)
    assert.equal(goalMissing.data.error.code, 'GOAL_NOT_FOUND')

    const task = cli('task', 'create', 'Existing').data
    const badDate = cli('calendar', 'move', task.id, '2026-13-40')
    assert.equal(badDate.status, 1)
    assert.equal(badDate.data.error.code, 'VALIDATION_FAILED')

    const unknownFlag = cli('task', 'list', '--bogus')
    assert.equal(unknownFlag.status, 1)
    assert.equal(unknownFlag.data.error.code, 'VALIDATION_FAILED')

    const unknownCommand = cli('frobnicate')
    assert.equal(unknownCommand.status, 1)
    assert.equal(unknownCommand.data.error.code, 'VALIDATION_FAILED')

    const unknownVerb = cli('task', 'frobnicate')
    assert.equal(unknownVerb.status, 1)
    assert.equal(unknownVerb.data.error.code, 'VALIDATION_FAILED')
  })
})

test('a task created without a goal can be found, filtered by query, and limited', async () => {
  await useCli((cli) => {
    cli('task', 'create', 'Buy paint', '--notes', 'for the kitchen wall')
    cli('task', 'create', 'Call mom')
    const fence = cli('task', 'create', 'Errands', '--notes', 'paint the fence').data

    const byTitle = cli('task', 'list', '--query', 'PAINT')
    assert.deepEqual(
      byTitle.data.map((task) => task.id).sort(),
      [fence.id, cli('task', 'list', '--query', 'Buy paint').data[0].id].sort(),
    )

    const byNotes = cli('task', 'list', '--query', 'kitchen wall')
    assert.equal(byNotes.data.length, 1)
    assert.equal(byNotes.data[0].title, 'Buy paint')

    cli('task', 'update', fence.id, '--notes', 'mow the lawn')
    const staleNotes = cli('task', 'list', '--query', 'paint the fence')
    assert.deepEqual(staleNotes.data, [])

    const limited = cli('task', 'list', '--limit', '1')
    assert.equal(limited.data.length, 1)
  })
})

test('goal list filters by state and query over titles', async () => {
  await useCli((cli) => {
    const home = cli('goal', 'create', 'Home', '--kind', 'ongoing').data
    cli('goal', 'create', 'Hobby', '--kind', 'ongoing')
    const archiveMe = cli('goal', 'create', 'Old plan', '--kind', 'one-shot').data

    const active = cli('goal', 'list', '--state', 'active')
    assert.equal(active.data.length, 3)

    cli('goal', 'archive', archiveMe.id)

    const activeAfter = cli('goal', 'list', '--state', 'active')
    assert.deepEqual(
      activeAfter.data.map((goal) => goal.id).sort(),
      [home.id, cli('goal', 'list', '--query', 'Hobby').data[0].id].sort(),
    )

    const archived = cli('goal', 'list', '--state', 'archived')
    assert.deepEqual(archived.data.map((goal) => goal.id), [archiveMe.id])

    const queried = cli('goal', 'list', '--query', 'ho')
    assert.deepEqual(
      queried.data.map((goal) => goal.title).sort(),
      ['Hobby', 'Home'],
    )
  })
})

test('task list filters by goal, day, and caps with limit after other filters', async () => {
  await useCli((cli) => {
    const goalA = cli('goal', 'create', 'A', '--kind', 'ongoing').data
    const goalB = cli('goal', 'create', 'B', '--kind', 'ongoing').data
    const linked = cli('task', 'create', 'Linked', '--goal', goalA.id).data
    cli('task', 'create', 'Unlinked', '--goal', goalB.id)

    const byGoal = cli('task', 'list', '--goal', goalA.id)
    assert.deepEqual(byGoal.data.map((task) => task.id), [linked.id])

    const day = futureDay(2)
    const later = futureDay(5)
    cli('calendar', 'move', linked.id, day)
    const also = cli('task', 'create', 'Also that day', '--deadline', day).data
    cli('calendar', 'move', also.id, day)
    cli('task', 'create', 'Later', '--ideal-date', later)

    const onDay = cli('task', 'list', '--on', day)
    assert.equal(onDay.data.length, 2)

    const both = cli('task', 'list', '--on', day, '--goal', goalA.id)
    assert.deepEqual(both.data.map((task) => task.id), [linked.id])

    const limited = cli('task', 'list', '--on', day, '--limit', '1')
    assert.equal(limited.data.length, 1)
  })
})

test('no command reads stdin', async () => {
  await useCli((cli, env) => {
    const result = spawnSync(process.execPath, [bin, 'task', 'create', 'No stdin'], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout).title, 'No stdin')
  })
})

test('--pretty is accepted everywhere and only changes formatting', async () => {
  await useCli((cli) => {
    const goal = cli('goal', 'create', 'Pretty', '--kind', 'ongoing').data
    const task = cli('task', 'create', 'Tidy', '--goal', goal.id).data
    cli('today', 'add', task.id)

    const commands = [
      ['goal', 'get', goal.id],
      ['goal', 'list'],
      ['task', 'get', task.id],
      ['task', 'list'],
      ['task', 'history', task.id],
      ['today', 'list'],
      ['today', 'reorder', task.id, '--top'],
    ]
    for (const command of commands) {
      const compact = cli(...command)
      const pretty = cli(...command, '--pretty')
      assert.deepEqual(pretty.data, compact.data, command.join(' '))
      if (JSON.stringify(pretty.data).length > 3) {
        assert.notEqual(pretty.stdout, compact.stdout, `${command.join(' ')} ignores --pretty`)
        assert.match(pretty.stdout, /\n\s+"/, `${command.join(' ')} stays compact`)
        assert.doesNotMatch(compact.stdout, /\n\s+"/)
      }
    }

    const failing = cli('task', 'get', 't_missing', '--pretty')
    assert.equal(failing.status, 1)
    assert.deepEqual(failing.data, {
      error: { code: 'TASK_NOT_FOUND', message: failing.data.error.message },
    })
    assert.match(failing.stdout, /\n\s+"/)
  })
})

test('help is plain text at the top level and per resource', async () => {
  await useCli((cli) => {
    const top = cli('--help')
    assert.equal(top.status, 0)
    assert.match(top.stdout, /Usage: omni-orga/)
    for (const resource of ['goal', 'task', 'today', 'calendar']) {
      const help = cli(resource, '--help')
      assert.equal(help.status, 0, resource)
      assert.match(help.stdout, new RegExp(`omni-orga ${resource}`))
    }
  })
})
