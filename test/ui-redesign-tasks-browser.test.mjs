import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createDomainStore } from '../src/domain/store.ts'

const directory = await mkdtemp(join(tmpdir(), 'omni-redesign-tasks-'))
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const url = `http://127.0.0.1:${port}`
const database = join(directory, 'test.sqlite')
const env = { ...process.env, OMNI_ORGA_TEST: '1', OMNI_ORGA_PORT: String(port), OMNI_ORGA_RUNTIME_DIR: join(directory, 'runtime'), OMNI_ORGA_DATABASE_PATH: database }
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
function lifecycle(command) {
  const result = spawnSync(process.execPath, ['scripts/lifecycle.mjs', command], { env, cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 60000 })
  assert.equal(result.status, 0, result.stderr)
}
let browser
let page
let writing
before(async () => {
  const store = createDomainStore(database)
  writing = store.createGoal({ title: 'Writing', kind: 'ongoing' })
  const home = store.createGoal({ title: 'Home', kind: 'ongoing' })
  const health = store.createGoal({ title: 'Health', kind: 'ongoing' })
  for (const goal of [writing, home, health]) store.setGoalPriority(goal.id, true)
  for (const [title, goal] of [['Draft the project outline', writing], ['Put up the bookshelf', home], ['Send the draft notes', writing]]) {
    store.createTask({ title, goalIds: [goal.id], scheduledDay: today })
  }
  const finished = store.createTask({ title: 'Clear the desk', goalIds: [home.id], deadline: '2020-01-01' })
  store.completeTask(finished.id)
  store.createTask({ title: 'Unlinked task' })
  store.close()
  lifecycle('start')
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
})
after(async () => { await browser?.close(); lifecycle('stop') })
const titles = () => page.locator('.today-open .task-name').allTextContents()
async function beginDrag() {
  const rows = page.locator('.today-open .task-row')
  const first = await rows.nth(0).boundingBox()
  const last = await rows.nth(2).boundingBox()
  // Drag the blank row area, not its link or completion button.
  await page.mouse.move(first.x + first.width - 15, first.y + first.height - 5)
  await page.mouse.down()
  await page.waitForTimeout(400)
  await page.mouse.move(last.x + last.width - 15, last.y + last.height - 10)
}

test('Today cancels drag previews and restores a rejected save', async () => {
  await page.goto(url)
  const original = await titles()
  assert.equal(original.length, 3)
  await beginDrag()
  assert.notDeepEqual(await titles(), original)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  assert.deepEqual(await titles(), original)

  await page.route('**/*', route => route.request().method() === 'POST' ? route.abort() : route.continue())
  await beginDrag()
  await page.mouse.up()
  await page.getByRole('status').waitFor()
  assert.match(await page.getByRole('status').textContent(), /Could not save/)
  assert.deepEqual(await titles(), original)
  await page.unroute('**/*')
  await page.reload()
  assert.deepEqual(await titles(), original)
})

test('No goal and selected-goal headings survive navigation and reload', async () => {
  await page.goto(`${url}/tasks?goal=none&available=1`)
  await page.getByRole('heading', { name: 'No goal', exact: true }).waitFor()
  assert.deepEqual(await page.locator('.task-list .task-name').allTextContents(), ['Unlinked task'])
  await page.reload()
  assert.match(page.url(), /goal=none/)
  await page.goto(`${url}/tasks?goal=${writing.id}&available=1`)
  await page.getByRole('heading', { name: 'Writing', exact: true }).waitFor()
  await page.goto(`${url}/tasks?view=completed`)
  assert.equal(await page.locator('.task-list .schedule-menu').count(), 0)
  assert.equal(await page.locator('.task-list .overdue-chip').count(), 0)
  assert.match(await page.locator('.task-list').textContent(), /Clear the desk/)
})

test('Phone list controls and inherited form font fit the viewport', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${url}/tasks?available=1`)
  const tabs = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')
  assert.equal(await tabs.count(), 5)
  for (const tab of await tabs.all()) {
    const box = await tab.boundingBox()
    assert.ok(box && box.height >= 44 && box.y + box.height <= 844)
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390)
  await page.getByRole('button', { name: 'New task', exact: true }).click()
  const font = await page.locator('input').first().evaluate(input => getComputedStyle(input).fontFamily)
  assert.match(font, /Outfit/)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390)
})
