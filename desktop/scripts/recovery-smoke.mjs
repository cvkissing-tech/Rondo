import { _electron } from 'playwright'
import { capture } from './capture.mjs'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const desktop = resolve(fileURLToPath(new URL('..', import.meta.url))),
  root = resolve(desktop, '..')
const evidence = await mkdtemp(join(root, '.agent-review-loop/recovery-ui-')),
  database = join(evidence, 'tasks.sqlite3')
execFileSync(join(root, '.venv/Scripts/python.exe'), [
  '-c',
  'import sqlite3,sys; a=sqlite3.connect(sys.argv[1]); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()',
  join(root, '.agent-review-loop/workbuddy.sqlite3'),
  database
])
const env = { ...process.env, ARL_HEADLESS: '1', ARL_PROJECT_ROOT: root, ARL_DATABASE: database }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({
  executablePath: join(desktop, 'node_modules/electron/dist/electron.exe'),
  args: [desktop, `--user-data-dir=${join(evidence, 'profile')}`],
  cwd: root,
  env
})
try {
  const page = await app.firstWindow()
  await page.getByText('本地任务服务已连接', { exact: true }).waitFor({ timeout: 30000 })
  await page.evaluate(() => localStorage.setItem('arl.task', '4'))
  await page.reload()
  await page.getByText('计划已生成', { exact: true }).waitFor({ timeout: 30000 })
  const data = await page.evaluate(async () => {
    const c = await window.workbench.context(4)
    return {
      context: c,
      status: await window.workbench.planStatus(c.latest_plan_job_id),
      plan: await window.workbench.readPlan(c.latest_plan_job_id)
    }
  })
  assert.equal(data.status.status, 'succeeded')
  assert.equal(data.plan.freshness, 'current')
  assert.ok(data.status.events.length > 0)
  await page.getByRole('tab', { name: '改动', exact: true }).click()
  await page.getByText('尚无代码改动', { exact: true }).waitFor()
  assert.equal(
    await page.getByRole('button', { name: '规划次数已用完（2/2）', exact: true }).isEnabled(),
    false
  )
  const directory = join(root, '.impeccable/review/providers')
  await mkdir(directory, { recursive: true })
  await capture(app, page, { path: join(directory, 'recovered-task.png') })
  await writeFile(
    join(evidence, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        modelCalls: 0,
        job: data.status.job_id,
        plan: data.plan.plan_id,
        freshness: data.plan.freshness
      },
      null,
      2
    )
  )
  console.log(JSON.stringify({ passed: true, evidence }))
} finally {
  await app.close()
}
