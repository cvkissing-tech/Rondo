// Read-only UI regression on a copied user database. Never clicks dispatch.
import { _electron } from 'playwright'
import { capture } from './capture.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const desktop = resolve(fileURLToPath(new URL('..', import.meta.url))),
  root = resolve(desktop, '..')
const task = Number(process.argv[2])
assert.ok(
  Number.isSafeInteger(task) && task > 0,
  'Usage: node scripts/workflow-entry-smoke.mjs <ready-task-id> [database]'
)
const sourceDatabase = process.argv[3]
  ? resolve(process.argv[3])
  : join(root, '.agent-review-loop/workbuddy.sqlite3')
const evidence = await mkdtemp(join(root, '.agent-review-loop/workflow-entry-'))
const captures = join(root, '.impeccable/review/workflow-entry')
await mkdir(captures, { recursive: true })
execFileSync(join(root, '.venv/Scripts/python.exe'), [
  '-c',
  'import sqlite3,sys; a=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()',
  sourceDatabase,
  join(evidence, 'tasks.sqlite3')
])
const env = {
  ...process.env,
  ARL_HEADLESS: '1',
  ARL_PROJECT_ROOT: root,
  ARL_DATABASE: join(evidence, 'tasks.sqlite3')
}
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({
  executablePath: join(desktop, 'node_modules/electron/dist/electron.exe'),
  args: [desktop, `--user-data-dir=${join(evidence, 'profile')}`],
  cwd: root,
  env
})
const errors = []
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.getByText('本地任务服务已连接', { exact: true }).waitFor({ timeout: 30000 })
  const before = await page.evaluate(async (id) => {
    const c = await window.workbench.context(id)
    return { context: c, plan: await window.workbench.readPlan(c.latest_plan_job_id) }
  }, task)
  assert.equal(before.plan.freshness, 'current')
  assert.equal(before.context.latest_execution_job_id, null)
  await page.evaluate((id) => {
    localStorage.setItem('arl.task', String(id))
    localStorage.setItem('arl.theme', 'light')
  }, task)
  await page.reload()
  const start = page.getByRole('button', { name: /^采用 V1，交给 .* 执行$/ })
  await start.waitFor({ timeout: 30000 })
  assert.equal(await start.isEnabled(), true)
  assert.equal(await start.evaluate((el) => !!el.closest('[data-panel-id]')), false)
  await capture(app, page, { path: join(captures, 'desktop.png') })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760))
  await page.getByRole('tab', { name: '计划', exact: true }).waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '查看计划 V1', exact: true }).click()
  await page.getByRole('tab', { name: '计划', exact: true }).waitFor()
  assert.equal(await page.getByRole('textbox', { name: '讨论或修改方案' }).isVisible(), false)
  assert.equal(await start.isVisible(), true)
  assert.equal(await start.isEnabled(), true)
  const bar = await page.locator('.workflow-strip').boundingBox(),
    button = await start.boundingBox(),
    panel = await page.locator('.workspace-inspector').boundingBox()
  assert.ok(
    bar &&
      button &&
      panel &&
      bar.y + bar.height <= panel.y + 1 &&
      button.y >= bar.y &&
      button.y + button.height <= bar.y + bar.height
  )
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await capture(app, page, { path: join(captures, 'compact-plan.png') })
  await page.getByRole('button', { name: '切换深色', exact: true }).click()
  await capture(app, page, { path: join(captures, 'compact-plan-dark.png') })
  await page.getByRole('button', { name: '收起工作区面板', exact: true }).click()
  assert.equal(await start.isVisible(), true)
  const after = await page.evaluate((id) => window.workbench.context(id), task)
  assert.equal(after.latest_execution_job_id, null)
  assert.equal(after.latest_plan_job_id, before.context.latest_plan_job_id)
  assert.deepEqual(errors, [])
  await writeFile(
    join(evidence, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        modelCalls: 0,
        dispatches: 0,
        task,
        evidence,
        captures,
        assertions: [
          'current plan has enabled entry',
          'entry outside both panels',
          'compact plan keeps entry visible',
          'workflow and plan do not overlap',
          'close keeps entry',
          'no execution created'
        ]
      },
      null,
      2
    )
  )
  console.log(JSON.stringify({ passed: true, evidence, captures }))
} finally {
  await app.close()
}
