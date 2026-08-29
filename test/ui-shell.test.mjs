import { after, before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDomainStore } from '../src/domain/store.ts'

const checkout = new URL('..', import.meta.url)
const directory = await mkdtemp(join(tmpdir(), 'omni-orga-ui-shell-'))
const port = await unusedPort()
const url = `http://127.0.0.1:${port}`
const env = {
  ...process.env,
  OMNI_ORGA_TEST: '1',
  OMNI_ORGA_PORT: String(port),
  OMNI_ORGA_RUNTIME_DIR: join(directory, 'runtime'),
  OMNI_ORGA_DATABASE_PATH: join(directory, 'omni-orga.sqlite'),
}

function runLifecycle(command) {
  return spawnSync(process.execPath, ['scripts/lifecycle.mjs', command], {
    cwd: checkout,
    encoding: 'utf8',
    env,
    timeout: 30_000,
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
let seededGoalId

before(() => {
  const started = runLifecycle('start')
  assert.equal(started.status, 0, started.stderr)
  // The goals routes render real store data now; seed one record so a
  // known opaque goal id still resolves server-side.
  const store = createDomainStore(env.OMNI_ORGA_DATABASE_PATH)
  const seeded = store.createGoal({ title: 'Steady work', kind: 'ongoing' })
  store.close()
  seededGoalId = seeded.id
})

after(() => {
  runLifecycle('stop')
})

test('every shell page and known opaque record renders', async () => {
  const pages = [
    ['/', 'Today'],
    ['/goals', 'Goals'],
    ['/goals/' + seededGoalId, 'Steady work'],
    ['/tasks', 'Tasks'],
    ['/calendar', 'Calendar'],
    ['/stats', 'Stats'],
  ]

  for (const [path, heading] of pages) {
    const response = await fetch(`${url}${path}`)
    const html = await response.text()
    assert.equal(response.status, 200, path)
    assert.match(html, new RegExp(`<h1[^>]*>${heading}</h1>`), path)
    assert.match(html, /data-omni-orga="app"/, path)
  }
})

test('unknown records and pages give factual return paths', async () => {
  const missingGoal = await fetch(`${url}/goals/g_missing`)
  const goalHtml = await missingGoal.text()
  assert.match(goalHtml, />Goal not found</)
  assert.match(goalHtml, /href="\/goals"[^>]*>Goals</)

  const missingTask = await fetch(`${url}/tasks/t_missing`)
  const taskHtml = await missingTask.text()
  assert.match(taskHtml, />Task not found</)
  assert.match(taskHtml, /href="\/tasks"[^>]*>Tasks</)

  const unknown = await fetch(`${url}/not-a-page`)
  const unknownHtml = await unknown.text()
  assert.equal(unknown.status, 404)
  assert.match(unknownHtml, />Page not found</)
  assert.match(unknownHtml, /href="\/"[^>]*>Today</)
})
