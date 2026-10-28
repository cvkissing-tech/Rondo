// Real native model catalogs + deterministic ACP fixture. No model prompts or user config writes.
import { _electron } from 'playwright'
import { capture } from './capture.mjs'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const desktop = resolve(fileURLToPath(new URL('..', import.meta.url))),
  root = resolve(desktop, '..')
const evidence = await mkdtemp(join(root, '.agent-review-loop/model-settings-ui-')),
  captures = join(root, '.impeccable/review/model-settings'),
  config = join(evidence, 'agents.json')
await mkdir(captures, { recursive: true })
const fixture = [process.execPath, join(root, 'tests/fixtures/acp-agent.mjs')]
await writeFile(
  config,
  JSON.stringify({
    agents: { 'model-fixture': [...fixture, '--models-fixture'], 'fixed-fixture': fixture },
    unrelated: { preserve: true }
  })
)
const env = {
  ...process.env,
  ARL_HEADLESS: '1',
  ARL_PROJECT_ROOT: root,
  ARL_DATABASE: join(evidence, 'tasks.sqlite3'),
  RONDO_AGENTS_CONFIG: config
}
delete env.ELECTRON_RUN_AS_NODE
let app
async function launch() {
  app = await _electron.launch({
    executablePath: join(desktop, 'node_modules/electron/dist/electron.exe'),
    args: [desktop, `--user-data-dir=${join(evidence, 'profile')}`],
    cwd: root,
    env
  })
  const page = await app.firstWindow()
  await page.getByText('本地任务服务已连接', { exact: true }).waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Agent 设置', exact: true }).first().click()
  return page
}
async function selectAgent(page, name) {
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await page.getByRole('form', { name: '模型设置', exact: true }).waitFor()
  await page.waitForFunction(
    () => !document.querySelector('form[aria-label="模型设置"] select')?.disabled
  )
}
try {
  let page = await launch()
  await page.getByLabel('模型', { exact: true }).selectOption('gpt-6.1-sol')
  await page.getByLabel('思考强度', { exact: true }).selectOption('medium')
  await page.getByRole('button', { name: '保存模型设置', exact: true }).click()
  await page
    .getByText('已保存，后续回合使用此选择。正在运行的回合保持原配置。', { exact: true })
    .waitFor()
  await capture(app, page, { path: join(captures, 'codex.png') })
  await selectAgent(page, 'WorkBuddy · 本机桌面')
  await page.getByLabel('模型', { exact: true }).selectOption('deepseek-v4.1-flash')
  await page.getByRole('button', { name: '保存模型设置', exact: true }).click()
  await page
    .getByText('已保存，后续回合使用此选择。正在运行的回合保持原配置。', { exact: true })
    .waitFor()
  await capture(app, page, { path: join(captures, 'workbuddy.png') })
  await selectAgent(page, 'model-fixture \\(ACP\\)')
  await page.getByLabel('模型', { exact: true }).selectOption('fixture-large')
  await page.getByRole('button', { name: '保存模型设置', exact: true }).click()
  await page
    .getByText('已保存，后续回合使用此选择。正在运行的回合保持原配置。', { exact: true })
    .waitFor()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760))
  await capture(app, page, { path: join(captures, 'acp-960.png') })
  await selectAgent(page, 'fixed-fixture \\(ACP\\)')
  await page
    .getByText('此 Agent 未通过 ACP 提供可选模型，请在原客户端配置模型。', { exact: true })
    .waitFor()
  assert.equal(
    await page.getByRole('button', { name: '保存模型设置', exact: true }).isEnabled(),
    false
  )
  const saved = JSON.parse(await readFile(config, 'utf8'))
  assert.deepEqual(saved.native_models, {
    codex: { model: 'gpt-6.1-sol', effort: 'medium' },
    workbuddy: { model: 'deepseek-v4.1-flash' },
    'acp:model-fixture': { model: 'fixture-large' }
  })
  assert.deepEqual(saved.unrelated, { preserve: true })
  await app.close()
  page = await launch()
  await selectAgent(page, 'model-fixture \\(ACP\\)')
  assert.equal(await page.getByLabel('模型', { exact: true }).inputValue(), 'fixture-large')
  assert.equal(
    await page.locator('.agent-settings').evaluate((el) => el.scrollWidth > el.clientWidth + 2),
    false
  )
  await writeFile(
    join(evidence, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        modelCalls: 0,
        userConfigWrites: 0,
        selectedModels: saved.native_models,
        unsupportedAgentReadOnly: true,
        persistedAfterRestart: true,
        captures
      },
      null,
      2
    )
  )
  console.log(JSON.stringify({ passed: true, evidence, captures }))
} finally {
  await app?.close()
}
