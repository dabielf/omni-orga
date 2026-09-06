import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium } from 'playwright'

const directory = await mkdtemp(join(tmpdir(), 'omni-freshness-'))
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const url = `http://127.0.0.1:${port}`
const env = { ...process.env, OMNI_ORGA_TEST: '1', OMNI_ORGA_PORT: String(port),
  OMNI_ORGA_DATABASE_PATH: join(directory, 'db.sqlite'),
  OMNI_ORGA_RUNTIME_DIR: join(directory, 'runtime') }
const lifecycle = command => spawnSync(process.execPath, ['scripts/lifecycle.mjs', command], { env, encoding: 'utf8', timeout: 30000 })
let browser
let page
before(async () => {
  const result = lifecycle('start')
  assert.equal(result.status, 0, result.stderr)
  // Install once with: pnpm exec playwright install chromium
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage()
  page.setDefaultTimeout(5000)
  await page.clock.install()
})
after(async () => {
  await browser?.close()
  const result = lifecycle('stop')
  assert.equal(result.status, 0, result.stderr)
  await rm(directory, { recursive: true, force: true })
})
const nav = label => page.locator('.global-links-plain').getByRole('link', { name: label, exact: true }).click()
async function visible(locator) { await locator.waitFor({ state: 'visible', timeout: 5000 }) }

test('refresh retry stays usable inside a task dialog', async () => {
  await page.goto(url + '/tasks')
  await page.getByRole('button', { name: 'New task', exact: true }).click()
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Shared task')
  await page.getByRole('button', { name: 'Create task', exact: true }).click()
  await page.getByRole('link', { name: 'Shared task', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Task', exact: true })
  await page.route('**/_serverFn/**', route => route.request().method() === 'GET' ? route.abort() : route.continue())
  await dialog.getByRole('textbox', { name: 'Task name', exact: true }).fill('Shared task renamed')
  await dialog.getByRole('textbox', { name: 'Task name', exact: true }).blur()
  await visible(dialog.getByRole('alert'))
  await page.unroute('**/_serverFn/**')
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click()
  await dialog.getByRole('alert').waitFor({ state: 'hidden' })
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click()
  await visible(page.getByRole('link', { name: 'Shared task renamed', exact: true }))
})


test('slow initial navigation keeps the shell and shows a delayed loading state', async () => {
  await page.goto(url + '/tasks')
  let release, captured
  const held = new Promise(resolve => { release = resolve })
  const ready = new Promise(resolve => { captured = resolve })
  await page.route('**/_serverFn/**', async route => {
    if (route.request().method() !== 'GET') return route.continue()
    captured()
    await held
    await route.continue().catch(() => {})
  })
  try {
    await nav('Calendar')
    await ready
    await visible(page.getByRole('navigation', { name: 'Main navigation' }))
    await page.clock.fastForward(250)
    await visible(page.getByRole('status').filter({ hasText: 'Loading…' }))
    assert.equal(await page.getByRole('navigation', { name: 'Main navigation' }).count(), 1)
    release()
    await visible(page.getByRole('heading', { name: 'Calendar', exact: true }))
  } finally { release(); await page.unroute('**/_serverFn/**') }
})

async function createTask(title, today = false) {
  await page.getByRole('button', { name: 'New task', exact: true }).click()
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill(title)
  if (today) await page.getByRole('checkbox', { name: 'Add to Today', exact: true }).check()
  await page.getByRole('button', { name: 'Create task', exact: true }).click()
  await visible(page.getByRole('link', { name: title, exact: true }))
}

test('phone day list exposes every task and nested Move restores focus and retries safely', async () => {
  await page.goto(url + '/tasks')
  for (let i = 1; i <= 8; i++) await createTask(`Day task ${i}`, true)
  await page.setViewportSize({ width: 390, height: 844 })
  await nav('Calendar')
  await page.locator('.cal-grid').getByRole('link', { name: /^Today,/ }).click()
  const view = page.getByRole('button', { name: 'View 8 tasks', exact: true })
  await view.click()
  const day = page.getByRole('dialog', { name: 'Today', exact: true })
  assert.equal(await day.locator('.cal-row').count(), 8)
  const move = day.locator('.cal-row').filter({ hasText: 'Day task 8' }).getByRole('button', { name: 'Move', exact: true })
  await move.click()
  const dialog = page.getByRole('dialog', { name: 'Move Day task 8', exact: true })
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Tab')
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true)
  }
  await page.keyboard.press('Escape')
  assert.equal(await move.evaluate(el => el === document.activeElement), true)
  await day.getByRole('button', { name: 'Close', exact: true }).click()
  assert.equal(await view.evaluate(el => el === document.activeElement), true)
  await view.click()
  await move.click()
  let fail = true
  let posts = 0
  await page.route('**/_serverFn/**', route => {
    if (route.request().method() !== 'POST') return route.continue()
    posts++
    return fail ? route.abort() : route.continue()
  })
  await dialog.getByRole('button', { name: 'Tomorrow', exact: true }).click()
  await visible(dialog.getByRole('alert'))
  assert.equal(await dialog.isVisible(), true)
  fail = false
  await dialog.getByRole('button', { name: 'Tomorrow', exact: true }).dblclick({ force: true })
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(posts, 2)
  await page.unroute('**/_serverFn/**')
  await day.locator('.cal-row').filter({ hasText: 'Day task 8' }).waitFor({ state: 'detached' })
  assert.equal(await day.locator('.cal-row').count(), 7)
  assert.ok(await day.evaluate(el => el.scrollWidth <= el.clientWidth))
  if (process.env.OMNI_SHARED_SCREENSHOTS) await page.screenshot({ path: '/tmp/shared-calendar-full-day.png' })
  await page.keyboard.press('Escape')
})

test('expired ancestor deadlines remain hard limits in Calendar', async () => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(url + '/tasks')
  await createTask('Past parent deadline')
  await page.getByRole('link', { name: 'Past parent deadline', exact: true }).click()
  const task = page.getByRole('dialog', { name: 'Task', exact: true })
  const yesterday = new Date(Date.now() - 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  await task.getByLabel('Deadline', { exact: true }).fill(yesterday)
  await task.getByRole('button', { name: '+ Add subtask', exact: true }).click()
  await task.getByRole('textbox', { name: 'New subtask name' }).fill('Child with past limit')
  await page.keyboard.press('Enter')
  await visible(task.getByRole('button', { name: 'Delete Child with past limit', exact: true }))
  await task.getByRole('button', { name: 'Close', exact: true }).first().click()
  await nav('Calendar')
  await page.locator('.cal-pool .cal-row').filter({ hasText: 'Child with past limit' }).getByRole('button', { name: 'Plan', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Move Child with past limit', exact: true })
  assert.equal(await dialog.locator('.cal-day-picker button:disabled').count(), 14)
  await visible(dialog.getByText(/The parent deadline is/))
  await page.keyboard.press('Escape')
})

test('long task sheets scroll without overlapping fields and respect reduced motion', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url + '/tasks')
  await createTask('Long task details')
  await page.getByRole('link', { name: 'Long task details', exact: true }).click()
  const task = page.getByRole('dialog', { name: 'Task', exact: true })
  await task.getByRole('button', { name: '› More options' }).click()
  await task.getByRole('textbox', { name: 'Notes', exact: true }).fill('Working notes with several paragraphs.\n'.repeat(12))
  for (let i = 1; i <= 9; i++) {
    await task.getByRole('button', { name: '+ Add subtask', exact: true }).click()
    await task.getByRole('textbox', { name: 'New subtask name' }).fill(`Step ${i}: check a long task title and keep its actions reachable`)
    await page.keyboard.press('Enter')
    await visible(task.getByRole('button', { name: `Delete Step ${i}: check a long task title and keep its actions reachable`, exact: true }))
  }
  await task.locator('.task-sheet').evaluate(el => { el.scrollTop = 0 })
  const layout = await task.locator('.task-sheet').evaluate(sheet => {
    const children = Array.from(sheet.children).filter(el => el.getClientRects().length)
    return {
      overflows: sheet.scrollWidth > sheet.clientWidth,
      overlaps: children.slice(1).flatMap((el, i) => children[i].getBoundingClientRect().bottom > el.getBoundingClientRect().top + 1 ? [{ previous: children[i].className, current: el.className, previousBottom: children[i].getBoundingClientRect().bottom, currentTop: el.getBoundingClientRect().top }] : []),
      scrolls: sheet.scrollHeight > sheet.clientHeight,
      motion: getComputedStyle(sheet.querySelector('button')).transitionDuration,
    }
  })
  await task.locator('.task-sheet').evaluate(el => { el.scrollTop = 0 })
  if (process.env.OMNI_SHARED_SCREENSHOTS) await page.screenshot({ path: '/tmp/shared-long-task-top.png' })
  assert.equal(layout.overflows, false)
  assert.deepEqual(layout.overlaps, [])
  assert.equal(layout.scrolls, true)
  assert.ok(parseFloat(layout.motion) < .001)
  await task.locator('.task-sheet').evaluate(el => { el.scrollTop = 0 })
  if (process.env.OMNI_SHARED_SCREENSHOTS) await page.screenshot({ path: '/tmp/shared-long-task-top.png' })
  await task.getByRole('button', { name: 'Close', exact: true }).last().scrollIntoViewIfNeeded()
  if (process.env.OMNI_SHARED_SCREENSHOTS) await page.screenshot({ path: '/tmp/shared-long-task-bottom.png' })
  await task.getByRole('button', { name: 'Close', exact: true }).last().click()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
})

test('missing tasks, missing goals and unknown pages have working return links', async () => {
  await page.goto(url + '/tasks/t_missing')
  await visible(page.getByText('Task not found', { exact: true }))
  await page.getByRole('link', { name: 'Open Tasks', exact: true }).click()
  assert.equal(new URL(page.url()).pathname, '/tasks')
  await page.goto(url + '/goals/g_missing')
  await visible(page.getByText('Goal not found', { exact: true }))
  await page.getByRole('link', { name: 'Open Goals', exact: true }).click()
  assert.equal(new URL(page.url()).pathname, '/goals')
  const response = await page.goto(url + '/not-a-page')
  assert.equal(response.status(), 404)
  await visible(page.getByRole('heading', { name: 'Page not found', exact: true }))
  await page.getByRole('link', { name: 'Today', exact: true }).click()
  assert.equal(new URL(page.url()).pathname, '/')
})


test('failed Stats period refresh preserves confirmed period until retry', async () => {
  await page.goto(url + '/stats')
  const periods = page.getByRole('navigation', { name: 'Stats period', exact: true })
  const totals = await page.locator('.stats-counters').innerText()
  await page.route('**/_serverFn/**', route => route.request().method() === 'GET' ? route.abort() : route.continue())
  await periods.getByRole('link', { name: '90 days', exact: true }).click()
  await visible(page.getByRole('alert'))
  assert.equal(await page.locator('.stats-counters').innerText(), totals)
  assert.equal(await periods.getByRole('link', { name: '30 days', exact: true }).getAttribute('aria-current'), 'page')
  assert.equal(await periods.getByRole('link', { name: '90 days', exact: true }).getAttribute('aria-current'), null)
  await page.unroute('**/_serverFn/**')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await page.getByRole('alert').waitFor({ state: 'hidden' })
  assert.equal(await periods.getByRole('link', { name: '90 days', exact: true }).getAttribute('aria-current'), 'page')
})

test('success and failed-refresh notices stay distinct and pause dismissal while read', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(url + '/goals')
  await page.getByRole('button', { name: 'New goal', exact: true }).click()
  await page.getByRole('textbox', { name: 'Goal name', exact: true }).fill('Notice coverage')
  await page.route('**/_serverFn/**', route => route.request().method() === 'GET' ? route.abort() : route.continue())
  await page.getByRole('button', { name: 'Create goal', exact: true }).click()
  const success = page.getByRole('status').filter({ hasText: 'Goal created.' })
  const stale = page.getByRole('alert').filter({ hasText: 'Could not refresh' })
  await visible(success)
  await visible(stale)
  const a = await success.boundingBox(), b = await stale.boundingBox()
  assert.ok(a.y + a.height <= b.y || b.y + b.height <= a.y, 'Notices must not overlap')
  await success.hover()
  await page.clock.fastForward(7000)
  assert.equal(await success.isVisible(), true)
  await page.mouse.move(1, 1)
  await page.clock.fastForward(6100)
  await success.waitFor({ state: 'hidden' })
  assert.equal(await stale.isVisible(), true)
  const tabs = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox()
  const banner = await stale.boundingBox()
  assert.ok(banner.y + banner.height <= tabs.y)
  await page.unroute('**/_serverFn/**')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await stale.waitFor({ state: 'hidden' })
})

test('task Undo stays usable in the phone sheet, pauses on focus, then clears phone tabs', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(url + '/tasks')
  await createTask('Undo notice task')
  await page.getByRole('link', { name: 'Undo notice task', exact: true }).click()
  const task = page.getByRole('dialog', { name: 'Task', exact: true })
  await task.getByLabel('Ideal completion date', { exact: true }).fill('2030-09-01')
  await page.waitForLoadState('networkidle')
  await task.getByLabel('Deadline', { exact: true }).fill('2030-09-02')
  const notice = task.getByRole('status').filter({ hasText: 'Ideal completion date removed.' })
  await visible(notice)
  const undo = notice.getByRole('button', { name: 'Undo', exact: true })
  await undo.focus()
  await page.clock.fastForward(7000)
  assert.equal(await notice.isVisible(), true)
  const box = await notice.boundingBox()
  const footer = await task.locator('.form-foot').boundingBox()
  assert.ok(box.y + box.height <= footer.y, 'Notice must clear sheet actions')
  if (process.env.OMNI_SHARED_SCREENSHOTS) await page.screenshot({ path: '/tmp/shared-task-undo.png' })
  await undo.click()
  await page.waitForFunction(() => Array.from(document.querySelectorAll('dialog label')).find(label => label.textContent === 'Ideal completion date')?.querySelector('input')?.value === '2030-09-01')
  assert.equal(await task.getByLabel('Ideal completion date', { exact: true }).inputValue(), '2030-09-01')
  assert.equal(await task.getByLabel('Deadline', { exact: true }).inputValue(), '')
  await task.getByRole('button', { name: 'Archive', exact: true }).click()
  await visible(task.getByRole('status').filter({ hasText: 'Task archived.' }))
  await task.getByRole('button', { name: 'Close', exact: true }).first().click()
  const restoredNotice = page.getByRole('status').filter({ hasText: 'Task archived.' })
  await visible(restoredNotice)
  const tabs = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox()
  const banner = await restoredNotice.boundingBox()
  assert.ok(banner.y + banner.height <= tabs.y)
  await restoredNotice.getByRole('button', { name: 'Undo', exact: true }).click()
  await visible(page.getByRole('link', { name: 'Undo notice task', exact: true }))
})
