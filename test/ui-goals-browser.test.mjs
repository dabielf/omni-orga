import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium } from 'playwright'
import { createDomainStore } from '../src/domain/store.ts'

const directory = await mkdtemp(join(tmpdir(), 'omni-goal-browser-'))
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const url = `http://127.0.0.1:${port}`
const db = join(directory, 'db.sqlite')
const env = {...process.env, OMNI_ORGA_TEST:'1', OMNI_ORGA_PORT:String(port), OMNI_ORGA_DATABASE_PATH:db, OMNI_ORGA_RUNTIME_DIR:join(directory,'runtime')}
const lifecycle = command => spawnSync(process.execPath, ['scripts/lifecycle.mjs', command], {env, encoding:'utf8',timeout:30000})
let browser, page, fixture
const withStore = run => { const store = createDomainStore(db); try {return run(store)} finally {store.close()} }
before(async () => {
  assert.equal(lifecycle('start').status, 0)
  fixture = withStore(store => {
    const parent = store.createGoal({title:'Writing',kind:'ongoing'})
    const goal = store.createGoal({title:'Publish the guide',kind:'one_shot',parentId:parent.id})
    const other = store.createGoal({title:'Home',kind:'ongoing'})
    const keep = store.createTask({title:'Draft the project outline',goalIds:[goal.id,other.id]})
    const relink = store.createTask({title:'Send the draft notes',goalIds:[goal.id]})
    const archive = store.createTask({title:'Prepare the first draft',goalIds:[goal.id]})
    const child = store.createTask({title:'Draft section one',parentId:archive.id})
    const history = store.createTask({title:'Collect the source notes',goalIds:[goal.id]})
    store.completeTask(history.id)
    return {parent,goal,other,keep,relink,archive,child,history}
  })
  browser = await chromium.launch({headless:true})
  page = await browser.newPage({viewport:{width:1280,height:800}})
  page.setDefaultTimeout(5000)
})
after(async () => {await browser?.close(); lifecycle('stop'); await rm(directory,{recursive:true,force:true})})
const visible = locator => locator.waitFor({state:'visible'})
const button = name => page.getByRole('button',{name,exact:true})

test('goal creation validates inline, traps focus, and safely closes an invalid form', async () => {
  await page.goto(url+'/goals')
  await button('New goal').click()
  const dialog = page.getByRole('dialog',{name:'New goal'})
  await button('Create goal').click()
  await visible(dialog.getByRole('alert'))
  assert.equal(await page.getByRole('textbox',{name:'Goal name'}).evaluate(el => document.activeElement === el), true)
  for(let i=0;i<9;i++) {await page.keyboard.press('Tab'); assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true)}
  await page.keyboard.press('Escape')
  await dialog.waitFor({state:'hidden'})
  assert.equal(await button('New goal').evaluate(el => document.activeElement === el), true)
  await button('New goal').click()
  await page.getByRole('textbox',{name:'Goal name'}).fill('Browser-created goal')
  await button('Create goal').click()
  await visible(page.getByRole('link',{name:'Browser-created goal',exact:true}))
})

test('completion keeps independent task choices after failure and undo restores all changed states', async () => {
  await page.goto(url+'/goals/'+fixture.goal.id)
  await button('Complete goal').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox',{name:'Send the draft notes',exact:true}).selectOption('link')
  await dialog.getByRole('combobox',{name:'Replacement goal for Send the draft notes'}).selectOption(fixture.other.id)
  await dialog.getByRole('combobox',{name:'Prepare the first draft',exact:true}).selectOption('archive')
  if (process.env.OMNI_GOAL_SCREENSHOTS) { await mkdir('output/playwright',{recursive:true}); await page.screenshot({path:'output/playwright/goals-completion-1280.png'}) }
  await page.route('**/_serverFn/**', route => route.request().method() === 'POST' ? route.abort() : route.continue())
  await dialog.getByRole('button',{name:'Complete goal',exact:true}).click()
  await visible(dialog.getByRole('alert'))
  assert.equal(await dialog.getByRole('combobox',{name:'Send the draft notes',exact:true}).inputValue(),'link')
  assert.equal(await dialog.getByRole('combobox',{name:'Prepare the first draft',exact:true}).inputValue(),'archive')
  assert.equal(withStore(store => store.getGoal(fixture.goal.id).completedAt),null)
  await page.unroute('**/_serverFn/**')
  await dialog.getByRole('button',{name:'Complete goal',exact:true}).click()
  await visible(button('Reopen'))
  withStore(store => {
    assert.deepEqual(store.getTask(fixture.keep.id).goalIds,[fixture.other.id])
    assert.deepEqual(store.getTask(fixture.relink.id).goalIds,[fixture.other.id])
    assert.ok(store.getTask(fixture.archive.id).archivedAt)
    assert.ok(store.getTask(fixture.child.id).archivedAt)
    assert.deepEqual(store.getTask(fixture.history.id).goalIds,[fixture.goal.id])
  })
  await button('Undo').click()
  await visible(button('Complete goal'))
  withStore(store => {
    assert.equal(store.getGoal(fixture.goal.id).completedAt,null)
    assert.equal(store.getTask(fixture.child.id).archivedAt,null)
    assert.deepEqual(new Set(store.getTask(fixture.keep.id).goalIds),new Set([fixture.goal.id,fixture.other.id]))
    assert.deepEqual(store.getTask(fixture.relink.id).goalIds,[fixture.goal.id])
  })
})

test('row archive reviews the whole tree and archived detail restores its history', async () => {
  await page.goto(url+'/goals')
  const row = page.locator(`[data-goal-row="${fixture.parent.id}"]`).first()
  await row.getByText('⋯',{exact:true}).first().click()
  await row.getByRole('button',{name:'Archive',exact:true}).first().click()
  const dialog = page.getByRole('dialog',{name:'Archive Writing?'})
  assert.equal(await dialog.getByRole('combobox',{name:'Draft the project outline'}).inputValue(),'keep_active')
  await dialog.getByRole('combobox',{name:'Prepare the first draft',exact:true}).selectOption('archive')
  await dialog.getByRole('button',{name:'Archive goal',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  await page.goto(url+'/goals/'+fixture.parent.id)
  await visible(button('Restore'))
  assert.equal(await button('Complete goal').count(),0)
  assert.equal(await button('Priority').count(),0)
  await visible(page.getByRole('link',{name:'Publish the guide',exact:true}))
  await button('Restore').click()
  await visible(button('Archive'))
  withStore(store => {
    assert.equal(store.getGoal(fixture.goal.id).archivedAt,null)
    assert.equal(store.getTask(fixture.archive.id).archivedAt,null)
    assert.deepEqual(store.getTask(fixture.history.id).goalIds,[fixture.goal.id])
  })
})

test('move options enforce hierarchy and canceled drag keeps sibling order', async () => {
  await page.goto(url+'/goals')
  const parentRow = page.locator(`[data-goal-row="${fixture.parent.id}"]`).first()
  await parentRow.getByText('⋯',{exact:true}).first().click()
  await parentRow.getByRole('button',{name:'Move…',exact:true}).first().click()
  const move = page.getByRole('dialog',{name:'Move Writing'})
  assert.equal(await move.getByRole('button',{name:'Home',exact:true}).isDisabled(),true)
  await page.keyboard.press('Escape')
  const childRow = page.locator(`[data-goal-row="${fixture.goal.id}"]`).first()
  await childRow.getByText('⋯',{exact:true}).first().click()
  await childRow.getByRole('button',{name:'Move…',exact:true}).first().click()
  await page.getByRole('dialog').getByRole('button',{name:'Top level',exact:true}).click()
  await page.getByRole('dialog').waitFor({state:'hidden'})
  assert.equal(withStore(store => store.getGoal(fixture.goal.id).parentId),null)
  await page.goto(url+'/goals')
  const beforeOrder = withStore(store => store.listGoals({parentId:null}).map(goal => goal.id))
  const box = await page.locator(`[data-goal-row="${fixture.other.id}"] > .goal-row`).boundingBox()
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2)
  await page.mouse.down()
  await page.waitForTimeout(400)
  await page.mouse.move(box.x+box.width/2,box.y-160)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  assert.deepEqual(withStore(store => store.listGoals({parentId:null}).map(goal => goal.id)),beforeOrder)
  assert.equal(await page.locator('.is-dragged,.is-drop-before,.is-drop-end').count(),0)
  // Restore the fixture's hierarchy through the same UI.
  await childRow.getByText('⋯',{exact:true}).first().click()
  await childRow.getByRole('button',{name:'Move…',exact:true}).first().click()
  await page.getByRole('dialog').getByRole('button',{name:'Writing',exact:true}).click()
  await page.getByRole('dialog').waitFor({state:'hidden'})
})

test('deleting an active goal tree applies separate task choices without deleting tasks', async () => {
  const item = withStore(store => {
    const goal = store.createGoal({title:'Temporary project',kind:'ongoing'})
    const child = store.createGoal({title:'Temporary subgoal',kind:'one_shot',parentId:goal.id})
    const task = store.createTask({title:'Keep this task',goalIds:[goal.id,child.id,fixture.other.id]})
    const archived = store.createTask({title:'Archive this task',goalIds:[child.id]})
    return {goal,child,task,archived}
  })
  await page.goto(url+'/goals/'+item.goal.id)
  await button('Delete…').click()
  const dialog = page.getByRole('dialog')
  assert.equal(await dialog.getByRole('combobox',{name:'Keep this task',exact:true}).count(),1)
  await dialog.getByRole('combobox',{name:'Archive this task',exact:true}).selectOption('archive')
  await dialog.getByRole('button',{name:'Delete goal',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  withStore(store => {
    assert.throws(() => store.getGoal(item.goal.id),{code:'GOAL_NOT_FOUND'})
    assert.throws(() => store.getGoal(item.child.id),{code:'GOAL_NOT_FOUND'})
    assert.deepEqual(store.getTask(item.task.id).goalIds,[fixture.other.id])
    assert.ok(store.getTask(item.archived.id).archivedAt)
  })
})

test('desktop and phone goal pages and creation sheets do not overflow', async () => {
  if (process.env.OMNI_GOAL_SCREENSHOTS) await mkdir('output/playwright',{recursive:true})
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:width === 390 ? 844 : 800})
    for(const [name,path] of [['list','/goals'],['detail','/goals/'+fixture.goal.id],['ongoing','/goals/'+fixture.parent.id]]) {
      await page.goto(url+path)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true)
      if (process.env.OMNI_GOAL_SCREENSHOTS) await page.screenshot({path:`output/playwright/goals-${name}-${width}.png`})
    }
    await page.goto(url+'/goals')
    await button('New goal').click()
    await visible(page.getByRole('dialog'))
    assert.equal(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth),true)
    if (process.env.OMNI_GOAL_SCREENSHOTS) await page.screenshot({path:`output/playwright/goals-form-${width}.png`})
    await page.keyboard.press('Escape')
  }
})
