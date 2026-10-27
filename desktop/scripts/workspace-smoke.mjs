import { capture } from './capture.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
const desktop = resolve(fileURLToPath(new URL('..', import.meta.url))),
  root = resolve(desktop, '..')
const evidence = await mkdtemp(join(root, '.agent-review-loop/workspace-capture-'))
const captures = join(root, '.impeccable/review/workspace')
await mkdir(captures, { recursive: true })
const database = join(evidence, 'tasks.sqlite3')
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
const errors = []
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.getByText('本地任务服务已连接', { exact: true }).waitFor({ timeout: 30000 })
  await page.evaluate(() => localStorage.setItem('arl.task', '3'))
  await page.reload()
  await page
    .getByRole('heading', { name: '我想要做一个简单的贪吃蛇游戏', exact: true })
    .waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: '运行预览', exact: true }).waitFor()
  await page.getByRole('button', { name: /game.js/ }).click()
  await page.locator('.source-view pre').filter({ hasText: 'var GRID = 20' }).waitFor()
  await capture(app, page, { path: join(captures, 'desktop.png') })
  // Verify saved-session and artifact routes without opening external apps during UI checks.
  await app.evaluate(({ shell }) => {
    globalThis.rondoOpened = []
    shell.openExternal = async (url) => {
      globalThis.rondoOpened.push(url)
    }
    shell.openPath = async (path) => {
      globalThis.rondoOpened.push(path)
      return ''
    }
  })
  await page.getByRole('button', { name: '运行预览', exact: true }).click()
  await page.getByRole('button', { name: '打开 WorkBuddy 会话', exact: true }).click()
  await page.evaluate(() => window.workbench.openSession(3, 'workbuddy'))
  const routes = await app.evaluate(() => globalThis.rondoOpened)
  const preview = routes.find((x) => x.startsWith('http://127.0.0.1:') && x.endsWith('index.html'))
  assert.ok(preview)
  const response = await fetch(preview)
  assert.equal(response.status, 200)
  assert.match(await response.text(), /snake|贪吃蛇/i)
  const code = await fetch(new URL('game.js', preview))
  assert.match(code.headers.get('content-type'), /javascript/)
  assert.equal((await fetch(new URL('.git/config', preview))).status, 403)
  assert.ok(routes.includes('workbuddy://chat/8bc9cb41-1ebb-48f5-8f1c-43c58440d94a'))
  async function goToReview(suffix) {
    await page.locator('.session-scroll').evaluate((e) => {
      e.scrollTop = 0
    })
    await capture(app, page, { path: join(captures, `before-review-${suffix}.png`) })
    await page
      .locator('.session-dock')
      .getByRole('button', { name: '查看审查结果', exact: true })
      .click()
    await page.waitForFunction(() => {
      const heading = [...document.querySelectorAll('.agent-message-heading')].find((e) =>
        e.textContent.includes('Codex · 代码审查')
      )
      const viewport = document.querySelector('.session-scroll').getBoundingClientRect()
      const rect = heading.getBoundingClientRect()
      return (
        rect.top >= viewport.top - 1 &&
        rect.bottom < viewport.bottom &&
        heading === document.activeElement
      )
    })
    await capture(app, page, { path: join(captures, `review-${suffix}.png`) })
  }
  await goToReview('1360')
  await page.getByRole('tab', { name: '会话', exact: true }).click()
  await capture(app, page, { path: join(captures, 'sessions.png') })
  await page.getByRole('tab', { name: '文件', exact: true }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760))
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await goToReview('960')
  await capture(app, page, { path: join(captures, 'desktop-960.png') })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1360, 900))
  await page.getByRole('button', { name: '切换深色', exact: true }).click()
  await capture(app, page, { path: join(captures, 'desktop-dark.png') })
  assert.equal(errors.length, 0, errors.join('\n'))
  await writeFile(
    join(evidence, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        modelCalls: 0,
        captures,
        routes,
        source:
          'SQLite backup of existing task 3; filesystem reads only; opening routes intercepted'
      },
      null,
      2
    )
  )
  console.log(JSON.stringify({ passed: true, evidence, captures }))
} finally {
  await app.close()
}
