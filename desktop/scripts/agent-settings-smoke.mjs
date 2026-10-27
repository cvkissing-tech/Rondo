// Isolated desktop/ACP fixture test. No commercial Agent, login, model or task prompt.
import { _electron } from 'playwright'
import { capture } from './capture.mjs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const desktop = resolve(fileURLToPath(new URL('..', import.meta.url))), root = resolve(desktop, '..')
const evidence = await mkdtemp(join(root, '.agent-review-loop/agent-settings-ui-'))
const captures = join(root, '.impeccable/review/agent-settings')
await mkdir(captures, { recursive: true })
const config = join(evidence, 'agents.json'), protocol = join(evidence, 'protocol.jsonl')
await writeFile(config, JSON.stringify({ agents: {}, unknownSetting: { preserve: true } }))
const env = { ...process.env, ARL_HEADLESS: '1', ARL_PROJECT_ROOT: root,
  ARL_DATABASE: join(evidence, 'tasks.sqlite3'), ARL_TASK_ROOT: join(evidence, 'tasks'),
  ARL_REVIEW_ROOT: join(evidence, 'runs'), RONDO_AGENTS_CONFIG: config }
delete env.ELECTRON_RUN_AS_NODE
const errors = [], assertions = []
let app
async function launch() {
  app = await _electron.launch({ executablePath: join(desktop, 'node_modules/electron/dist/electron.exe'),
    args: [desktop, `--user-data-dir=${join(evidence, 'profile')}`], cwd: root, env })
  const page = await app.firstWindow()
  page.on('pageerror', e => errors.push(String(e)))
  await page.getByText('本地任务服务已连接', { exact: true }).waitFor({ timeout: 30000 })
  return page
}
async function settings(page) {
  await page.getByRole('button', { name: 'Agent 设置', exact: true }).first().click()
  await page.getByRole('button', { name: '刷新 Agent 列表', exact: true }).waitFor()
  await page.getByRole('button', { name: '添加自定义 Agent', exact: true }).waitFor()
  await page.waitForFunction(() => !document.querySelector('.agent-directory-list')?.getAttribute('aria-busy')?.includes('true'))
}
async function noOverflow(page) {
  const offenders = await page.locator('.agent-settings, .agent-detail, .agent-directory, .agent-settings-body').evaluateAll(es => es.filter(e => e.scrollWidth > e.clientWidth + 2).map(e => e.className))
  assert.deepEqual(offenders, [])
}
try {
  let page = await launch()
  const draft = '学习接入流程的任务草稿'
  await page.getByLabel('你想实现什么？', { exact: true }).fill(draft)
  await settings(page)
  await capture(app, page, { path: join(captures, 'desktop.png') })
  await page.getByLabel('搜索 Agent', { exact: true }).fill('no-agent-matches-this')
  await page.getByText('没有匹配的 Agent。可清空搜索，或添加自定义程序。', { exact: true }).waitFor()
  await capture(app, page, { path: join(captures, 'empty-search.png') })
  await page.getByLabel('搜索 Agent', { exact: true }).fill('')
  await page.getByRole('button', { name: '添加自定义 Agent', exact: true }).click()
  await page.getByLabel('Agent 标识', { exact: true }).fill('learning-fixture')
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, process.execPath)
  await page.getByRole('button', { name: '浏览 Agent 程序', exact: true }).click()
  await page.waitForFunction(path => document.querySelector('#agent-program')?.value === path, process.execPath)
  assert.equal(await page.getByLabel('启动程序', { exact: true }).inputValue(), process.execPath)
  for (const [index, value] of [join(root, 'tests/fixtures/acp-probe.mjs'), protocol].entries()) {
    await page.getByRole('button', { name: '添加参数', exact: true }).click()
    await page.getByRole('textbox', { name: `参数 ${index + 1}`, exact: true }).fill(value)
  }
  await capture(app, page, { path: join(captures, 'editor.png') })
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await page.getByRole('heading', { name: 'learning-fixture (ACP)', exact: true }).waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: '检查协议', exact: true }).click()
  await page.getByText('协议检查通过', { exact: true }).waitFor({ timeout: 30000 })
  const requests = (await readFile(protocol, 'utf8')).trim().split('\n').map(l => JSON.parse(l).method)
  assert.deepEqual(requests, ['initialize'])
  await capture(app, page, { path: join(captures, 'checked.png') })
  assertions.push('native program picker; custom argv save; real ACP initialize only')
  await page.getByRole('button', { name: '编辑启动配置', exact: true }).click()
  const external = JSON.parse(await readFile(config, 'utf8')); external.externalEdit = true
  await writeFile(config, JSON.stringify(external))
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '配置已被其他窗口或程序更新' }).waitFor()
  assert.equal(JSON.parse(await readFile(config, 'utf8')).externalEdit, true)
  await capture(app, page, { path: join(captures, 'conflict.png') })
  await page.getByRole('button', { name: '保留输入，读取最新配置', exact: true }).click()
  await page.getByText('已读取最新配置，当前输入已保留。请检查后点击“保存配置”。', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Agent 标识', { exact: true }).inputValue(), 'learning-fixture')
  assert.equal(await page.getByLabel('启动程序', { exact: true }).inputValue(), process.execPath)
  assert.equal(await page.getByRole('textbox', { name: '参数 2', exact: true }).inputValue(), protocol)
  await capture(app, page, { path: join(captures, 'conflict-recovered.png') })
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await page.getByRole('heading', { name: 'learning-fixture (ACP)', exact: true }).waitFor()
  assert.equal(JSON.parse(await readFile(config, 'utf8')).externalEdit, true)
  assertions.push('conflict action reloads latest revision, preserves draft argv and external fields, and requires explicit retry save')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760))
  await page.locator('.agent-detail').evaluate(el => { el.scrollTop = 0 })
  await noOverflow(page)
  await capture(app, page, { path: join(captures, 'desktop-960.png') })
  await page.getByRole('button', { name: '切换深色', exact: true }).click()
  await noOverflow(page)
  await capture(app, page, { path: join(captures, 'desktop-dark.png') })
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  assert.equal(await page.getByLabel('你想实现什么？', { exact: true }).inputValue(), draft)
  for (const role of ['planner', 'executor', 'reviewer']) await page.locator(`#agent-${role}`).selectOption('acp:learning-fixture')
  await capture(app, page, { path: join(captures, 'task-roles.png') })
  assertions.push('conflicting external edit protected; 960px/dark no horizontal overflow; task draft preserved; three roles select saved Agent')
  await app.close()
  page = await launch()
  for (const role of ['planner', 'executor', 'reviewer']) assert.equal(await page.locator(`#agent-${role}`).inputValue(), 'acp:learning-fixture')
  await settings(page)
  await page.getByLabel('搜索 Agent', { exact: true }).fill('learning-fixture')
  await page.getByRole('button', { name: /learning-fixture \(ACP\)/ }).click()
  await page.getByRole('button', { name: '移除配置', exact: true }).click()
  await page.getByRole('button', { name: '确认移除配置', exact: true }).click()
  await page.getByText('自定义配置已移除；Agent 程序和账号均保留。', { exact: true }).waitFor()
  const removed = JSON.parse(await readFile(config, 'utf8'))
  assert.deepEqual(removed.agents, {})
  assert.deepEqual(removed.unknownSetting, { preserve: true })
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  await page.locator('#agent-planner option[value="acp:learning-fixture"]').filter({ hasText: '配置已移除' }).waitFor({ state: 'attached' })
  assert.deepEqual(errors, [])
  assertions.push('restart persistence; explicit remove retains unrelated config; removed task choice is visibly unavailable')
  const result = { evidence, assertions, errors, modelsCalled: 0, protocolRequests: requests }
  await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally { if (app) await app.close().catch(() => {}) }
