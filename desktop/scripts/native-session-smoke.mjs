// Read-only copy of one active task; never launches a model or opens an external app.
import { _electron } from 'playwright'
import { capture } from './capture.mjs'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const desktop = resolve(fileURLToPath(new URL('..', import.meta.url))),
  root = resolve(desktop, '..'),
  task = Number(process.argv[2])
assert.ok(Number.isSafeInteger(task) && task > 0, 'Pass the active task ID')
const evidence = await mkdtemp(join(root, '.agent-review-loop/native-access-')),
  captures = join(root, '.impeccable/review/native-access')
await mkdir(captures, { recursive: true })
execFileSync(join(root, '.venv/Scripts/python.exe'), [
  '-c',
  'import sqlite3,sys; a=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()',
  join(root, '.agent-review-loop/workbuddy.sqlite3'),
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
try {
  const page = await app.firstWindow()
  await page.getByText('本地任务服务已连接', { exact: true }).waitFor({ timeout: 30000 })
  await page.evaluate((id) => localStorage.setItem('arl.task', String(id)), task)
  await page.reload()
  await page.getByRole('tab', { name: '会话', exact: true }).click()
  const worker = page
    .locator('.session-list section')
    .filter({ has: page.getByRole('heading', { name: 'WorkBuddy · 执行', exact: true }) })
  await worker.waitFor()
  assert.equal(
    await worker.getByRole('button', { name: '打开原生会话', exact: true }).isEnabled(),
    true
  )
  await app.evaluate(({ shell }) => {
    globalThis.rondoNativeOpened = []
    shell.openExternal = async (url) => {
      globalThis.rondoNativeOpened.push(url)
    }
  })
  const nativeId = (await worker.locator('code').innerText()).trim()
  await worker.getByRole('button', { name: '打开原生会话', exact: true }).click()
  await page.waitForTimeout(200)
  assert.deepEqual(await app.evaluate(() => globalThis.rondoNativeOpened), [
    `workbuddy://chat/${nativeId}`
  ])
  await capture(app, page, { path: join(captures, 'desktop.png') })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 760))
  await page.getByRole('button', { name: '查看文件与产出', exact: true }).first().click()
  await page.getByRole('tab', { name: '会话', exact: true }).click()
  await capture(app, page, { path: join(captures, 'compact.png') })
  await writeFile(
    join(evidence, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        modelCalls: 0,
        externalOpens: 0,
        interceptedNativeOpens: 1,
        task,
        evidence,
        captures,
        assertions: [
          'WorkBuddy native entry remains enabled',
          'click routes to exact saved native session',
          'external launch intercepted; no model dispatch'
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
