import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import test from 'node:test'

import { openDatabase } from '../src/db/migrations.mjs'

const checkout = new URL('..', import.meta.url)

function runScript(script, args, env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: checkout,
    encoding: 'utf8',
    env,
    timeout: 30_000,
  })
}

function waitForOutput(stream, expected) {
  return new Promise((resolve) => {
    stream.on('data', (chunk) => {
      if (chunk.toString().includes(expected)) resolve()
    })
  })
}

async function unusedPort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return port
}

async function writeLifecycleStub(directory) {
  const stubPath = join(directory, 'lifecycle-stub.mjs')
  await writeFile(
    stubPath,
    [
      "import { appendFileSync, mkdirSync } from 'node:fs'",
      "import { join } from 'node:path'",
      "import { DatabaseSync } from 'node:sqlite'",
      '',
      'const command = process.argv[2]',
      'const runtimeDirectory = process.env.OMNI_ORGA_RUNTIME_DIR',
      '',
      'function record(event) {',
      '  mkdirSync(runtimeDirectory, { recursive: true })',
      "  appendFileSync(join(runtimeDirectory, 'stub-events.log'), `${event}\\n`)",
      '}',
      '',
      "if (command === 'status') {",
      "  console.log('mode: normal')",
      "} else if (command === 'stop') {",
      "  record('stop')",
      '  const database = new DatabaseSync(process.env.OMNI_ORGA_DATABASE_PATH, { timeout: 5000 })',
      '  try {',
      "    database.exec('PRAGMA busy_timeout = 5000')",
      "    database.exec(\"INSERT INTO example VALUES ('in-flight')\")",
      '  } finally {',
      '    database.close()',
      '  }',
      "} else if (command === 'start') {",
      "  record('start')",
      '} else {',
      '  process.exitCode = 1',
      '}',
    ].join('\n'),
  )
  return stubPath
}

test('restore requires an explicit backup and changes nothing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-restore-'))
  const databasePath = join(directory, 'data', 'omni-orga.sqlite')
  const backupDirectory = join(directory, 'backups')
  const database = openDatabase(databasePath)
  database.exec('CREATE TABLE example (value TEXT); INSERT INTO example VALUES (\'live\')')
  database.close()

  const result = runScript('scripts/restore.mjs', [], {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_DATABASE_PATH: databasePath,
    OMNI_ORGA_BACKUP_DIRECTORY: backupDirectory,
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /Usage: pnpm restore -- <backup-file>/)
  const unchanged = openDatabase(databasePath)
  assert.equal(unchanged.prepare('SELECT value FROM example').get().value, 'live')
  unchanged.close()
})

test('backup stays valid while writes are in flight', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-backup-'))
  const databasePath = join(directory, 'data', 'omni-orga.sqlite')
  const backupDirectory = join(directory, 'backups')
  const database = openDatabase(databasePath)
  database.exec('CREATE TABLE example (value TEXT)')
  const insert = database.prepare('INSERT INTO example VALUES (?)')
  for (let index = 0; index < 1_000; index += 1) insert.run(`seed-${index}`)
  database.close()

  const writer = spawn(
    process.execPath,
    [
      '-e',
      [
        "const { DatabaseSync } = require('node:sqlite')",
        `const database = new DatabaseSync(${JSON.stringify(databasePath)}, { timeout: 5000 })`,
        "database.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000')",
        "const insert = database.prepare('INSERT INTO example VALUES (?)')",
        "let index = 0",
        "process.stdout.write('ready\\n')",
        "const timer = setInterval(() => insert.run(`live-${index++}`), 1)",
        "process.on('SIGTERM', () => { clearInterval(timer); database.close(); process.exit() })",
      ].join(';'),
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )

  try {
    await waitForOutput(writer.stdout, 'ready')
    const result = runScript('scripts/backup.mjs', [], {
      ...process.env,
      OMNI_ORGA_TEST: '1',
      OMNI_ORGA_DATABASE_PATH: databasePath,
      OMNI_ORGA_BACKUP_DIRECTORY: backupDirectory,
    })
    assert.equal(result.status, 0, result.stderr)

    const files = await readdir(backupDirectory)
    assert.equal(files.length, 1)
    const saved = openDatabase(join(backupDirectory, files[0]))
    assert.equal(saved.prepare('PRAGMA quick_check').get().quick_check, 'ok')
    assert.ok(saved.prepare('SELECT count(*) AS count FROM example').get().count >= 1_000)
    saved.close()
  } finally {
    writer.kill('SIGTERM')
  }
})

test('restore preserves the live database, installs the backup, and migrates it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-full-restore-'))
  const databasePath = join(directory, 'data', 'omni-orga.sqlite')
  const backupPath = join(directory, 'chosen.sqlite')
  const backupDirectory = join(directory, 'backups')
  const runtimeDirectory = join(directory, 'runtime')

  for (const [path, value] of [
    [databasePath, 'live'],
    [backupPath, 'chosen'],
  ]) {
    const database = openDatabase(path)
    database.exec(`CREATE TABLE example (value TEXT); INSERT INTO example VALUES ('${value}')`)
    database.close()
  }

  const env = {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_DATABASE_PATH: databasePath,
    OMNI_ORGA_BACKUP_DIRECTORY: backupDirectory,
    OMNI_ORGA_RUNTIME_DIR: runtimeDirectory,
  }
  const result = runScript('scripts/restore.mjs', [backupPath], env)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /server state: stopped/)

  const restored = openDatabase(databasePath)
  assert.equal(restored.prepare('SELECT value FROM example').get().value, 'chosen')
  assert.deepEqual(
    restored.prepare('SELECT name FROM schema_migrations').all().map(({ name }) => name),
    ['001_foundation.sql'],
  )
  restored.close()

  const [rescueName] = (await readdir(backupDirectory)).filter((name) => name.includes('-rescue-'))
  const rescue = openDatabase(join(backupDirectory, rescueName))
  assert.equal(rescue.prepare('SELECT value FROM example').get().value, 'live')
  rescue.close()

  const status = runScript('scripts/lifecycle.mjs', ['status'], env)
  assert.match(status.stdout, /^mode: stopped$/m)
})

test('restore refuses a corrupt backup without changing live data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-corrupt-restore-'))
  const databasePath = join(directory, 'data', 'omni-orga.sqlite')
  const corruptPath = join(directory, 'corrupt.sqlite')
  const backupDirectory = join(directory, 'backups')
  const database = openDatabase(databasePath)
  database.exec("CREATE TABLE example (value TEXT); INSERT INTO example VALUES ('live')")
  database.close()
  await writeFile(corruptPath, 'not a sqlite database')

  const result = runScript('scripts/restore.mjs', [corruptPath], {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_DATABASE_PATH: databasePath,
    OMNI_ORGA_BACKUP_DIRECTORY: backupDirectory,
    OMNI_ORGA_RUNTIME_DIR: join(directory, 'runtime'),
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /Restore failed:/)
  const unchanged = openDatabase(databasePath)
  assert.equal(unchanged.prepare('SELECT value FROM example').get().value, 'live')
  unchanged.close()

  const [rescueName] = (await readdir(backupDirectory)).filter((name) => name.includes('-rescue-'))
  const rescue = openDatabase(join(backupDirectory, rescueName))
  assert.equal(rescue.prepare('SELECT value FROM example').get().value, 'live')
  rescue.close()
})

test('restore returns a running server to the running state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-running-restore-'))
  const databasePath = join(directory, 'data', 'omni-orga.sqlite')
  const backupPath = join(directory, 'chosen.sqlite')
  const port = await unusedPort()

  for (const [path, value] of [
    [databasePath, 'live'],
    [backupPath, 'chosen'],
  ]) {
    const database = openDatabase(path)
    database.exec(`CREATE TABLE example (value TEXT); INSERT INTO example VALUES ('${value}')`)
    database.close()
  }

  const env = {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_PORT: String(port),
    OMNI_ORGA_DATABASE_PATH: databasePath,
    OMNI_ORGA_BACKUP_DIRECTORY: join(directory, 'backups'),
    OMNI_ORGA_RUNTIME_DIR: join(directory, 'runtime'),
  }

  try {
    const start = runScript('scripts/lifecycle.mjs', ['start'], env)
    assert.equal(start.status, 0, start.stderr)

    const restore = runScript('scripts/restore.mjs', [backupPath], env)
    assert.equal(restore.status, 0, restore.stderr)
    assert.match(restore.stdout, /server state: running/)

    const status = runScript('scripts/lifecycle.mjs', ['status'], env)
    assert.equal(status.status, 0, status.stderr)
    assert.match(status.stdout, /^mode: normal$/m)
    assert.match(status.stdout, /^health: healthy$/m)

    const restored = openDatabase(databasePath)
    assert.equal(restored.prepare('SELECT value FROM example').get().value, 'chosen')
    restored.close()
  } finally {
    runScript('scripts/lifecycle.mjs', ['stop'], env)
  }
})

test('rescue copy includes writes committed while the server stops', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-inflight-restore-'))
  const databasePath = join(directory, 'data', 'omni-orga.sqlite')
  const backupPath = join(directory, 'chosen.sqlite')
  const backupDirectory = join(directory, 'backups')
  const runtimeDirectory = join(directory, 'runtime')

  for (const [path, value] of [
    [databasePath, 'live'],
    [backupPath, 'chosen'],
  ]) {
    const database = openDatabase(path)
    database.exec(`CREATE TABLE example (value TEXT); INSERT INTO example VALUES ('${value}')`)
    database.close()
  }
  const lifecycleStubPath = await writeLifecycleStub(directory)

  const env = {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_DATABASE_PATH: databasePath,
    OMNI_ORGA_BACKUP_DIRECTORY: backupDirectory,
    OMNI_ORGA_RUNTIME_DIR: runtimeDirectory,
    OMNI_ORGA_LIFECYCLE_PATH: lifecycleStubPath,
  }
  const result = runScript('scripts/restore.mjs', [backupPath], env)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /server state: running/)

  const events = (await readFile(join(runtimeDirectory, 'stub-events.log'), 'utf8'))
    .split('\n')
    .filter(Boolean)
  assert.deepEqual(events, ['stop', 'start'])

  const [rescueName] = (await readdir(backupDirectory)).filter((name) => name.includes('-rescue-'))
  const rescue = openDatabase(join(backupDirectory, rescueName))
  const values = rescue.prepare('SELECT value FROM example').all().map(({ value }) => value)
  rescue.close()
  assert.ok(values.includes('live'))
  assert.ok(values.includes('in-flight'))
})

test('restore restores the running state and leaves data untouched when validation fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-failed-restore-'))
  const databasePath = join(directory, 'data', 'omni-orga.sqlite')
  const corruptPath = join(directory, 'corrupt.sqlite')
  const backupDirectory = join(directory, 'backups')
  const runtimeDirectory = join(directory, 'runtime')

  const database = openDatabase(databasePath)
  database.exec("CREATE TABLE example (value TEXT); INSERT INTO example VALUES ('live')")
  database.close()
  await writeFile(corruptPath, 'not a sqlite database')
  const lifecycleStubPath = await writeLifecycleStub(directory)

  const env = {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_DATABASE_PATH: databasePath,
    OMNI_ORGA_BACKUP_DIRECTORY: backupDirectory,
    OMNI_ORGA_RUNTIME_DIR: runtimeDirectory,
    OMNI_ORGA_LIFECYCLE_PATH: lifecycleStubPath,
  }
  const result = runScript('scripts/restore.mjs', [corruptPath], env)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Restore failed:/)

  const events = (await readFile(join(runtimeDirectory, 'stub-events.log'), 'utf8'))
    .split('\n')
    .filter(Boolean)
  assert.deepEqual(events, ['stop', 'start'])

  const unchanged = openDatabase(databasePath)
  assert.equal(unchanged.prepare('SELECT value FROM example').get().value, 'live')
  unchanged.close()

  const [rescueName] = (await readdir(backupDirectory)).filter((name) => name.includes('-rescue-'))
  const rescue = openDatabase(join(backupDirectory, rescueName))
  assert.equal(rescue.prepare('SELECT value FROM example').get().value, 'live')
  rescue.close()
})
