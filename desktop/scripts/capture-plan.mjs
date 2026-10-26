// Revisit an existing smoke plan; this script never starts a model generation.
import assert from 'node:assert/strict'
import { readFile, realpath, writeFile, unlink, mkdir } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
const desktop = resolve(fileURLToPath(new URL('..', import.meta.url)))
const root = resolve(desktop, '..')
const evidence = await realpath(resolve(process.argv[2] ?? ''))
assert.ok(relative(join(root, '.agent-review-loop'), evidence).startsWith('desktop-smoke-'))
const capture = process.argv[3] ? resolve(evidence, process.argv[3]) : evidence
assert.ok(
  capture === evidence ||
    (relative(evidence, capture) && !relative(evidence, capture).startsWith('..'))
)
await mkdir(capture, { recursive: true })
const saved = JSON.parse(await readFile(join(evidence, 'real-plan.json'), 'utf8'))
const env = {
  ...process.env,
  ARL_PROJECT_ROOT: root,
  ARL_DATABASE: join(evidence, 'tasks.sqlite3'),
  ARL_TASK_ROOT: join(evidence, 'tasks'),
  ARL_REVIEW_ROOT: join(evidence, 'runs')
}
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({
  executablePath: join(desktop, 'node_modules/electron/dist/electron.exe'),
  args: [desktop, `--user-data-dir=${join(evidence, 'profile')}`],
  cwd: root,
  env
})
try {
  const page = await app.firstWindow()
  await page.getByText('本地任务服务已连接', { exact: true }).waitFor()
  await page.getByRole('heading', { name: '桌面端真实链路验收', level: 1, exact: true }).waitFor()
  const task = await page.evaluate(() => window.workbench.context(1))
  const workspace = await realpath(task.workspace)
  const rel = relative(evidence, workspace)
  assert.ok(rel.startsWith('tasks') && !rel.includes('..'))
  assert.equal(await readFile(join(workspace, 'sample.py'), 'utf8'), 'print(2)\n')
  assert.equal(await readFile(join(workspace, 'README.md'), 'utf8'), '# Desktop smoke\n')
  await writeFile(join(workspace, 'sample.py'), 'print(1)\n')
  await unlink(join(workspace, 'README.md'))
  if (await page.getByRole('button', { name: '切换浅色', exact: true }).count())
    await page.getByRole('button', { name: '切换浅色', exact: true }).click()
  const planRecord = page.getByRole('button', { name: /^Codex · 执行计划/ })
  if ((await planRecord.getAttribute('aria-expanded')) !== 'true') await planRecord.click()
  await page.getByText(saved.plan.summary, { exact: true }).waitFor()
  const stepsToggle = page.getByRole('button', { name: '计划步骤', exact: true })
  await stepsToggle.focus()
  await stepsToggle.press('Space')
  await page.getByText(saved.plan.steps[0].details, { exact: true }).waitFor({ state: 'hidden' })
  await stepsToggle.press('Enter')
  await page.getByText(saved.plan.steps[0].details, { exact: true }).waitFor()
  assert.equal(await page.locator('[data-vibe-ui="entry"]').count(), 1)
  await page.getByRole('button', { name: '刷新计划状态', exact: true }).click()
  await page.getByText('代码已变化，计划已过期', { exact: true }).waitFor({ state: 'hidden' })
  const fresh = await page.evaluate((id) => window.workbench.readPlan(id), saved.job_id)
  assert.equal(fresh.plan_id, saved.plan_id)
  assert.equal(fresh.freshness, 'current')
  await page.screenshot({ animations: 'disabled', path: join(capture, '07-plan-1360.png') })
  await page.locator('.task-records').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await page.screenshot({
    animations: 'disabled',
    path: join(capture, '10-plan-details-1360.png')
  })
  await page.locator('.task-records').evaluate((element) => {
    element.scrollTop = 0
  })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760))
  await page.screenshot({ animations: 'disabled', path: join(capture, '08-plan-960.png') })
  await writeFile(join(workspace, 'sample.py'), 'print(2)\n')
  await writeFile(join(workspace, 'README.md'), '# Desktop smoke\n')
  await page.getByRole('button', { name: '刷新计划状态', exact: true }).click()
  await page.getByText('代码已变化，计划已过期', { exact: true }).waitFor()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1360, 900))
  await page.screenshot({ animations: 'disabled', path: join(capture, '09-plan-stale-1360.png') })
  await page.getByRole('button', { name: '切换深色', exact: true }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760))
  await page.screenshot({ animations: 'disabled', path: join(capture, '11-plan-dark-960.png') })
  const textColors = await page
    .locator('.vibe-plan-surface .text-low')
    .first()
    .evaluate((element) => {
      const backgrounds = []
      for (let node = element; node; node = node.parentElement)
        backgrounds.push(getComputedStyle(node).backgroundColor)
      return { color: getComputedStyle(element).color, backgrounds }
    })
  await writeFile(join(capture, 'dark-plan-colors.json'), JSON.stringify(textColors, null, 2))
  await writeFile(
    join(capture, 'plan-capture.json'),
    JSON.stringify(
      {
        savedPlanReused: saved.plan_id,
        modelCalls: 0,
        freshAndStaleVerified: true,
        vibeKeyboardDisclosure: true
      },
      null,
      2
    )
  )
  console.log(JSON.stringify({ passed: true, evidence: capture, modelCalls: 0 }))
} finally {
  await app.close()
}
