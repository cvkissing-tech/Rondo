// Real Electron + MCP + ACP fixture. Never contacts a model or production database.
import { _electron } from 'playwright'
import { capture } from './capture.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const desktop = resolve(fileURLToPath(new URL('..', import.meta.url))),
  root = resolve(desktop, '..')
const evidence = await mkdtemp(join(root, '.agent-review-loop/planning-dialog-'))
const captures = join(root, '.impeccable/review/planning-dialog')
await mkdir(captures, { recursive: true })
const repo = join(evidence, 'repo')
await mkdir(repo)
execFileSync('git', ['init', '-q'], { cwd: repo })
await writeFile(join(repo, 'README.md'), '# Offline planning dialogue fixture\n')
execFileSync('git', ['add', '.'], { cwd: repo })
execFileSync(
  'git',
  ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'fixture'],
  { cwd: repo }
)
const config = join(evidence, 'agents.json')
await writeFile(
  config,
  JSON.stringify({
    agents: { 'rondo-fixture': [process.execPath, join(root, 'tests/fixtures/acp-agent.mjs')] }
  })
)
const env = {
  ...process.env,
  ARL_HEADLESS: '1',
  ARL_PROJECT_ROOT: root,
  ARL_DATABASE: join(evidence, 'tasks.sqlite3'),
  ARL_TASK_ROOT: join(evidence, 'tasks'),
  ARL_REVIEW_ROOT: join(evidence, 'runs'),
  RONDO_AGENTS_CONFIG: config
}
delete env.ELECTRON_RUN_AS_NODE
const launch = () =>
  _electron.launch({
    executablePath: join(desktop, 'node_modules/electron/dist/electron.exe'),
    args: [desktop, `--user-data-dir=${join(evidence, 'profile')}`],
    cwd: root,
    env
  })
let app = await launch()
let page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
async function saved() {
  return page.evaluate(() => window.workbench.planningConversation(1))
}
async function waitTurn(count) {
  const end = Date.now() + 45000
  while (Date.now() < end) {
    const turns = await saved(),
      last = turns.items.at(-1)
    if (turns.items.length === count && last.status === 'succeeded') return
    if (last && ['failed', 'cancelled', 'interrupted'].includes(last.status))
      throw Error(JSON.stringify(last))
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw Error('Planning fixture timeout')
}
async function shot(name) {
  await capture(app, page, { path: join(captures, name + '.png') })
}
try {
  await page.getByText('本地任务服务已连接', { exact: true }).waitFor({ timeout: 30000 })
  await page.evaluate(async (repo) => {
    const agent = 'acp:rondo-fixture'
    await window.workbench.startTask({
      repo,
      title: '离线协作验收 · 规划讨论',
      instructions: '做一个离线贪吃蛇游戏。本任务为协议替身，不调用模型。',
      acceptance: '能够讨论、修改方案并交接准确版本',
      request_id: 'fixture',
      agents: { planner: agent, executor: agent, reviewer: agent }
    })
    await window.workbench.startPlan(1, 'plan-v1')
    localStorage.setItem('arl.task', '1')
    localStorage.setItem('arl.theme', 'light')
  }, repo)
  await waitTurn(1)
  const v1 = await page.evaluate(async () => {
    const h = await window.workbench.planningConversation(1)
    return window.workbench.readPlan(h.items[0].job_id)
  })
  await page.reload()
  await page.getByRole('textbox', { name: '讨论或修改方案' }).waitFor()
  await page
    .getByRole('button', { name: '采用 V1，交给 rondo-fixture 执行', exact: true })
    .waitFor()
  await page.getByRole('textbox', { name: '讨论或修改方案' }).fill('为什么选择这个方案？')
  await page.getByRole('button', { name: '发送给规划 Agent', exact: true }).click()
  await waitTurn(2)
  await page
    .getByText('离线替身解释：不需要服务器，可以先验证玩法。', { exact: true })
    .waitFor({ timeout: 15000 })
  const question = (await saved()).items.at(-1)
  assert.equal(
    (await page.evaluate((id) => window.workbench.readPlan(id), question.job_id)).plan_id,
    v1.plan_id
  )
  await page.getByRole('textbox', { name: '讨论或修改方案' }).fill('先不要联网，增加本地排行榜。')
  await page.getByRole('button', { name: '发送给规划 Agent', exact: true }).click()
  await waitTurn(3)
  await page
    .getByRole('button', { name: '采用 V2，交给 rondo-fixture 执行', exact: true })
    .waitFor({ timeout: 15000 })
  await page.getByText('离线替身修订：移除联网功能，增加本地排行榜。', { exact: true }).waitFor()
  const revision = (await saved()).items.at(-1)
  const v2 = await page.evaluate((id) => window.workbench.readPlan(id), revision.job_id)
  assert.equal(v2.version, 2)
  assert.notEqual(v2.plan_id, v1.plan_id)
  await shot('desktop-light')
  await page.getByRole('button', { name: '查看计划 V1', exact: true }).first().click()
  await page.getByText(/正在查看历史计划 V1/).waitFor()
  await page
    .getByRole('button', { name: '采用 V2，交给 rondo-fixture 执行', exact: true })
    .waitFor()
  await shot('historical-plan')
  await page.getByRole('button', { name: '返回当前计划', exact: true }).click()
  await page.getByRole('button', { name: '切换深色', exact: true }).click()
  await shot('desktop-dark')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760))
  await page.getByRole('tab', { name: '计划', exact: true }).waitFor({ state: 'hidden' })
  const box = await page.getByRole('textbox', { name: '讨论或修改方案' }).boundingBox()
  assert.ok(box && box.y + box.height < 760)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await shot('compact-dark')
  await page.getByRole('button', { name: '查看计划 V2', exact: true }).click()
  await page.getByRole('tab', { name: '计划', exact: true }).waitFor()
  await page.getByRole('textbox', { name: '讨论或修改方案' }).waitFor({ state: 'hidden' })
  const pane = await page.locator('.workspace-inspector').boundingBox()
  const area = await page.locator('.task-panels').boundingBox()
  assert.ok(pane && area && Math.abs(pane.width - area.width) < 2)
  await shot('compact-plan')
  await page.getByRole('button', { name: '收起工作区面板', exact: true }).click()
  await page.getByRole('textbox', { name: '讨论或修改方案' }).waitFor()
  assert.equal(
    await page
      .getByRole('textbox', { name: '讨论或修改方案' })
      .evaluate((el) => el === document.activeElement),
    true
  )
  await page.getByRole('textbox', { name: '讨论或修改方案' }).fill('重启后保留的意见')
  await app.close()
  app = await launch()
  page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.getByRole('textbox', { name: '讨论或修改方案' }).waitFor({ timeout: 30000 })
  assert.equal(
    await page.getByRole('textbox', { name: '讨论或修改方案' }).inputValue(),
    '重启后保留的意见'
  )
  assert.equal((await saved()).items.length, 3)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1360, 900))
  await page.getByRole('button', { name: '采用 V2，交给 rondo-fixture 执行', exact: true }).click()
  await page
    .getByRole('button', { name: 'Allow fixture write once', exact: true })
    .waitFor({ timeout: 45000 })
  await shot('execution-permission')
  await page.getByRole('button', { name: 'Allow fixture write once', exact: true }).click()
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    const done = await page.evaluate(async () => {
      const c = await window.workbench.context(1)
      if (!c.latest_execution_job_id) return false
      const s = await window.workbench.executionStatus(c.latest_execution_job_id)
      return (
        s.status === 'succeeded' &&
        s.review_job_id &&
        (await window.workbench.reviewStatus(s.review_job_id)).status === 'succeeded'
      )
    })
    if (done) break
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  const execution = await page.evaluate(async () => {
    const c = await window.workbench.context(1)
    return window.workbench.executionStatus(c.latest_execution_job_id)
  })
  assert.equal(execution.plan_job_id, v2.job_id)
  assert.equal(execution.plan_id, v2.plan_id)
  assert.equal(execution.plan_version, 2)
  await page.getByRole('tab', { name: '文件', exact: true }).click()
  await page.getByRole('button', { name: /fixture.txt/ }).waitFor()
  await shot('execution-result')
  assert.deepEqual(errors, [])
  const result = {
    passed: true,
    modelCalls: 0,
    evidence,
    captures,
    assertions: [
      'question preserves V1',
      'revision creates V2',
      'history keeps V1 and adoption targets V2',
      'draft and conversation survive restart',
      '960px collapses inspector',
      'real ACP dispatch receives adopted V2',
      'ACP write permission and automatic review'
    ],
    execution
  }
  await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ passed: true, evidence, captures }))
} finally {
  await app.close()
}
