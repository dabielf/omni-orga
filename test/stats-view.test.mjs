import assert from 'node:assert/strict'
import test from 'node:test'

import {
  repeatableRowText,
  statsViewModel,
  weeklyAverage,
} from '../src/lib/statsView.ts'

const NOW = '2026-08-29T12:00:00.000Z'
const daysAgo = (n) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString()

function goal(overrides = {}) {
  return {
    id: 'g_test',
    parentId: null,
    title: 'A goal',
    kind: 'ongoing',
    priority: false,
    sortOrder: 0,
    completedAt: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function task(overrides = {}) {
  const id = overrides.id ?? 't_test'
  return {
    id,
    parentId: null,
    sourceTaskId: null,
    historyId: overrides.historyId ?? id,
    title: 'A task',
    notes: '',
    repeatable: false,
    sortOrder: 0,
    todayOrder: null,
    idealCompletionDate: null,
    deadline: null,
    scheduledDay: null,
    completedAt: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    blocked: false,
    available: true,
    goalIds: [],
    externalLinks: [],
    ...overrides,
  }
}

test('weekly average divides by the period week count and rounds to one decimal', () => {
  // 10 completions over 30 days: 10 / (30/7) = 2.33... -> 2.3
  assert.equal(weeklyAverage(10, 30), 2.3)
  // 2 over 90 days: 0.155... -> 0.2
  assert.equal(weeklyAverage(2, 90), 0.2)
  // 2 over 365 days: 0.038... -> 0
  assert.equal(weeklyAverage(2, 365), 0)
  // 7 over exactly 7 days: 7 a week
  assert.equal(weeklyAverage(7, 7), 7)
  assert.equal(weeklyAverage(0, 30), 0)
})

test('repeatable rows read "n times in <period> days · ≈x a week"', () => {
  assert.equal(repeatableRowText(2, 30), '2 times in 30 days · ≈0.5 a week')
  assert.equal(repeatableRowText(1, 30), '1 time in 30 days · ≈0.2 a week')
  // 5 over 35 days is exactly 1 a week: no trailing decimal.
  assert.equal(repeatableRowText(5, 35), '5 times in 35 days · ≈1 a week')
  assert.equal(repeatableRowText(0, 90), '0 times in 90 days · ≈0 a week')
})

function statsFixture() {
  // Ongoing goal: a repeatable completed twice under two titles (a rename
  // between completions) plus an old completion outside the period.
  const gOngoing = goal({ id: 'g_ongoing', title: 'Steady practice' })
  const oldChore = task({
    id: 't_old',
    title: 'Old chore',
    goalIds: ['g_ongoing'],
    completedAt: daysAgo(60),
  })
  const repCopy1 = task({
    id: 't_rep1',
    historyId: 'h_rep',
    title: 'Practice guitar',
    repeatable: true,
    goalIds: ['g_ongoing'],
    completedAt: daysAgo(2),
  })
  const repCopy2 = task({
    id: 't_rep2',
    historyId: 'h_rep',
    title: 'Practice guitar daily',
    repeatable: true,
    goalIds: ['g_ongoing'],
    completedAt: daysAgo(1),
  })
  const repLive = task({
    id: 't_rep_live',
    historyId: 'h_rep',
    title: 'Practice guitar daily',
    repeatable: true,
    goalIds: ['g_ongoing'],
  })

  // One-shot goal: one completed non-repeatable, one open task, one
  // repeatable completed twice with its live copy open.
  const gOneShot = goal({
    id: 'g_oneshot',
    title: 'Renew the passport',
    kind: 'one_shot',
  })
  const form = task({
    id: 't_form',
    title: 'Fill in the form',
    goalIds: ['g_oneshot'],
    completedAt: daysAgo(3),
  })
  const photos = task({
    id: 't_photos',
    title: 'Take the photos',
    goalIds: ['g_oneshot'],
  })
  const mailCopy1 = task({
    id: 't_mail1',
    historyId: 'h_mail',
    title: 'Check the mailbox',
    repeatable: true,
    goalIds: ['g_oneshot'],
    completedAt: daysAgo(5),
  })
  const mailCopy2 = task({
    id: 't_mail2',
    historyId: 'h_mail',
    title: 'Check the mailbox',
    repeatable: true,
    goalIds: ['g_oneshot'],
    completedAt: daysAgo(4),
  })
  const mailLive = task({
    id: 't_mail_live',
    historyId: 'h_mail',
    title: 'Check the mailbox',
    repeatable: true,
    goalIds: ['g_oneshot'],
  })

  // One-shot goal completed in the period, without task completions: counts
  // as goals completed and goals worked on through its own completion.
  const gShip = goal({
    id: 'g_ship',
    title: 'Ship the release',
    kind: 'one_shot',
    completedAt: daysAgo(1),
  })

  // Quiet ongoing goal with no tasks at all.
  const gQuiet = goal({ id: 'g_quiet', title: 'Quiet garden' })

  return {
    goals: [gOngoing, gOneShot, gShip, gQuiet],
    tasks: [
      oldChore,
      repCopy1,
      repCopy2,
      repLive,
      form,
      photos,
      mailCopy1,
      mailCopy2,
      mailLive,
    ],
  }
}

test('counters match hand-computed values over the 30-day default', () => {
  const { goals, tasks } = statsFixture()
  const view = statsViewModel({ goals, tasks, period: '30', now: NOW })

  // 2 guitar copies + 1 form + 2 mailbox copies; the 60-day-old chore is out.
  assert.equal(view.tasksCompleted, 5)
  assert.equal(view.goalsCompleted, 1)
  // Steady practice, Renew the passport (task completions), Ship the release.
  assert.equal(view.goalsWorkedOn, 3)
  assert.deepEqual(view.counterItems, [
    { value: 5, label: 'tasks completed' },
    { value: 1, label: 'goal completed' },
    { value: 3, label: 'goals worked on' },
  ])
})

test('sections split ongoing and one-shot goals with the right math', () => {
  const { goals, tasks } = statsFixture()
  const view = statsViewModel({ goals, tasks, period: '30', now: NOW })

  assert.deepEqual(
    view.sections.map((section) => section.title),
    ['Steady practice', 'Renew the passport', 'Quiet garden'],
  )

  const [ongoing, oneShot, quiet] = view.sections

  // Cumulative count includes the old completion; the renamed repeatable is
  // grouped by historyId, and the row carries the live copy's title.
  assert.equal(ongoing.kind, 'ongoing')
  assert.equal(ongoing.doneCount, 3)
  assert.deepEqual(ongoing.repeatables, [
    {
      taskId: 't_rep_live',
      title: 'Practice guitar daily',
      text: '2 times in 30 days · ≈0.5 a week',
    },
  ])

  // completed = form + 2 mailbox copies; total adds the two open tasks.
  assert.equal(oneShot.kind, 'one_shot')
  assert.equal(oneShot.completed, 3)
  assert.equal(oneShot.total, 5)
  assert.equal(oneShot.percentage, 60)

  assert.equal(quiet.kind, 'ongoing')
  assert.equal(quiet.doneCount, 0)
  assert.deepEqual(quiet.repeatables, [])
})

test('the completed-goals list carries the completion day', () => {
  const { goals, tasks } = statsFixture()
  const view = statsViewModel({ goals, tasks, period: '30', now: NOW })

  assert.deepEqual(
    view.completedGoals.map((entry) => [entry.goalId, entry.day]),
    [['g_ship', 'Aug 28']],
  )
})

test('wider periods pull older completions back in', () => {
  const { goals, tasks } = statsFixture()

  const ninety = statsViewModel({ goals, tasks, period: '90', now: NOW })
  assert.equal(ninety.tasksCompleted, 6)
  const ongoing90 = ninety.sections[0]
  assert.equal(ongoing90.repeatables[0].text, '2 times in 90 days · ≈0.2 a week')

  const year = statsViewModel({ goals, tasks, period: '365', now: NOW })
  assert.equal(year.tasksCompleted, 6)
  assert.equal(
    year.sections[0].repeatables[0].text,
    '2 times in 365 days · ≈0 a week',
  )
})

test('a completion at the period start counts, one moment before does not', () => {
  const start = new Date(Date.parse(NOW) - 30 * 86_400_000).toISOString()
  const justOutside = new Date(Date.parse(start) - 1).toISOString()
  const atStart = goal({
    id: 'g_edge',
    kind: 'one_shot',
    completedAt: start,
  })
  const inside = statsViewModel({
    goals: [atStart],
    tasks: [task({ id: 't_in', completedAt: start })],
    period: '30',
    now: NOW,
  })
  assert.equal(inside.tasksCompleted, 1)
  assert.equal(inside.goalsCompleted, 1)
  assert.equal(inside.goalsWorkedOn, 1)

  const outside = statsViewModel({
    goals: [goal({ id: 'g_edge', kind: 'one_shot', completedAt: justOutside })],
    tasks: [task({ id: 't_out', completedAt: justOutside })],
    period: '30',
    now: NOW,
  })
  assert.equal(outside.tasksCompleted, 0)
  assert.equal(outside.goalsCompleted, 0)
  assert.equal(outside.goalsWorkedOn, 0)
})

test('unlinked completions count as tasks completed without goal effects', () => {
  const view = statsViewModel({
    goals: [],
    tasks: [task({ id: 't_free', completedAt: daysAgo(2) })],
    period: '30',
    now: NOW,
  })
  assert.equal(view.tasksCompleted, 1)
  assert.equal(view.goalsWorkedOn, 0)
  assert.equal(view.hasGoals, false)
  assert.deepEqual(view.sections, [])
})

test('subgoal tasks and completions roll up into the top-level section', () => {
  const parent = goal({ id: 'g_parent', title: 'Parent goal' })
  const sub = goal({
    id: 'g_sub',
    parentId: 'g_parent',
    title: 'Sub goal',
    kind: 'one_shot',
  })
  const view = statsViewModel({
    goals: [parent, sub],
    tasks: [
      task({
        id: 't_sub_task',
        title: 'Linked to the subgoal',
        goalIds: ['g_sub'],
        completedAt: daysAgo(1),
      }),
    ],
    period: '30',
    now: NOW,
  })
  assert.equal(view.sections.length, 1)
  assert.equal(view.sections[0].doneCount, 1)
  assert.equal(view.goalsWorkedOn, 1)
  // A completed subgoal is not a completed goal; only one-shot top-level
  // goals finished in the period land in the completed list.
  assert.equal(view.goalsCompleted, 0)
  assert.deepEqual(view.completedGoals, [])
})

test('archived top-level goals leave the sections but keep their history', () => {
  const archived = goal({ id: 'g_arch', title: 'Archived push', archivedAt: daysAgo(1) })
  const view = statsViewModel({
    goals: [archived],
    tasks: [
      task({ id: 't_arch', goalIds: ['g_arch'], completedAt: daysAgo(2) }),
    ],
    period: '30',
    now: NOW,
  })
  assert.deepEqual(view.sections, [])
  assert.equal(view.tasksCompleted, 1)
  assert.equal(view.goalsWorkedOn, 1)
})
