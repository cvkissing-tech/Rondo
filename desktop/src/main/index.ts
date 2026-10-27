import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { join, resolve, relative, isAbsolute, extname } from 'node:path'
import { readdir, realpath, readFile, stat } from 'node:fs/promises'
import { is } from '@electron-toolkit/utils'
import { Backend } from './backend'
import { previewHtml, closePreviews } from './preview'
import type {
  Context,
  StartInput,
  WorkspaceFiles,
  ExecutionStatus,
  ReviewStatus
} from '../shared/types'
app.setName('Rondo')
const root = process.env.ARL_PROJECT_ROOT ?? resolve(app.getAppPath(), '..')
const backend = new Backend(
  root,
  process.env.ARL_DATABASE ?? join(root, '.agent-review-loop', 'workbuddy.sqlite3')
)
let window: BrowserWindow
let quitting = false
async function workspaceFile(id: number, name: string): Promise<string> {
  if (typeof name !== 'string' || !name || name.includes('\0')) throw Error('无效的文件路径')
  const context = await backend.call<Context>('get_task_context', { task_id: id })
  const root = await realpath(context.workspace)
  const file = await realpath(resolve(root, name))
  const child = relative(root, file)
  if (!child || child.startsWith('..') || isAbsolute(child) || !(await stat(file)).isFile())
    throw Error('只能打开任务工作区内的文件')
  return file
}
function handlers(): void {
  const actions: Record<string, (...args: never[]) => unknown> = {
    status: () => backend.status(),
    agents: () => backend.call('list_agents'),
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
    'workbuddy-status': (launch = false) => backend.call('workbuddy_status', { launch }),
    'start-execution': (id: number, request: string) =>
      backend.call('start_task_execution', { task_id: id, request_id: request }),
    'start-repair': (id: string) => backend.call('start_task_repair', { source_review_job_id: id }),
    'execution-status': (id: string) => backend.call('get_execution_status', { job_id: id }),
    'cancel-execution': (id: string) => backend.call('cancel_execution', { job_id: id }),
    'answer-request': (
      job: string,
      request: string,
      answer: string | Record<string, string>,
      kind: string
    ) => backend.call('answer_native_request', { job_id: job, request_id: request, answer, kind }),
    'workspace-files': async (id: number): Promise<WorkspaceFiles> => {
      const context = await backend.call<Context>('get_task_context', { task_id: id })
      const result: WorkspaceFiles = { files: [], truncated: false }
      const ignored = new Set([
        '.git',
        'node_modules',
        '.venv',
        '__pycache__',
        '.next',
        '.agent-review-loop'
      ])
      let scanned = 0
      async function walk(directory: string, depth = 0): Promise<void> {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (++scanned > 1200 || result.files.length >= 300) {
            result.truncated = true
            return
          }
          if (ignored.has(entry.name) || entry.isSymbolicLink()) continue
          const path = join(directory, entry.name)
          if (entry.isDirectory()) {
            if (depth < 6) await walk(path, depth + 1)
            else result.truncated = true
          } else if (entry.isFile())
            result.files.push({
              path: relative(context.workspace, path).replaceAll('\\', '/'),
              size: (await stat(path)).size
            })
        }
      }
      await walk(context.workspace)
      result.files.sort((a, b) => a.path.localeCompare(b.path))
      result.preview = result.files.find((file) => file.path === 'index.html')?.path
      return result
    },
    'read-file': async (id: number, name: string) => {
      const file = await workspaceFile(id, name)
      if ((await stat(file)).size > 512 * 1024) throw Error('文件超过 512 KB，请在工作区打开')
      const bytes = await readFile(file)
      if (bytes.includes(0)) throw Error('二进制文件请在工作区打开')
      return { text: bytes.toString('utf8'), truncated: false }
    },
    'open-artifact': async (id: number, name: string) => {
      const file = await workspaceFile(id, name)
      if (
        !['.html', '.htm', '.md', '.txt', '.pdf', '.png', '.jpg', '.svg'].includes(
          extname(file).toLowerCase()
        )
      )
        throw Error('请使用文件查看器阅读源码；运行程序请在工作区操作')
      if (['.html', '.htm'].includes(extname(file).toLowerCase())) {
        const context = await backend.call<Context>('get_task_context', { task_id: id })
        await shell.openExternal(await previewHtml(context.workspace, file))
      } else {
        const error = await shell.openPath(file)
        if (error) throw Error(error)
      }
    },
    'open-session': async (id: number, agent: string) => {
      const context = await backend.call<Context>('get_task_context', { task_id: id })
      if (agent === 'workbuddy' && context.agents?.executor === 'codex') {
        if (!context.latest_execution_job_id) throw Error('还没有执行会话')
        const status = await backend.call<ReviewStatus>('get_execution_status', {
          job_id: context.latest_execution_job_id
        })
        if (!status.thread_id || !/^[a-f0-9-]{36}$/.test(status.thread_id))
          throw Error('Codex执行会话不可用')
        await shell.openExternal(`codex://threads/${status.thread_id}`)
        return
      }
      if (agent === 'workbuddy' && context.agents?.executor?.startsWith('acp:'))
        throw Error('ACP会话记录在Rondo中查看；原生客户端入口由各Agent提供')
      if (agent === 'workbuddy') {
        if (!context.latest_execution_job_id) throw Error('还没有 WorkBuddy 执行会话')
        const execution = await backend.call<ExecutionStatus>('get_execution_status', {
          job_id: context.latest_execution_job_id
        })
        if (!execution.session_id || !/^[a-f0-9-]{36}$/.test(execution.session_id))
          throw Error('原生会话 ID 不可用')
        await shell.openExternal(`workbuddy://chat/${execution.session_id}`)
      } else if (agent === 'codex-plan' || agent === 'codex-review') {
        const job =
          agent === 'codex-plan' ? context.latest_plan_job_id : context.latest_review_job_id
        if (!job) throw Error('还没有 Codex 会话')
        const status = await backend.call<ReviewStatus>(
          agent === 'codex-plan' ? 'get_plan_status' : 'get_review_status',
          { job_id: job }
        )
        if (status.backend?.startsWith('acp:')) throw Error('ACP会话记录在Rondo中查看')
        if (!status.persistent || !status.thread_id || !/^[a-f0-9-]{36}$/.test(status.thread_id))
          throw Error('这是旧版本的临时会话，没有可恢复的原生记录；新发起的计划和审查会保存会话')
        await shell.openExternal(`codex://threads/${status.thread_id}`)
      } else throw Error('无效的 Agent')
    },
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
      const error = await shell.openPath(join(root, 'docs/AGENTS.md'))
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
      title: 'Rondo',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: process.env.ARL_HEADLESS !== '1',
        nodeIntegration: false
      }
    })
    window.once('ready-to-show', () => {
      if (process.env.ARL_HEADLESS !== '1') window.show()
    })
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
      Promise.all([backend.close(), closePreviews()]).finally(() => app.quit())
    }
  })
}
