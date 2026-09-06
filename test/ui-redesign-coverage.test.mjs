import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium } from 'playwright'
import { createDomainStore } from '../src/domain/store.ts'

const directory = await mkdtemp(join(tmpdir(), 'omni-redesign-coverage-'))
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const url = `http://127.0.0.1:${port}`
const database = join(directory, 'db.sqlite')
const env = {
  ...process.env, OMNI_ORGA_TEST: '1', OMNI_ORGA_PORT: String(port),
  OMNI_ORGA_DATABASE_PATH: database, OMNI_ORGA_RUNTIME_DIR: join(directory, 'runtime'),
}
const lifecycle = command => spawnSync(process.execPath, ['scripts/lifecycle.mjs', command], {env, encoding:'utf8', timeout:30000})
const withStore = run => {
  const store = createDomainStore(database)
  try { return run(store) } finally { store.close() }
}
let browser, page
before(async () => {
  const started = lifecycle('start')
  assert.equal(started.status, 0, started.stderr)
  browser = await chromium.launch({headless:true})
  page = await browser.newPage({viewport:{width:1280,height:800}})
  page.setDefaultTimeout(5000)
})
after(async () => {
  await browser?.close()
  const stopped = lifecycle('stop')
  assert.equal(stopped.status, 0, stopped.stderr)
  await rm(directory, {recursive:true,force:true})
})
const button = name => page.getByRole('button', {name,exact:true})
const visible = locator => locator.waitFor({state:'visible'})
async function screenshot(name) {
  if (!process.env.OMNI_REDESIGN_SCREENSHOTS) return
  await mkdir('output/playwright', {recursive:true})
  await page.screenshot({path:`output/playwright/redesign-${name}.png`})
}

// Keep the empty-database assertions before seeding this file's fixtures.
test('S01–S05 Stats keeps period counts separate from all-time zero and full progress', async () => {
  await page.goto(url+'/stats')
  await visible(page.getByText('No goals yet.',{exact:true}))
  assert.deepEqual(await page.locator('.stats-counter-number').allTextContents(), ['0','0','0'])
  for (const label of ['30 days','90 days','12 months']) await visible(page.getByRole('link',{name:label,exact:true}))
  assert.equal(await page.locator('.stats-goal,.goal-bar').count(), 0)
  const fixture = withStore(store => {
    const ongoing = store.createGoal({title:'Writing totals',kind:'ongoing'})
    store.createGoal({title:'Subgoal without a Stats section',kind:'one_shot',parentId:ongoing.id})
    const full = store.createGoal({title:'A finished task does not complete its goal',kind:'one_shot'})
    const zero = store.createGoal({title:'Zero progress',kind:'one_shot'})
    store.createTask({title:'Not yet done',goalIds:[zero.id]})
    store.createTask({title:'A repeatable with no completions',repeatable:true,goalIds:[ongoing.id]})
    const repeatable = store.createTask({title:'Earlier repeatable name',repeatable:true,goalIds:[ongoing.id]})
    const ago = days => new Date(Date.now()-days*86400000).toISOString()
    const fresh = store.completeTask(repeatable.id,ago(45)).freshTask
    store.updateTask(fresh.id,{title:'Write for 20 minutes'})
    store.completeTask(fresh.id,ago(2))
    const done = store.createTask({title:'One-shot work',goalIds:[full.id]})
    store.completeTask(done.id,ago(200))
    return {full}
  })
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:width === 390 ? 844 : 800})
    await page.goto(url+'/stats')
    const full = page.getByRole('region',{name:'A finished task does not complete its goal (one-shot)'})
    const zero = page.getByRole('region',{name:'Zero progress (one-shot)'})
    for (const [label,count,repeatCount,period] of [['30 days','1','1 time in 30 days','30'],['90 days','2','2 times in 90 days','90'],['12 months','3','2 times in 365 days','365']]) {
      await page.getByRole('link',{name:label,exact:true}).click()
      await visible(page.getByRole('link',{name:label,exact:true}).and(page.locator('[aria-current="page"]')))
      await page.waitForFunction(expected => document.querySelector('.stats-counter-number')?.textContent === expected, count)
      assert.match(await page.locator('.stats-repeatable').filter({hasText:'Write for 20 minutes'}).innerText(),new RegExp(repeatCount))
      assert.match(await page.locator('.stats-repeatable').filter({hasText:'A repeatable with no completions'}).innerText(),/0 times/)
      assert.match(await full.innerText(),/1 of 1 tasks done\. 100% in total/)
      assert.match(await zero.innerText(),/0 of 1 tasks done\. 0% in total/)
      assert.equal(await page.locator('.stats-goal-name').filter({hasText:'Subgoal without'}).count(),0)
      assert.equal(await page.locator('.stats-repeatable-name').filter({hasText:'Earlier repeatable name'}).count(),0)
      const bar = await full.locator('.goal-bar').evaluate(el => ({width:el.getBoundingClientRect().width, parent:el.parentElement.clientWidth, height:el.getBoundingClientRect().height, fill:getComputedStyle(el.firstElementChild).backgroundColor}))
      assert.ok(Math.abs(bar.width-bar.parent)<2, `Full-width Stats bar at ${width}: ${JSON.stringify(bar)}`)
      assert.equal(bar.height,6)
      assert.equal(bar.fill,'rgb(40, 91, 64)')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true)
      await screenshot(`stats-${period}-${width}`)
    }
  }
  assert.equal(withStore(store => store.getGoal(fixture.full.id).completedAt),null)
  // Zero recent activity still leaves the all-time completed goal work visible.
  withStore(store => {
    const histories = new Map(store.listTasks().filter(task => task.repeatable).map(task => [task.historyId,task.id]))
    for (const id of histories.values()) store.deleteTask(id)
  })
  await page.goto(url+'/stats')
  assert.equal(await page.locator('.stats-counter-number').first().textContent(),'0')
  assert.match(await page.getByRole('region',{name:'A finished task does not complete its goal (one-shot)'}).innerText(),/100% in total/)
})

test('F11/F12/F15 repeatable UI creates a clean copy and refuses earlier undo without losing history', async () => {
  const repeatable = withStore(store => store.createTask({
    title:'Repeatable browser check',repeatable:true,notes:'Notes survive each copy.',
    idealCompletionDate:new Date().toISOString().slice(0,10),externalLinks:['https://example.test/reference'],
  }))
  await page.setViewportSize({width:1280,height:800})
  await page.goto(url+'/tasks?available=1')
  await button('Complete Repeatable browser check').click()
  await visible(page.getByText('Task completed. A fresh copy is ready.',{exact:true}))
  const first = withStore(store => store.listTasks().find(task => task.sourceTaskId === repeatable.id))
  assert.ok(first)
  assert.equal(first.available,true)
  for (const field of ['completedAt','scheduledDay','idealCompletionDate','deadline']) assert.equal(first[field],null)
  assert.equal(first.notes,'Notes survive each copy.')
  assert.deepEqual(first.externalLinks,['https://example.test/reference'])
  await page.goto(url+'/tasks/'+first.id)
  const sheet = page.getByRole('dialog',{name:'Task',exact:true})
  await visible(sheet)
  await sheet.getByRole('button',{name:'› More options'}).click()
  assert.equal(await sheet.getByRole('textbox',{name:'Notes',exact:true}).inputValue(),'Notes survive each copy.')
  await visible(sheet.getByRole('link',{name:'https://example.test/reference',exact:true}))
  await page.keyboard.press('Escape')
  await page.goto(url+'/tasks?available=1')
  await button('Complete Repeatable browser check').click()
  await visible(page.getByText('Task completed. A fresh copy is ready.',{exact:true}))
  const latest = withStore(store => store.listTasks().find(task => task.sourceTaskId === first.id))
  assert.ok(latest)
  const historyBefore = withStore(store => store.listTasks({includeArchived:true}).filter(task => task.historyId === repeatable.historyId).map(task => [task.id,task.completedAt]))
  await page.goto(url+'/tasks/'+repeatable.id)
  await sheet.getByRole('button',{name:'Reopen',exact:true}).click()
  await visible(page.getByText('Only the latest repeatable completion can be undone',{exact:true}))
  assert.deepEqual(withStore(store => store.listTasks({includeArchived:true}).filter(task => task.historyId === repeatable.historyId).map(task => [task.id,task.completedAt])),historyBefore)
  const link = sheet.getByRole('link',{name:'Open latest copy',exact:true})
  assert.equal(await link.getAttribute('href'),'/tasks/'+latest.id)
  await link.click()
  await visible(sheet.getByRole('textbox',{name:'Task name',exact:true}))
  assert.ok(page.url().includes(latest.id))
  await screenshot('repeatable-latest')
})

test('G05/G11/G15 goal emptiness, active-child blocking and priority survive collapse correctly', async () => {
  const fixture = withStore(store => {
    const empty = store.createGoal({title:'Empty one-shot goal',kind:'one_shot'})
    const parent = store.createGoal({title:'Priority parent with a deliberately long name that wraps on a phone',kind:'one_shot'})
    const sub = store.createGoal({title:'A child that does not inherit priority',kind:'one_shot',parentId:parent.id})
    store.setGoalPriority(parent.id,true)
    return {empty,parent,sub}
  })
  await page.goto(url+'/goals/'+fixture.empty.id)
  await visible(button('Complete goal'))
  assert.equal(await button('Complete goal').isDisabled(),false)
  assert.equal(await page.locator('.goal-progress-line .goal-bar').count(),0)
  await page.goto(url+'/goals/'+fixture.parent.id)
  assert.equal(await button('Complete goal').isDisabled(),true)
  await visible(page.getByText('Complete or archive active subgoals first.',{exact:true}))
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:844})
    await page.goto(url+'/goals')
    const row = page.locator(`[data-goal-row="${fixture.parent.id}"]`)
    await row.getByRole('button',{name:'Collapse '+fixture.parent.title,exact:true}).click()
    assert.equal(await page.getByRole('link',{name:fixture.sub.title,exact:true}).count(),0)
    await row.getByRole('button',{name:'Expand '+fixture.parent.title,exact:true}).click()
    await visible(page.getByRole('link',{name:fixture.sub.title,exact:true}))
    assert.equal(await row.locator(':scope > .goal-row [aria-pressed="true"]').count(),1)
    assert.equal(await page.locator(`[data-goal-row="${fixture.sub.id}"] [aria-pressed="true"]`).count(),0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true)
    await screenshot(`goal-hierarchy-${width}`)
  }
  await page.goto(url+'/goals/'+fixture.sub.id)
  await button('Complete goal').click()
  await page.getByRole('dialog').getByRole('button',{name:'Complete goal',exact:true}).click()
  await visible(button('Reopen'))
  await page.goto(url+'/goals/'+fixture.parent.id)
  assert.equal(await button('Complete goal').isDisabled(),false)
})

test('G10 goal drag persists a successful move and leaves confirmed order on a rejected write', async () => {
  const fixture = withStore(store => {
    const parent = store.createGoal({title:'Drag siblings',kind:'ongoing'})
    const one = store.createGoal({title:'First sibling',kind:'one_shot',parentId:parent.id})
    const two = store.createGoal({title:'Second sibling',kind:'one_shot',parentId:parent.id})
    const three = store.createGoal({title:'Third sibling',kind:'one_shot',parentId:parent.id})
    return {parent,one,two,three}
  })
  await page.setViewportSize({width:1280,height:1000})
  await page.goto(url+'/goals')
  const row = id => page.locator(`[data-goal-row="${id}"] > .goal-row`)
  const dragBefore = async (from,to) => {
    await row(from).scrollIntoViewIfNeeded()
    const source = await row(from).boundingBox(), target = await row(to).boundingBox()
    await page.mouse.move(source.x+source.width/2,source.y+source.height-8)
    await page.mouse.down()
    await page.waitForTimeout(400)
    await page.mouse.move(target.x+target.width/2,target.y+8)
    await visible(row(to).and(page.locator('.is-drop-before')))
    await page.mouse.up()
  }
  await dragBefore(fixture.three.id,fixture.one.id)
  await visible(page.getByText('Goal reordered.',{exact:true}))
  assert.deepEqual(withStore(store => store.listGoals({parentId:fixture.parent.id}).map(goal => goal.id)),[fixture.three.id,fixture.one.id,fixture.two.id])
  await page.reload()
  const confirmed = await page.locator(`[data-goal-row="${fixture.parent.id}"] > .goal-subgoals > li`).evaluateAll(elements => elements.map(el => el.getAttribute('data-goal-row')))
  await page.route('**/_serverFn/**',route => route.request().method() === 'POST' ? route.abort() : route.continue())
  try {
    await dragBefore(fixture.two.id,fixture.three.id)
    await visible(page.getByText('The order was not saved. Try again.',{exact:true}))
    assert.deepEqual(await page.locator(`[data-goal-row="${fixture.parent.id}"] > .goal-subgoals > li`).evaluateAll(elements => elements.map(el => el.getAttribute('data-goal-row'))),confirmed)
    assert.deepEqual(withStore(store => store.listGoals({parentId:fixture.parent.id}).map(goal => goal.id)),confirmed)
  } finally { await page.unroute('**/_serverFn/**') }
})

test('F07/F11/F15 deep repeatable task trees reset and remain reachable on phone and desktop', async () => {
  const original = withStore(store => {
    const root = store.createTask({title:'Deep repeatable tree',repeatable:true,notes:'Root notes'})
    let parentId = root.id
    const children = []
    for (let depth=1; depth<=6; depth++) {
      const child = store.createTask({title:`Level ${depth}: a long child title that stays readable inside the task sheet`,parentId,notes:`Notes at level ${depth}`})
      children.push(child)
      parentId = child.id
    }
    for (const child of children.toReversed()) store.completeTask(child.id)
    return {root,children}
  })
  await page.goto(url+'/tasks?available=1')
  await button('Complete Deep repeatable tree').click()
  await visible(page.getByText('Task completed. A fresh copy is ready.',{exact:true}))
  const fresh = withStore(store => {
    const root = store.listTasks().find(task => task.sourceTaskId === original.root.id)
    assert.ok(root)
    assert.equal(root.completedAt,null)
    // Reset children block their parent; the fresh root is not falsely completable.
    assert.equal(root.blocked,true)
    let parentId = root.id
    for (let depth=1; depth<=6; depth++) {
      const children = store.listTasks({parentId})
      assert.equal(children.length,1)
      assert.equal(children[0].completedAt,null)
      assert.equal(children[0].notes,`Notes at level ${depth}`)
      assert.notEqual(children[0].id,original.children[depth-1].id)
      parentId = children[0].id
    }
    return root
  })
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:844})
    await page.goto(url+'/tasks/'+fresh.id)
    const dialog = page.getByRole('dialog',{name:'Task',exact:true})
    await visible(dialog)
    assert.equal(await dialog.getByRole('textbox',{name:'Subtask name',exact:true}).count(),6)
    await dialog.getByRole('textbox',{name:'Subtask name',exact:true}).last().scrollIntoViewIfNeeded()
    assert.equal(await dialog.locator('.task-sheet').evaluate(el => el.scrollWidth <= el.clientWidth),true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true)
    await screenshot(`deep-repeatable-${width}`)
  }
})
