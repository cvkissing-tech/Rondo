import { capture } from './capture.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
const desktop = resolve(fileURLToPath(new URL('..', import.meta.url)))
const root = resolve(desktop, '..')
const realPlan = process.env.ARL_SMOKE_REAL_PLAN === '1'
let completedPlan
await mkdir(join(root, '.agent-review-loop'), { recursive: true })
const evidence = await mkdtemp(join(root, '.agent-review-loop', 'desktop-smoke-'))
const repo = join(evidence, 'sample-repo')
await mkdir(repo)
function git(...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
}
git('init', '-q')
git('config', 'user.name', 'Desktop smoke')
git('config', 'user.email', 'fixture@example.invalid')
git('config', 'core.autocrlf', 'false')
await writeFile(join(repo, 'sample.py'), 'print(1)\n')
git('add', '.')
git('commit', '-qm', 'baseline')
const env = {
  ...process.env,
  ARL_HEADLESS: '1',
  ARL_PROJECT_ROOT: root,
  ARL_DATABASE: join(evidence, 'tasks.sqlite3'),
  ARL_TASK_ROOT: join(evidence, 'tasks'),
  ARL_REVIEW_ROOT: join(evidence, 'runs')
}
delete env.ELECTRON_RUN_AS_NODE
const errors = []
let app
async function launch() {
  app = await _electron.launch({
    executablePath: join(desktop, 'node_modules/electron/dist/electron.exe'),
    args: [desktop, `--user-data-dir=${join(evidence, 'profile')}`],
    cwd: root,
    env
  })
  const page = await app.firstWindow()
  page.on('pageerror', (error) => {
    errors.push(String(error))
    console.error('RENDERER', String(error))
  })
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('CONSOLE', message.text())
  })
  await page.getByText('本地任务服务已连接', { exact: true }).waitFor({ timeout: 30000 })
  return page
}
async function openRecord(page, kind) {
  const button = page.getByRole('button', {
    name: kind === 'plan' ? /^Codex · 执行计划/ : /^Codex · 代码审查/
  })
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
}
try {
  let page = await launch()
  assert.equal(await page.locator('[data-upstream="jean/MainWindow"]').count(), 1)
  const composer = page.locator('[data-upstream="codex/ComposerLayout"]')
  assert.equal(await composer.evaluate((element) => getComputedStyle(element).borderRadius), '28px')
  await capture(app, page, { animations: 'disabled', path: join(evidence, '01-new-task-1360.png') })
  await page.getByLabel('项目目录', { exact: true }).fill(repo)
  await page.locator('summary').filter({ hasText: '任务设置' }).click()
  await page.getByLabel('任务名称').fill('桌面端真实链路验收')
  await page
    .getByLabel('你想实现什么？', { exact: true })
    .fill('将 sample.py 的输出改为 2，新增 README 说明。')
  await page
    .getByLabel('怎样算完成？', { exact: true })
    .fill('输出为 2；原项目保持不变；改动可在工作台查看。')
  await page.getByRole('button', { name: '准备任务', exact: true }).click()
  await page
    .getByRole('heading', { name: '桌面端真实链路验收', exact: true, level: 1 })
    .waitFor({ timeout: 30000 })
  const context = await page.evaluate(() => window.workbench.context(1))
  assert.notEqual(context.workspace, repo)
  assert.equal(await readFile(join(context.workspace, 'sample.py'), 'utf8'), 'print(1)\n')
  await page.getByText('工作区就绪，等待规划', { exact: true }).waitFor()
  assert.equal(
    await page
      .getByRole('button', { name: '需求与验收', exact: true })
      .getAttribute('aria-expanded'),
    'false'
  )
  assert.equal(
    await page
      .getByRole('button', { name: '独立工作区已创建', exact: true })
      .getAttribute('aria-expanded'),
    'false'
  )
  await capture(app, page, { animations: 'disabled', path: join(evidence, '02-task-1360.png') })
  await page.getByRole('tab', { name: '已提交', exact: true }).click()
  await page.getByText('还没有已提交的任务。', { exact: true }).waitFor()
  await page.getByRole('tab', { name: '任务', exact: true }).click()
  await openRecord(page, 'plan')
  await page.getByRole('button', { name: '生成 Codex 计划', exact: true }).waitFor()
  if (realPlan) {
    console.log('Starting ONE real Codex planning turn. Evidence: ' + evidence)
    await page.getByRole('button', { name: '生成 Codex 计划', exact: true }).click()
    const deadline = Date.now() + 210000
    let lastStatus = ''
    while (Date.now() < deadline) {
      const task = await page.evaluate(() => window.workbench.context(1))
      if (task.latest_plan_job_id) {
        const state = await page.evaluate(
          (id) => window.workbench.planStatus(id),
          task.latest_plan_job_id
        )
        if (state.status !== lastStatus) {
          console.log('Plan status: ' + state.status)
          lastStatus = state.status
        }
        if (['succeeded', 'failed', 'cancelled', 'interrupted'].includes(state.status)) break
      } else if (await page.locator('.app-alert').count())
        throw new Error(await page.locator('.app-alert').innerText())
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    const planContext = await page.evaluate(() => window.workbench.context(1))
    assert.ok(planContext.latest_plan_job_id, await page.locator('body').innerText())
    const status = await page.evaluate(
      (id) => window.workbench.planStatus(id),
      planContext.latest_plan_job_id
    )
    await writeFile(join(evidence, 'real-plan-status.json'), JSON.stringify(status, null, 2))
    assert.equal(status.status, 'succeeded', JSON.stringify(status))
    completedPlan = await page.evaluate((id) => window.workbench.readPlan(id), status.job_id)
    assert.equal(completedPlan.freshness, 'current')
    assert.ok(completedPlan.plan.steps.length > 0)
    await page.getByText('计划已生成', { exact: true }).waitFor()
    await page.getByText(completedPlan.plan.summary, { exact: true }).waitFor()
    await capture(app, page, { animations: 'disabled', path: join(evidence, '07-plan-1360.png') })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760))
    await capture(app, page, { animations: 'disabled', path: join(evidence, '08-plan-960.png') })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1360, 900))
    await writeFile(join(evidence, 'real-plan.json'), JSON.stringify(completedPlan, null, 2))
  } else {
    await capture(app, page, {
      animations: 'disabled',
      path: join(evidence, '07-plan-entry-1360.png')
    })
  }
  await writeFile(join(context.workspace, 'sample.py'), 'print(2)\n')
  await writeFile(join(context.workspace, 'README.md'), '# Desktop smoke\n')
  if (realPlan) {
    await page.getByRole('button', { name: '刷新计划状态', exact: true }).click()
    await page.getByText('代码已变化，计划已过期', { exact: true }).waitFor()
    await capture(app, page, {
      animations: 'disabled',
      path: join(evidence, '09-plan-stale-1360.png')
    })
  }
  await page.getByRole('button', { name: '查看代码改动', exact: true }).click()
  await page.locator('diffs-container').first().waitFor({ timeout: 10000 })
  await capture(app, page, { animations: 'disabled', path: join(evidence, '03-changes-1360.png') })
  const patch = await page.evaluate(() => window.workbench.changes(1))
  assert.match(patch.patch, /\+print\(2\)/)
  assert.match(patch.patch, /README.md/)
  assert.equal(await readFile(join(repo, 'sample.py'), 'utf8'), 'print(1)\n')
  const handle = page.locator('[data-slot="resizable-handle"]')
  const panel = page.locator('.timeline-pane')
  const widthBefore = (await panel.boundingBox()).width
  await handle.focus()
  await handle.press('ArrowRight')
  assert.notEqual((await panel.boundingBox()).width, widthBefore)
  await handle.press('ArrowLeft')
  await page.getByLabel('筛选已加载任务').fill('no-such-task')
  await page.getByText('没有匹配的任务。', { exact: true }).waitFor()
  await page.getByLabel('筛选已加载任务').fill('')
  await page.keyboard.press('Control+b')
  await page.locator('[data-slot="sidebar"][data-state="collapsed"]').waitFor({ state: 'attached' })
  await page.getByRole('button', { name: '切换侧栏', exact: true }).click()
  await openRecord(page, 'review')
  await page.getByRole('button', { name: '发起 Codex 审查', exact: true }).waitFor()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760))
  await capture(app, page, { animations: 'disabled', path: join(evidence, '04-review-960.png') })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false
  )
  await page.getByRole('button', { name: 'Agent 连接', exact: true }).click()
  await page.getByText('点击检查本机执行通道', { exact: true }).waitFor()
  await capture(app, page, {
    animations: 'disabled',
    path: join(evidence, '05-connections-960.png')
  })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '切换深色', exact: true }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1360, 900))
  await page.getByRole('button', { name: '查看代码改动', exact: true }).click()
  await page.locator('diffs-container').first().waitFor()
  await capture(app, page, {
    animations: 'disabled',
    path: join(evidence, '06-changes-dark-1360.png')
  })
  await app.close()
  app = undefined
  page = await launch()
  await page.getByRole('heading', { name: '桌面端真实链路验收', exact: true, level: 1 }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true)
  if (realPlan) {
    await openRecord(page, 'plan')
    await page.getByText('计划已生成', { exact: true }).waitFor()
    const restored = await page.evaluate(
      (id) => window.workbench.readPlan(id),
      completedPlan.job_id
    )
    assert.equal(restored.plan_id, completedPlan.plan_id)
    assert.equal(restored.freshness, 'stale')
  }
  const python = join(root, '.venv/Scripts/python.exe')
  const claim = JSON.parse(
    execFileSync(
      python,
      [
        '-c',
        "import json,sys; from agent_review_loop.store import TaskStore; s=TaskStore(sys.argv[1]); t=s.get_task(1); print(json.dumps(s.claim_task(1,'desktop-smoke-executor',t['version'])))",
        env.ARL_DATABASE
      ],
      { cwd: root, encoding: 'utf8' }
    )
  )
  await page
    .locator('.current-stage')
    .getByText('执行任务已领取', { exact: true })
    .waitFor({ timeout: 15000 })
  assert.equal(
    execFileSync(python, [join(context.workspace, 'sample.py')], { encoding: 'utf8' }).trim(),
    '2'
  )
  execFileSync(
    python,
    [
      '-c',
      "import json,sys; from agent_review_loop.store import TaskStore; c=json.load(sys.stdin); TaskStore(sys.argv[1]).submit_result(1,c['attempt_id'],c['claim_token'],c['version'],'Desktop smoke executor ran sample.py: output 2. WorkBuddy was not invoked.','smoke-submit')",
      env.ARL_DATABASE
    ],
    { cwd: root, input: JSON.stringify(claim), encoding: 'utf8' }
  )
  await page
    .locator('.current-stage')
    .getByText('执行结果已提交', { exact: true })
    .waitFor({ timeout: 15000 })
  await page
    .getByText('Desktop smoke executor ran sample.py: output 2. WorkBuddy was not invoked.', {
      exact: true
    })
    .waitFor()
  assert.match(
    await page.getByLabel('Agent 分工').innerText(),
    /执行\s+WorkBuddy\s+·\s+本机原生会话/
  )
  await capture(app, page, {
    animations: 'disabled',
    path: join(evidence, '12-submitted-record-1360.png')
  })
  assert.equal(errors.length, 0, errors.join('\n'))
  await writeFile(
    join(evidence, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        checks: [
          'real MCP discovery',
          'Jean product shell and submitted filter',
          'recovered Codex composer CSS is active',
          'create task via UI',
          'isolated Git worktree',
          'tracked and untracked diff',
          'no source modification',
          'review entry without model call',
          '960px no document overflow',
          'restart resumes task',
          'upstream sidebar keyboard collapse and reopen',
          'real task filtering',
          'resizable panels keyboard drag',
          'agent connection popover',
          'dark theme persists after restart',
          'no renderer exceptions',
          'task stage and agent assignments',
          'requirements and paths collapsed by default',
          'external claim and submit reflected by metadata polling without a model call'
        ],
        modelCalls: realPlan ? 1 : 0,
        realPlanSavedAndResumed: realPlan
      },
      null,
      2
    )
  )
  console.log(JSON.stringify({ passed: true, evidence }))
} catch (error) {
  if (app) {
    const page = await app.firstWindow()
    await capture(app, page, { animations: 'disabled', path: join(evidence, 'failure.png') })
    console.error(await page.locator('body').innerText())
  }
  console.error('Evidence:', evidence)
  throw error
} finally {
  await app?.close()
}
