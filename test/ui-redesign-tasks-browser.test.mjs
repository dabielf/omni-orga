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


test('Today covers no-priority, full-coverage, all-completed and single-open states', async () => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const store = createDomainStore(database)
  for (const goal of store.listGoals({})) store.setGoalPriority(goal.id, false)
  store.close()
  await page.goto(url)
  assert.deepEqual(await page.locator('.today-coverage .today-none').allTextContents(), ['None', 'None'])
  const priorityStore = createDomainStore(database)
  for (const goal of priorityStore.listGoals({}).filter(goal => goal.title !== 'Health')) priorityStore.setGoalPriority(goal.id, true)
  priorityStore.close()
  await page.reload()
  assert.deepEqual(await page.locator('.today-coverage > div:first-child .today-goal').allTextContents(), ['Writing', 'Home'])
  assert.equal(await page.locator('.today-coverage > div:last-child').textContent(), 'Not covered todayNone')
  for (let remaining = 2; remaining >= 0; remaining--) {
    await page.locator('.today-open .task-circle').first().click()
    await page.waitForFunction(count => document.querySelectorAll('.today-open .task-circle').length === count, remaining)
  }
  assert.equal(await page.locator('.today-counts').textContent(), 'No open tasks.')
  assert.equal(await page.locator('.today-open').count(), 0)
  await page.getByRole('button', { name: 'Undo Draft the project outline', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.today-open .task-circle').length === 1)
  assert.equal(await page.locator('.today-hold').count(), 0)
})

test('Phone Views closes after selection and keeps combined filters', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${url}/tasks?available=1&ideal=none`)
  await page.locator('.task-rail-menu > summary').click()
  await page.locator('.task-rail-menu').getByRole('link', { name: 'No goal', exact: true }).click()
  await page.waitForURL(url => url.searchParams.get('goal') === 'none' && url.searchParams.get('ideal') === 'none' && url.searchParams.get('available') === '1')
  assert.equal(await page.locator('.task-rail-menu').getAttribute('open'), null)
  assert.equal(await page.locator('.task-rail-menu > summary').textContent(), 'No goal')
  assert.deepEqual(await page.locator('.task-list .task-name').allTextContents(), ['Unlinked task'])
  await page.reload()
  assert.equal(new URL(page.url()).searchParams.get('ideal'), 'none')
  assert.equal(new URL(page.url()).searchParams.get('available'), '1')
})

test('Long names wrap, goal overflow opens the sheet, and archive restoration has Undo', async () => {
  const store = createDomainStore(database)
  const secondGoal = store.listGoals({}).find(goal => goal.title === 'Home')
  const title = 'Review the project notes and supporting links before sending the final draft '.repeat(4).trim()
  store.createTask({ title, goalIds: [writing.id, secondGoal.id] })
  const archived = store.createTask({ title: 'Archived task for restoration' })
  store.archiveTask(archived.id)
  store.close()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${url}/tasks?available=1`)
  const overflow = page.getByRole('link', { name: `Show all goals for ${title}`, exact: true })
  await overflow.scrollIntoViewIfNeeded()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390)
  await overflow.click()
  await page.getByRole('dialog').waitFor()
  assert.match(await page.getByRole('dialog').textContent(), /Writing/)
  assert.match(await page.getByRole('dialog').textContent(), /Home/)
  await page.goto(`${url}/tasks?view=archived`)
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await page.getByText('Task restored.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.locator('.task-list .task-name').getByText('Archived task for restoration', { exact: true }).waitFor()
})
