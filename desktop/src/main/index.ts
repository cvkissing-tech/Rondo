import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { join, resolve } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { Backend } from './backend'
import type { Context, StartInput } from '../shared/types'
app.setName('Agent Review Loop')
const root = process.env.ARL_PROJECT_ROOT ?? resolve(app.getAppPath(), '..')
const backend = new Backend(
  root,
  process.env.ARL_DATABASE ?? join(root, '.agent-review-loop', 'workbuddy.sqlite3')
)
let window: BrowserWindow
let quitting = false
function handlers(): void {
  const actions: Record<string, (...args: never[]) => unknown> = {
    status: () => backend.status(),
    'choose-project': async () =>
      (await dialog.showOpenDialog(window, { properties: ['openDirectory'] })).filePaths[0],
    'list-tasks': (after = 0) => backend.call('list_tasks', { limit: 20, after_id: after }),
    'start-task': (input: StartInput) => backend.call('start_task', { ...input }),
    context: (id: number) => backend.call('get_task_context', { task_id: id }),
    changes: (id: number) => backend.call('get_task_changes', { task_id: id }),
    'start-review': (id: number, request: string) =>
      backend.call('start_task_review', { task_id: id, request_id: request }),
    'review-status': (id: string) => backend.call('get_review_status', { job_id: id }),
    'read-review': (id: string, after = 0) =>
      backend.call('read_review', { job_id: id, after_index: after, limit: 5 }),
    'cancel-review': (id: string) => backend.call('cancel_review', { job_id: id }),
    'start-plan': (id: number, request: string) =>
      backend.call('start_task_plan', { task_id: id, request_id: request }),
    'plan-status': (id: string) => backend.call('get_plan_status', { job_id: id }),
    'read-plan': (id: string) => backend.call('read_plan', { job_id: id }),
    'cancel-plan': (id: string) => backend.call('cancel_plan', { job_id: id }),
    'open-workspace': async (id: number) => {
      const context = await backend.call<Context>('get_task_context', { task_id: id })
      const error = await shell.openPath(context.workspace)
      if (error) throw new Error(error)
    },
    'copy-workspace': async (id: number) =>
      clipboard.writeText(
        (await backend.call<Context>('get_task_context', { task_id: id })).workspace
      ),
    'open-guide': async () => {
      const error = await shell.openPath(join(root, 'integrations/workbuddy/README.md'))
      if (error) throw new Error(error)
    }
  }
  for (const [name, action] of Object.entries(actions))
    ipcMain.handle(`workbench:${name}`, (event, ...args) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
        throw new Error('无效的调用来源')
      return action(...(args as never[]))
    })
}
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
  })
  app.whenReady().then(() => {
    handlers()
    window = new BrowserWindow({
      width: 1360,
      height: 900,
      minWidth: 960,
      minHeight: 680,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#f4f5f3',
      title: 'Agent Review Loop',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    window.once('ready-to-show', () => window.show())
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    if (is.dev && process.env.ELECTRON_RENDERER_URL)
      window.loadURL(process.env.ELECTRON_RENDERER_URL)
    else window.loadFile(join(__dirname, '../renderer/index.html'))
  })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', (event) => {
    if (!quitting) {
      event.preventDefault()
      quitting = true
      backend.close().finally(() => app.quit())
    }
  })
}
