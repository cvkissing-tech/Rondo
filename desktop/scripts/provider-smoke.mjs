import { _electron } from 'playwright'
import { capture } from './capture.mjs'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const desktop = resolve(fileURLToPath(new URL('..', import.meta.url))),
  root = resolve(desktop, '..')
const evidence = await mkdtemp(join(root, '.agent-review-loop/provider-ui-'))
const captures = join(root, '.impeccable/review/providers')
await mkdir(captures, { recursive: true })
const repo = join(evidence, 'repo')
await mkdir(repo)
execFileSync('git', ['init', '-q'], { cwd: repo })
await writeFile(join(repo, 'README.md'), '# Isolated UI fixture\n')
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
  await page
    .locator('#agent-executor option[value="acp:rondo-fixture"]')
    .waitFor({ state: 'attached', timeout: 25000 })
  const catalog = await page.evaluate(() => window.workbench.agents())
  assert.ok(catalog.agents.some((a) => a.id === 'acp:rondo-fixture' && a.available))
  for (const role of ['planner', 'executor', 'reviewer'])
    await page.locator(`#agent-${role}`).selectOption('acp:rondo-fixture')
  await page.getByLabel('项目目录', { exact: true }).fill(repo)
  await page.getByLabel('你想实现什么？', { exact: true }).fill('离线ACP分工界面验收；不调用模型')
  await page.getByLabel('怎样算完成？', { exact: true }).fill('保存三种角色；改动标签正常读取')
  await capture(app, page, { path: join(captures, 'agent-picker.png') })
  await page.getByRole('button', { name: '准备任务', exact: true }).click()
  await page
    .getByRole('heading', { name: '离线ACP分工界面验收；不调用模型', exact: true })
    .waitFor({ timeout: 30000 })
  const context = await page.evaluate(() => window.workbench.context(1))
  assert.deepEqual(context.agents, {
    planner: 'acp:rondo-fixture',
    executor: 'acp:rondo-fixture',
    reviewer: 'acp:rondo-fixture'
  })
  await page.getByRole('tab', { name: '改动', exact: true }).click()
  await page.getByText('尚无代码改动', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'rondo-fixture · 执行计划' }).click()
  await page.getByRole('button', { name: '生成 rondo-fixture 计划', exact: true }).waitFor()
  await capture(app, page, { path: join(captures, 'selected-roles.png') })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760))
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await capture(app, page, { path: join(captures, 'selected-roles-960.png') })
  await page.getByRole('button', { name: '切换深色', exact: true }).click()
  await capture(app, page, { path: join(captures, 'selected-roles-dark.png') })
  assert.equal(errors.length, 0, errors.join('\n'))
  await writeFile(
    join(evidence, 'result.json'),
    JSON.stringify(
      { passed: true, modelCalls: 0, context, catalogCount: catalog.agents.length },
      null,
      2
    )
  )
  console.log(JSON.stringify({ passed: true, evidence, captures }))
} finally {
  await app.close()
}
