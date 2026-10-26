import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
const desktop = resolve(fileURLToPath(new URL('..', import.meta.url)))
const root = resolve(desktop, '..')
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
  ARL_PROJECT_ROOT: root,
  ARL_DATABASE: join(evidence, 'tasks.sqlite3'),
  ARL_TASK_ROOT: join(evidence, 'tasks')
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
  await page.getByText('MCP · 14 个工具可用', { exact: true }).waitFor({ timeout: 30000 })
  return page
}
try {
  let page = await launch()
  await page.screenshot({ animations: 'disabled', path: join(evidence, '01-new-task-1360.png') })
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
  await page.screenshot({ animations: 'disabled', path: join(evidence, '02-task-1360.png') })
  await writeFile(join(context.workspace, 'sample.py'), 'print(2)\n')
  await writeFile(join(context.workspace, 'README.md'), '# Desktop smoke\n')
  await page.getByLabel('代码改动', { exact: true }).click()
  await page.locator('diffs-container').first().waitFor({ timeout: 10000 })
  await page.screenshot({ animations: 'disabled', path: join(evidence, '03-changes-1360.png') })
  const patch = await page.evaluate(() => window.workbench.changes(1))
  assert.match(patch.patch, /\+print\(2\)/)
  assert.match(patch.patch, /README.md/)
  assert.equal(await readFile(join(repo, 'sample.py'), 'utf8'), 'print(1)\n')
  const handle = page.locator('[data-slot="resizable-handle"]')
  const panel = page.locator('.context-pane')
  const widthBefore = (await panel.boundingBox()).width
  await handle.focus()
  await handle.press('ArrowRight')
  assert.notEqual((await panel.boundingBox()).width, widthBefore)
  await handle.press('ArrowLeft')
  await page.getByLabel('筛选已加载任务').fill('no-such-task')
  await page.getByText('没有匹配的任务。', { exact: true }).waitFor()
  await page.getByLabel('筛选已加载任务').fill('')
  await page.keyboard.press('Control+b')
  await page.locator('[data-slot="sidebar"][data-state="collapsed"]').waitFor()
  await page.getByRole('button', { name: '切换侧栏', exact: true }).click()
  await page.getByLabel('审查结果', { exact: true }).click()
  await page.getByRole('button', { name: '发起 Codex 审查', exact: true }).waitFor()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760))
  await page.screenshot({ animations: 'disabled', path: join(evidence, '04-review-960.png') })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false
  )
  await page.getByRole('button', { name: 'Agent 连接', exact: true }).click()
  await page.getByText('自动执行接口尚未接通', { exact: true }).waitFor()
  await page.screenshot({ animations: 'disabled', path: join(evidence, '05-connections-960.png') })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '切换深色', exact: true }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1360, 900))
  await page.getByLabel('代码改动', { exact: true }).click()
  await page.locator('diffs-container').first().waitFor()
  await page.screenshot({
    animations: 'disabled',
    path: join(evidence, '06-changes-dark-1360.png')
  })
  await app.close()
  app = undefined
  page = await launch()
  await page.getByRole('heading', { name: '桌面端真实链路验收', exact: true, level: 1 }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true)
  assert.equal(errors.length, 0, errors.join('\n'))
  await writeFile(
    join(evidence, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        checks: [
          'real MCP discovery',
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
          'no renderer exceptions'
        ],
        modelCalls: 0
      },
      null,
      2
    )
  )
  console.log(JSON.stringify({ passed: true, evidence }))
} catch (error) {
  if (app) {
    const page = await app.firstWindow()
    await page.screenshot({ animations: 'disabled', path: join(evidence, 'failure.png') })
    console.error(await page.locator('body').innerText())
  }
  console.error('Evidence:', evidence)
  throw error
} finally {
  await app?.close()
}
