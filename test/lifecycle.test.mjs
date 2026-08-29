import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import test from 'node:test'

import { openDatabase } from '../src/db/migrations.mjs'

const checkout = new URL('..', import.meta.url)

function runLifecycle(command, env) {
  return spawnSync(process.execPath, ['scripts/lifecycle.mjs', command], {
    cwd: checkout,
    encoding: 'utf8',
    env,
    timeout: 30_000,
  })
}

function runLifecycleAsync(command, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/lifecycle.mjs', command], {
      cwd: checkout,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', (status, signal) => {
      resolve({ status, signal, stdout, stderr })
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

async function waitForExpectedPage(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`)
      if ((await response.text()).includes('data-omni-orga="app"')) return
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`server on port ${port} did not become ready`)
}

test('status reports this checkout as stopped when no server is registered', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-lifecycle-'))
  const result = runLifecycle('status', {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_RUNTIME_DIR: join(directory, 'runtime'),
    OMNI_ORGA_DATABASE_PATH: join(directory, 'omni-orga.sqlite'),
  })

  assert.equal(result.status, 0, result.stderr)
  assert.ok(
    result.stdout
      .split('\n')
      .includes(`checkout: ${fileURLToPath(checkout).replace(/\/$/, '')}`),
  )
  assert.match(result.stdout, /^PID: none$/m)
  assert.match(result.stdout, /^mode: stopped$/m)
  assert.match(result.stdout, /^URL: http:\/\/127\.0\.0\.1:4310$/m)
  assert.match(result.stdout, /^health: stopped$/m)
})

test('start, status, logs, already running, and stop share one owned server', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-lifecycle-'))
  const port = await unusedPort()
  const databasePath = join(directory, 'omni-orga.sqlite')
  const env = {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_PORT: String(port),
    OMNI_ORGA_RUNTIME_DIR: join(directory, 'runtime'),
    OMNI_ORGA_DATABASE_PATH: databasePath,
  }

  try {
    const started = runLifecycle('start', env)
    assert.equal(started.status, 0, started.stderr)
    assert.match(started.stdout, /healthy server at/)

    const status = runLifecycle('status', env)
    assert.equal(status.status, 0, status.stderr)
    assert.match(status.stdout, /^PID: \d+$/m)
    assert.match(status.stdout, /^mode: normal$/m)
    assert.match(status.stdout, new RegExp(`^URL: http://127\\.0\\.0\\.1:${port}$`, 'm'))
    assert.match(status.stdout, /^health: healthy$/m)

    const alreadyRunning = runLifecycle('start', env)
    assert.equal(alreadyRunning.status, 0, alreadyRunning.stderr)
    assert.match(alreadyRunning.stdout, /already running/)

    const blockedDevelopment = runLifecycle('dev', env)
    assert.equal(blockedDevelopment.status, 1)
    assert.match(blockedDevelopment.stderr, /normal server already running/)

    const logs = runLifecycle('logs', env)
    assert.equal(logs.status, 0, logs.stderr)
    assert.match(logs.stdout, /normal server starting/)

    const database = openDatabase(databasePath)
    assert.deepEqual(
      database
        .prepare('SELECT name FROM schema_migrations ORDER BY name')
        .all()
        .map(({ name }) => name),
      ['001_foundation.sql'],
    )
    database.close()

    const stopped = runLifecycle('stop', env)
    assert.equal(stopped.status, 0, stopped.stderr)
    assert.match(stopped.stdout, /stopped/)

    const stoppedStatus = runLifecycle('status', env)
    assert.match(stoppedStatus.stdout, /^PID: none$/m)
    assert.match(stoppedStatus.stdout, /^mode: stopped$/m)
    assert.match(stoppedStatus.stdout, /^health: stopped$/m)
  } finally {
    runLifecycle('stop', env)
  }
})

test('concurrent starts create only one owned server', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-concurrent-'))
  const port = await unusedPort()
  const env = {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_PORT: String(port),
    OMNI_ORGA_RUNTIME_DIR: join(directory, 'runtime'),
    OMNI_ORGA_DATABASE_PATH: join(directory, 'omni-orga.sqlite'),
  }

  try {
    const results = await Promise.all([
      runLifecycleAsync('start', env),
      runLifecycleAsync('start', env),
    ])
    assert.deepEqual(results.map(({ status }) => status).sort(), [0, 1])
    assert.match(
      results.map(({ stderr }) => stderr).join('\n'),
      /another start or dev command is in progress/,
    )

    const status = runLifecycle('status', env)
    assert.equal(status.status, 0, status.stderr)
    assert.match(status.stdout, /^PID: \d+$/m)
    assert.match(status.stdout, /^mode: normal$/m)
    assert.match(status.stdout, /^health: healthy$/m)
  } finally {
    runLifecycle('stop', env)
  }
})

test('start reports an unrelated listener without terminating it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-listener-'))
  const port = await unusedPort()
  const listener = spawn(
    process.execPath,
    [
      '-e',
      `require('node:http').createServer((_, response) => response.end('other')).listen(${port}, '127.0.0.1')`,
    ],
    { stdio: 'ignore' },
  )
  const env = {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_PORT: String(port),
    OMNI_ORGA_RUNTIME_DIR: join(directory, 'runtime'),
    OMNI_ORGA_DATABASE_PATH: join(directory, 'omni-orga.sqlite'),
  }

  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        await fetch(`http://127.0.0.1:${port}`)
        break
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    }

    const result = runLifecycle('start', env)
    assert.equal(result.status, 1)
    assert.match(result.stderr, new RegExp(`listener PID: ${listener.pid}`))
    assert.match(result.stderr, /listener command:/)
    assert.doesNotThrow(() => process.kill(listener.pid, 0))
  } finally {
    listener.kill('SIGTERM')
  }
})

test('dev stays in the foreground and uses the same database rules', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-dev-'))
  const port = await unusedPort()
  const databasePath = join(directory, 'omni-orga.sqlite')
  const env = {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_PORT: String(port),
    OMNI_ORGA_RUNTIME_DIR: join(directory, 'runtime'),
    OMNI_ORGA_DATABASE_PATH: databasePath,
  }
  const development = spawn(
    process.execPath,
    ['scripts/lifecycle.mjs', 'dev'],
    { cwd: checkout, env, stdio: 'ignore' },
  )

  try {
    await waitForExpectedPage(port)

    const status = runLifecycle('status', env)
    assert.equal(status.status, 0, status.stderr)
    assert.match(status.stdout, /^PID: \d+$/m)
    assert.match(status.stdout, /^mode: development$/m)
    assert.match(status.stdout, /^health: healthy$/m)

    const database = openDatabase(databasePath)
    assert.equal(
      database.prepare('SELECT count(*) AS count FROM schema_migrations').get().count,
      1,
    )
    database.close()

    development.kill('SIGTERM')
    await new Promise((resolve) => development.once('exit', resolve))
    const stopped = runLifecycle('status', env)
    assert.match(stopped.stdout, /^mode: stopped$/m)
  } finally {
    development.kill('SIGTERM')
    runLifecycle('stop', env)
  }
})

test('stop refuses a PID that is not attributed to this checkout', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-unowned-'))
  const runtimeDirectory = join(directory, 'runtime')
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
  })
  const env = {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_RUNTIME_DIR: runtimeDirectory,
    OMNI_ORGA_DATABASE_PATH: join(directory, 'omni-orga.sqlite'),
  }

  try {
    await mkdir(runtimeDirectory)
    await writeFile(
      join(runtimeDirectory, 'server.json'),
      JSON.stringify({
        checkout: fileURLToPath(checkout).replace(/\/$/, ''),
        pid: unrelated.pid,
        mode: 'normal',
        token: 'not-owned',
        url: 'http://127.0.0.1:4310',
      }),
    )

    const result = runLifecycle('stop', env)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /refusing to stop/)
    assert.doesNotThrow(() => process.kill(unrelated.pid, 0))

    const status = runLifecycle('status', env)
    assert.equal(status.status, 0, status.stderr)
    assert.match(status.stdout, /^PID: none$/m)
    assert.match(status.stdout, /^mode: stopped$/m)
    assert.match(status.stdout, /^health: stopped$/m)
    await assert.rejects(access(join(runtimeDirectory, 'server.json')))
    assert.doesNotThrow(() => process.kill(unrelated.pid, 0))
  } finally {
    unrelated.kill('SIGTERM')
  }
})
