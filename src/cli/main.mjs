import { createDomainStore, DomainError } from '../domain/store.ts'
import { defaultDatabasePath } from '../db/migrations.mjs'

/** @typedef {'value' | 'multi' | 'boolean'} FlagKind */
/** @typedef {Record<string, FlagKind>} FlagSpec */
/** @typedef {{ positionals: string[], flags: Record<string, string | string[] | boolean> }} Parsed */
/** @typedef {{
  usage: string,
  flags: FlagSpec,
  arity: number,
  run: (store: unknown, positionals: string[], flags: Record<string, string | string[] | boolean>) => unknown,
}} Verb */
/** @typedef {{ help: string, verbs: Record<string, Verb> }} Resource */

const localDay = () => {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

const validation = (message) => {
  throw new DomainError('VALIDATION_FAILED', message)
}

const optionalDay = (value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return validation('Dates must use YYYY-MM-DD')
  }
  return value
}

const DAY_FLAGS = { on: 'value', limit: 'value', query: 'value' }

const parseArgs = (args, spec) => {
  const positionals = []
  const flags = {}
  for (let index = 0; index < args.length; index++) {
    const token = args[index]
    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }
    const equals = token.indexOf('=')
    const name = equals === -1 ? token.slice(2) : token.slice(2, equals)
    const inline = equals === -1 ? undefined : token.slice(equals + 1)
    const kind = spec[name]
    if (!kind) return validation(`Unknown flag --${name}`)
    if (kind === 'boolean') {
      if (inline !== undefined) {
        return validation(`Flag --${name} does not take a value`)
      }
      flags[name] = true
      continue
    }
    let value = inline
    if (value === undefined) {
      value = args[++index]
      if (value === undefined) return validation(`Flag --${name} requires a value`)
    }
    if (kind === 'multi') {
      const values = flags[name]
      if (Array.isArray(values)) values.push(value)
      else flags[name] = [value]
    } else {
      if (Object.hasOwn(flags, name)) {
        return validation(`Flag --${name} was given more than once`)
      }
      flags[name] = value
    }
  }
  return { positionals, flags }
}

const flag = (flags, name) => flags[name]

const flagList = (flags, name) => flags[name]

const flagBoolean = (flags, name) => flags[name] === true

const countPositionals = (positionals, arity, usage) => {
  if (positionals.length !== arity) return validation(`Usage: ${usage}`)
  return positionals
}

const goalKind = (value) => {
  if (value === 'one-shot') return 'one_shot'
  if (value === 'ongoing') return 'ongoing'
  return validation('Kind must be one-shot or ongoing (--kind <one-shot|ongoing>)')
}

const linkedTaskDispositions = (values) => {
  if (!values) return undefined
  const linkedTasks = {}
  for (const value of values) {
    const separator = value.indexOf('=')
    if (separator === -1) {
      return validation('--task must use <taskId>=<keep|archive|link:<goalId>>')
    }
    const taskId = value.slice(0, separator)
    const disposition = value.slice(separator + 1)
    if (disposition === 'keep') {
      linkedTasks[taskId] = { action: 'keep_active' }
    } else if (disposition === 'archive') {
      linkedTasks[taskId] = { action: 'archive' }
    } else if (disposition.startsWith('link:')) {
      linkedTasks[taskId] = { action: 'link', goalId: disposition.slice('link:'.length) }
    } else {
      return validation('--task must use <taskId>=<keep|archive|link:<goalId>>')
    }
  }
  return linkedTasks
}

const wholeNumber = (value) => {
  if (value === undefined) return undefined
  if (!/^\d+$/.test(value)) return validation('--limit must be a whole number')
  return Number(value)
}

const matchesQuery = (query, fields) =>
  query === undefined ||
  fields.some((field) => field.toLowerCase().includes(query.toLowerCase()))

const taskListState = (store, state, goalId) => {
  if (state === undefined) return store.listTasks({ goalId })
  if (state === 'available' || state === 'blocked') {
    return store.listTasks({ goalId, availability: state })
  }
  if (state === 'done') {
    return store
      .listTasks({ goalId })
      .filter((task) => task.completedAt !== null)
  }
  if (state === 'archived') {
    return store
      .listTasks({ goalId, includeArchived: true })
      .filter((task) => task.archivedAt !== null)
  }
  return validation('--state must be available, blocked, done, or archived')
}

const goalVerb = (usage, flags, arity, run) => ({ usage, flags, arity, run })

const verbs = {
  goal: {
    create: goalVerb(
      'omni-orga goal create <title> --kind <one-shot|ongoing> [--parent <id>]',
      { kind: 'value', parent: 'value' },
      1,
      (store, positionals, flags) =>
        store.createGoal({
          title: positionals[0],
          kind: goalKind(flag(flags, 'kind')),
          parentId: flag(flags, 'parent'),
        }),
    ),
    get: goalVerb(
      'omni-orga goal get <id>',
      {},
      1,
      (store, positionals) => {
        const goal = store.getGoal(positionals[0])
        return { ...goal, progress: store.getGoalProgress(goal.id) }
      },
    ),
    list: goalVerb(
      'omni-orga goal list [--state active|archived] [--query <text>]',
      { state: 'value', query: 'value' },
      0,
      (store, _positionals, flags) => {
        const state = flag(flags, 'state')
        if (state !== undefined && state !== 'active' && state !== 'archived') {
          return validation('--state must be active or archived')
        }
        const goals =
          state === 'archived'
            ? store
                .listGoals({ includeArchived: true })
                .filter((goal) => goal.archivedAt !== null)
            : store.listGoals()
        const query = flag(flags, 'query')
        return goals.filter((goal) => matchesQuery(query, [goal.title]))
      },
    ),
    update: goalVerb(
      'omni-orga goal update <id> [--title <t>]',
      { title: 'value' },
      1,
      (store, positionals, flags) => {
        return store.updateGoal(positionals[0], {
          title: flag(flags, 'title'),
        })
      },
    ),
    complete: goalVerb(
      'omni-orga goal complete <id> [--task <taskId>=<keep|archive|link:<goalId>>]...',
      { task: 'multi' },
      1,
      (store, positionals, flags) =>
        store.completeGoal(positionals[0], {
          linkedTasks: linkedTaskDispositions(flagList(flags, 'task')),
        }),
    ),
    reopen: goalVerb(
      'omni-orga goal reopen <id>',
      {},
      1,
      (store, positionals) => store.reopenGoal(positionals[0]),
    ),
    archive: goalVerb(
      'omni-orga goal archive <id> [--task <taskId>=<keep|archive|link:<goalId>>]...',
      { task: 'multi' },
      1,
      (store, positionals, flags) =>
        store.archiveGoal(positionals[0], undefined, {
          linkedTasks: linkedTaskDispositions(flagList(flags, 'task')),
        }),
    ),
    restore: goalVerb(
      'omni-orga goal restore <id>',
      {},
      1,
      (store, positionals) => store.restoreGoal(positionals[0]),
    ),
    delete: goalVerb(
      'omni-orga goal delete <id> [--task <taskId>=<keep|archive|link:<goalId>>]...',
      { task: 'multi' },
      1,
      (store, positionals, flags) => {
        store.deleteGoal(positionals[0], {
          linkedTasks: linkedTaskDispositions(flagList(flags, 'task')),
        })
        return {}
      },
    ),
    priority: goalVerb(
      'omni-orga goal priority <id> <on|off>',
      {},
      2,
      (store, positionals) => {
        const [goalId, value] = positionals
        if (value === 'on') return store.setGoalPriority(goalId, true)
        if (value === 'off') return store.setGoalPriority(goalId, false)
        return validation('Priority must be on or off')
      },
    ),
  },
  task: {
    create: goalVerb(
      'omni-orga task create <title> [--parent <id>] [--notes <text>] [--repeatable] [--ideal-date <YYYY-MM-DD|none>] [--deadline <date|none>] [--goal <id>]...',
      {
        parent: 'value',
        notes: 'value',
        repeatable: 'boolean',
        'ideal-date': 'value',
        deadline: 'value',
        goal: 'multi',
      },
      1,
      (store, positionals, flags) => {
        const idealDate = flag(flags, 'ideal-date')
        const deadline = flag(flags, 'deadline')
        return store.createTask({
          title: positionals[0],
          parentId: flag(flags, 'parent'),
          notes: flag(flags, 'notes'),
          repeatable: flagBoolean(flags, 'repeatable') || undefined,
          goalIds: flagList(flags, 'goal'),
          idealCompletionDate: idealDate === 'none' ? undefined : idealDate,
          deadline: deadline === 'none' ? undefined : deadline,
        })
      },
    ),
    get: goalVerb(
      'omni-orga task get <id>',
      {},
      1,
      (store, positionals) => {
        const task = store.getTask(positionals[0])
        if (!task.repeatable) return task
        return { ...task, previousCompletion: store.getPreviousCompletion(task.id) }
      },
    ),
    list: goalVerb(
      'omni-orga task list [--goal <id>] [--state available|blocked|done|archived] [--on <date>] [--limit N] [--query <text>]',
      { goal: 'value', state: 'value', ...DAY_FLAGS },
      0,
      (store, _positionals, flags) => {
        let tasks = taskListState(store, flag(flags, 'state'), flag(flags, 'goal'))
        const on = flag(flags, 'on')
        if (on !== undefined) {
          optionalDay(on)
          tasks = tasks.filter((task) => task.scheduledDay === on)
        }
        const query = flag(flags, 'query')
        tasks = tasks.filter((task) =>
          matchesQuery(query, [task.title, task.notes]),
        )
        const limit = wholeNumber(flag(flags, 'limit'))
        return limit === undefined ? tasks : tasks.slice(0, limit)
      },
    ),
    update: goalVerb(
      'omni-orga task update <id> [--title <t>] [--notes <text>]',
      { title: 'value', notes: 'value' },
      1,
      (store, positionals, flags) => {
        return store.updateTask(positionals[0], {
          title: flag(flags, 'title'),
          notes: flag(flags, 'notes'),
        })
      },
    ),
    archive: goalVerb(
      'omni-orga task archive <id>',
      {},
      1,
      (store, positionals) => store.archiveTask(positionals[0]),
    ),
    restore: goalVerb(
      'omni-orga task restore <id>',
      {},
      1,
      (store, positionals) => store.restoreTask(positionals[0]),
    ),
    complete: goalVerb(
      'omni-orga task complete <id>',
      {},
      1,
      (store, positionals) => store.completeTask(positionals[0]),
    ),
    undo: goalVerb(
      'omni-orga task undo <id>',
      {},
      1,
      (store, positionals) => store.undoTaskCompletion(positionals[0]),
    ),
    delete: goalVerb(
      'omni-orga task delete <id>',
      {},
      1,
      (store, positionals) => {
        store.deleteTask(positionals[0])
        return {}
      },
    ),
    deadline: goalVerb(
      'omni-orga task deadline <id> <date|none>',
      {},
      2,
      (store, positionals) => {
        const [taskId, value] = positionals
        return store.setTaskDeadline(taskId, value === 'none' ? null : optionalDay(value))
      },
    ),
    'ideal-date': goalVerb(
      'omni-orga task ideal-date <id> <date|none>',
      {},
      2,
      (store, positionals) => {
        const [taskId, value] = positionals
        return store.setTaskIdealCompletionDate(
          taskId,
          value === 'none' ? null : optionalDay(value),
        )
      },
    ),
    goals: goalVerb(
      'omni-orga task goals <id> [--goal <id>]...',
      { goal: 'multi' },
      1,
      (store, positionals, flags) =>
        store.setTaskGoalLinks(positionals[0], flagList(flags, 'goal') ?? []),
    ),
    history: goalVerb(
      'omni-orga task history <id>',
      {},
      1,
      (store, positionals) => store.listTaskHistory(positionals[0]),
    ),
  },
  today: {
    list: goalVerb(
      'omni-orga today list [--on <date>]',
      { on: 'value' },
      0,
      (store, _positionals, flags) => store.getToday(flag(flags, 'on') ?? localDay()),
    ),
    add: goalVerb(
      'omni-orga today add <id>',
      {},
      1,
      (store, positionals) => store.planTask(positionals[0], localDay()),
    ),
    remove: goalVerb(
      'omni-orga today remove <id>',
      {},
      1,
      (store, positionals) => store.unplanTask(positionals[0]),
    ),
    reorder: goalVerb(
      'omni-orga today reorder <id> (--after <taskId> | --top | --bottom)',
      { after: 'value', top: 'boolean', bottom: 'boolean' },
      1,
      (store, positionals, flags) => {
        const taskId = positionals[0]
        const chosen = ['after', 'top', 'bottom'].filter((name) =>
          Object.hasOwn(flags, name),
        )
        if (chosen.length !== 1) {
          return validation(
            'Choose exactly one of --after <taskId>, --top, or --bottom',
          )
        }
        if (chosen[0] !== 'bottom') {
          return store.reorderToday(taskId, chosen[0] === 'top' ? null : flag(flags, 'after'))
        }
        const task = store.getTask(taskId)
        if (!task.scheduledDay) {
          return validation('Only scheduled tasks can be reordered')
        }
        const open = store
          .getToday(task.scheduledDay)
          .open.filter((entry) => entry.id !== taskId)
        return store.reorderToday(taskId, open.length ? open[open.length - 1].id : null)
      },
    ),
    complete: goalVerb(
      'omni-orga today complete <id>',
      {},
      1,
      (store, positionals) => store.completeTask(positionals[0]),
    ),
    undo: goalVerb(
      'omni-orga today undo <id>',
      {},
      1,
      (store, positionals) => store.undoTaskCompletion(positionals[0]),
    ),
  },
  calendar: {
    move: goalVerb(
      'omni-orga calendar move <id> <date>',
      {},
      2,
      (store, positionals) => {
        const [taskId, day] = positionals
        return store.planTask(taskId, optionalDay(day))
      },
    ),
    remove: goalVerb(
      'omni-orga calendar remove <id>',
      {},
      1,
      (store, positionals) => store.unplanTask(positionals[0]),
    ),
  },
}

const TOP_HELP = `omni-orga - goals, tasks, Today, and Calendar as JSON commands

Usage: omni-orga <resource> <verb> [arguments] [--pretty]

Resources:
  goal       create, get, list, update, complete, reopen, archive, restore, delete, priority
  task       create, get, list, update, archive, restore, complete, undo, delete, deadline, ideal-date, goals, history
  today      list, add, remove, reorder, complete, undo
  calendar   move, remove

"today add <id>" and "calendar move <id> <today>" run the same domain
action; Today and Calendar are two views of one schedule.
Every command prints JSON on stdout: bare data on success (exit 0) or
{"error":{"code","message"}} on failure (exit 1). --pretty is accepted on
every command and only changes formatting. Run
omni-orga <resource> --help for the verbs of a resource.

Database: OMNI_ORGA_DATABASE_PATH or the default data directory.
`

const RESOURCE_HELP = (resource, verbMap) =>
  `omni-orga ${resource} - resource commands

Usage: omni-orga ${resource} <verb> [arguments] [--pretty]

${Object.values(verbMap)
  .map((verb) => verb.usage)
  .join('\n')}
`

const resources = Object.fromEntries(
  Object.entries(verbs).map(([resource, verbMap]) => [
    resource,
    { help: RESOURCE_HELP(resource, verbMap), verbs: verbMap },
  ]),
)

const format = (value, pretty) =>
  `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`

const execute = (argv, env = process.env) => {
  const tokens = [...argv]
  while (tokens[0] === '--pretty') tokens.shift()
  if (tokens.length === 0 || tokens[0] === '--help' || tokens[0] === '-h') {
    return { status: 0, output: TOP_HELP }
  }
  const resource = resources[tokens[0]]
  if (!resource) {
    return validation(
      `Unknown command "${tokens[0]}". Run omni-orga --help for the command list`,
    )
  }
  if (tokens.length === 1 || tokens[1] === '--help' || tokens[1] === '-h') {
    return { status: 0, output: resource.help }
  }
  const verb = resource.verbs[tokens[1]]
  if (!verb) {
    return validation(
      `Unknown ${tokens[0]} command "${tokens[1]}". Run omni-orga ${tokens[0]} --help`,
    )
  }
  const parsed = parseArgs(tokens.slice(2), { ...verb.flags, pretty: 'boolean', help: 'boolean' })
  if (parsed.flags.help === true) {
    return { status: 0, output: resource.help }
  }
  countPositionals(parsed.positionals, verb.arity, verb.usage)
  const databasePath = env.OMNI_ORGA_DATABASE_PATH ?? defaultDatabasePath
  const store = createDomainStore(databasePath)
  try {
    const value = verb.run(store, parsed.positionals, parsed.flags)
    return { status: 0, output: format(value, parsed.flags.pretty === true) }
  } finally {
    store.close()
  }
}

export function run(argv, env = process.env) {
  try {
    return execute(argv, env)
  } catch (error) {
    const code = error instanceof DomainError ? error.code : 'INTERNAL'
    const message = error instanceof Error ? error.message : String(error)
    const pretty = argv.includes('--pretty')
    return { status: 1, output: format({ error: { code, message } }, pretty) }
  }
}
