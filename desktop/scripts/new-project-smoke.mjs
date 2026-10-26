import { capture } from './capture.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { tmpdir } from 'node:os'

const desktop = resolve(fileURLToPath(new URL('..', import.meta.url)))
const root = resolve(desktop, '..')
const evidence = await mkdtemp(join(tmpdir(), 'rondo-new-project-'))
const folder = join(evidence, '新建文件夹')
const shots = join(root, '.impeccable/review/new-project')
await mkdir(folder)
await writeFile(join(folder, 'keep.txt'), 'User existing data must remain outside the project')
await mkdir(shots, { recursive: true })
const env = {
  ...process.env,
  ARL_HEADLESS: '1',
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
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.getByText('本地任务服务已连接', { exact: true }).waitFor({ timeout: 30000 })
  const existingFiles = join(root, '.agent-review-loop', 'subdir-' + Date.now())
  await mkdir(existingFiles)
  await writeFile(join(existingFiles, 'notes.txt'), 'keep my data')
  await page.getByLabel('项目目录', { exact: true }).fill(existingFiles)
  await page.getByLabel('你想实现什么？', { exact: true }).fill('我想要做一个简单的贪吃蛇游戏')
  await page.getByLabel('怎样算完成？', { exact: true }).fill('能玩')
  await page.getByRole('button', { name: '准备任务', exact: true }).click()
  await page.getByText(/你选择的是项目内的子目录/).waitFor()
  assert.equal((await page.locator('body').innerText()).includes('Error executing tool'), false)
  assert.deepEqual(await readdir(existingFiles), ['notes.txt'])
  await capture(app, page, { path: join(shots, 'friendly-error.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '关闭错误提示', exact: true }).click()
  await page.getByLabel('项目目录', { exact: true }).fill(folder)
  await page.reload()
  await page.getByLabel('项目目录', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('项目目录', { exact: true }).inputValue(), folder)
  assert.equal(
    await page.getByLabel('你想实现什么？', { exact: true }).inputValue(),
    '我想要做一个简单的贪吃蛇游戏'
  )
  await capture(app, page, { path: join(shots, 'desktop.png'), animations: 'disabled' })
  const window = await app.browserWindow(page)
  await window.evaluate((w) => w.setSize(960, 680))
  await capture(app, page, { path: join(shots, 'desktop-960.png'), animations: 'disabled' })
  await window.evaluate((w) => w.setSize(1360, 900))
  await page.getByRole('button', { name: '切换深色', exact: true }).click()
  await capture(app, page, { path: join(shots, 'desktop-dark.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '准备任务', exact: true }).click()
  await page
    .getByRole('heading', { name: '我想要做一个简单的贪吃蛇游戏', exact: true, level: 1 })
    .waitFor({ timeout: 30000 })
  const context = await page.evaluate(() => window.workbench.context(1))
  assert.notEqual(context.workspace, folder)
  assert.equal(resolve(context.repository, '..'), folder)
  assert.equal(
    await readFile(join(folder, 'keep.txt'), 'utf8'),
    'User existing data must remain outside the project'
  )
  assert.equal(context.latest_plan_job_id, null)
  assert.equal(
    execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: context.repository,
      encoding: 'utf8'
    }).trim(),
    '1'
  )
  assert.match(await readFile(join(context.workspace, '.gitignore'), 'utf8'), /node_modules\//)
  await capture(app, page, { path: join(shots, 'prepared.png'), animations: 'disabled' })
  assert.deepEqual(errors, [])
  await writeFile(
    join(evidence, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        modelCalls: 0,
        context,
        checks: [
          'plain folder friendly error',
          'existing files preserved',
          'draft survives reload',
          'empty folder initializes once',
          'isolated workspace and baseline',
          'no model jobs created',
          '960px and themes',
          'no renderer errors'
        ]
      },
      null,
      2
    )
  )
  console.log(JSON.stringify({ passed: true, evidence, shots }))
} finally {
  await app.close()
}
