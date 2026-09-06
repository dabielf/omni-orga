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
})
after(async () => {
  await browser?.close()
  const result = lifecycle('stop')
  assert.equal(result.status, 0, result.stderr)
  await rm(directory, { recursive: true, force: true })
})
const nav = label => page.locator('.global-links-plain').getByRole('link', { name: label, exact: true }).click()
async function visible(locator) { await locator.waitFor({ state: 'visible', timeout: 5000 }) }

test('saved tasks stay fresh on repeated visits and browser history', async () => {
  await page.goto(url)
  await nav('Goals')
  await page.getByRole('button', { name: 'New goal', exact: true }).click()
  await page.getByRole('textbox', { name: 'Goal name' }).fill('Fresh goal')
  await page.getByRole('button', { name: 'Create goal', exact: true }).click()
  await visible(page.getByRole('link', { name: 'Fresh goal', exact: true }))
  await nav('Stats')
  await nav('Calendar')
  await nav('Tasks')
  await page.getByRole('button', { name: 'New task', exact: true }).click()
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Freshness check')
  await page.getByRole('checkbox', { name: 'Add to Today' }).check()
  await page.getByText('+ Add goal', { exact: true }).click()
  await page.getByRole('button', { name: 'Fresh goal', exact: true }).click()
  await page.getByRole('button', { name: 'Create task', exact: true }).click()
  await visible(page.getByRole('link', { name: 'Freshness check', exact: true }))
  await nav('Today')
  await visible(page.getByRole('button', { name: 'Complete Freshness check', exact: true }))
  await nav('Tasks')
  await visible(page.getByRole('link', { name: 'Freshness check', exact: true }))
  await page.goBack()
  await visible(page.getByRole('button', { name: 'Complete Freshness check', exact: true }))
  await page.goForward()
  await visible(page.getByRole('link', { name: 'Freshness check', exact: true }))
  await page.getByRole('link', { name: 'Freshness check', exact: true }).click()
  await page.getByRole('button', { name: '› More options' }).click()
  const linkDraft = page.getByPlaceholder('Add a URL, one at a time')
  await linkDraft.fill('https://unsaved.example')
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Renamed task')
  await linkDraft.focus()
  await page.waitForLoadState('networkidle')
  assert.equal(await linkDraft.inputValue(), 'https://unsaved.example')
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await nav('Calendar')
  await page.locator('.cal-grid').getByRole('link', { name: /^Today,/ }).click()
  await page.locator('.cal-panel .cal-row').filter({ hasText: 'Renamed task' }).getByRole('button', { name: 'Move', exact: true }).click()
  await page.getByRole('button', { name: 'Tomorrow', exact: true }).click()
  await nav('Today')
  await visible(page.getByText('Nothing planned for today', { exact: true }))
  await nav('Tasks')
  await visible(page.locator('summary.when-chip').filter({ hasText: 'Tomorrow' }))
  await nav('Calendar')
  await page.locator('.cal-grid').getByRole('link', { name: /^Tomorrow,/ }).click()
  await page.locator('.cal-panel .cal-row').filter({ hasText: 'Renamed task' }).getByRole('button', { name: 'Move', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Today', exact: true }).click()
  await nav('Today')
  await page.getByRole('button', { name: 'Complete Renamed task', exact: true }).click()
  await visible(page.getByRole('button', { name: 'Undo Renamed task', exact: true }))
  await nav('Goals')
  await visible(page.getByText('1 of 1', { exact: false }))
  await nav('Stats')
  await visible(page.getByText('1 of 1 tasks done. 100% in total.', { exact: true }))
  await nav('Today')
  await page.getByRole('button', { name: 'Undo Renamed task', exact: true }).click()
  await visible(page.getByRole('button', { name: 'Complete Renamed task', exact: true }))
  await nav('Stats')
  await visible(page.getByText('0 of 1 tasks done. 0% in total.', { exact: true }))
  await nav('Tasks')
  await page.getByRole('link', { name: 'Renamed task', exact: true }).click()
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await visible(page.getByRole('button', { name: 'Restore', exact: true }))
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await nav('Calendar')
  assert.equal(await page.locator('.cal-task-name').filter({ hasText: 'Renamed task' }).count(), 0)
  await nav('Tasks')
  await page.getByRole('link', { name: /Archived/ }).click()
  assert.match(page.url(), /view=archived/)
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await nav('Today')
  await visible(page.getByRole('button', { name: 'Complete Renamed task', exact: true }))
  await nav('Tasks')
  await visible(page.getByRole('link', { name: 'Renamed task', exact: true }))
  await nav('Goals')
  await page.getByRole('link', { name: 'Fresh goal', exact: true }).click()
  await page.getByRole('button', { name: 'Priority', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.goal-priority-btn')?.getAttribute('aria-pressed') === 'true')
  await nav('Today')
  await visible(page.getByRole('link', { name: 'Fresh goal', exact: true }))
})

test('failed fresh loads offer retry without a page reload', async () => {
  await page.goto(url + '/tasks')
  await page.route('**/_serverFn/**', route => route.request().method() === 'GET' ? route.abort() : route.continue())
  await nav('Calendar')
  await visible(page.getByRole('alert'))
  await page.unroute('**/_serverFn/**')
  await page.getByRole('button', { name: 'Try again' }).click()
  await visible(page.getByRole('heading', { name: 'Calendar', exact: true }))
})

test('a failed refresh preserves a task form and its unsaved input', async () => {
  await page.goto(url + '/tasks')
  await page.getByRole('link', { name: 'Renamed task', exact: true }).click()
  await page.getByRole('button', { name: '› More options' }).click()
  const draft = page.getByPlaceholder('Add a URL, one at a time')
  await draft.fill('https://keep-this.example')
  await page.route('**/_serverFn/**', route => route.request().method() === 'GET' ? route.abort() : route.continue())
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Saved through failure')
  await draft.focus()
  await visible(page.getByRole('alert'))
  assert.equal(await draft.inputValue(), 'https://keep-this.example')
  await page.unroute('**/_serverFn/**')
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByRole('alert').waitFor({ state: 'hidden' })
  assert.equal(await draft.inputValue(), 'https://keep-this.example')
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await visible(page.getByRole('link', { name: 'Saved through failure', exact: true }))
})

test('an older loader response cannot undo a newer saved change', { timeout: 15000 }, async () => {
  await page.goto(url + '/tasks')
  await page.getByRole('link', { name: 'Saved through failure', exact: true }).click()
  let release
  const held = new Promise(resolve => { release = resolve })
  let captured
  const ready = new Promise(resolve => { captured = resolve })
  let first = true
  await page.route('**/_serverFn/**', async route => {
    if (!first || route.request().method() !== 'GET') return route.continue()
    first = false
    const response = await route.fetch()
    captured()
    await held
    await route.fulfill({ response }).catch(() => {}) // Superseded requests may be aborted.
  })
  try {
    const title = page.getByRole('textbox', { name: 'Task name', exact: true })
    await title.fill('Earlier name')
    await title.blur()
    await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(new Error('No delayed loader request')), 5000))])
    const refreshed = page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('/_serverFn/'))
    await title.fill('Newest name')
    await title.blur()
    await refreshed
    release()
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Close', exact: true }).first().click()
    await visible(page.getByRole('link', { name: 'Newest name', exact: true }))
    assert.equal(await page.getByRole('link', { name: 'Earlier name', exact: true }).count(), 0)
  } finally {
    release()
    await page.unroute('**/_serverFn/**')
  }
})

test('a failed save keeps the creation draft and does not create a task', async () => {
  await page.goto(url + '/tasks')
  await page.getByRole('button', { name: 'New task', exact: true }).click()
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Do not save')
  await page.route('**/_serverFn/**', route => route.request().method() === 'POST' ? route.abort() : route.continue())
  const failed = page.waitForEvent('requestfailed', request => request.method() === 'POST')
  await page.getByRole('button', { name: 'Create task', exact: true }).click()
  await failed
  assert.equal(await page.getByRole('textbox', { name: 'Task name', exact: true }).inputValue(), 'Do not save')
  await visible(page.getByRole('dialog', { name: 'New task', exact: true }))
  await page.unroute('**/_serverFn/**')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await nav('Today')
  await nav('Tasks')
  assert.equal(await page.getByRole('link', { name: 'Do not save', exact: true }).count(), 0)
})
