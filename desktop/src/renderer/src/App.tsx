import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  Circle,
  Copy,
  FileCode2,
  FolderOpen,
  GitBranch,
  Layers3,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  Workflow
} from 'lucide-react'
import type { Context, Review, ReviewStatus, Task } from '../../shared/types'
const PatchView = lazy(() => import('./PatchView'))
const api = window.workbench
const terminal = new Set(['succeeded', 'failed', 'cancelled', 'interrupted'])
const states: Record<string, string> = {
  ready: '待执行',
  claimed: '执行中',
  submitted: '已提交',
  preparing: '准备快照',
  checking: '运行检查',
  reviewing: '审查中',
  queued: '排队中',
  running: '运行中',
  cancelling: '正在停止',
  succeeded: '审查完成',
  failed: '审查失败',
  cancelled: '已取消',
  interrupted: '已中断'
}
function errorText(error: unknown): string {
  return String(error).replace(/^Error: Error invoking remote method '[^']+': Error: /, '')
}
export default function App() {
  const [connection, setConnection] =
    useState<Awaited<ReturnType<NonNullable<typeof api>['status']>>>()
  const [tasks, setTasks] = useState<Task[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [context, setContext] = useState<Context>()
  const [tab, setTab] = useState('task')
  const [error, setError] = useState(
    api ? '' : '请通过桌面应用打开工作台，浏览器预览无法调用本地服务。'
  )
  const [busy, setBusy] = useState(false)
  const [repo, setRepo] = useState('')
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [acceptance, setAcceptance] = useState('')
  const [changes, setChanges] = useState<{ patch: string; truncated: boolean }>()
  const [job, setJob] = useState<ReviewStatus>()
  const [review, setReview] = useState<Review>()
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const startRequest = useRef({ fingerprint: '', id: '' })
  const reviewRequest = useRef({ task: 0, id: '' })
  const protect = useCallback(async (operation: () => Promise<unknown>) => {
    setError('')
    try {
      await operation()
    } catch (e) {
      setError(errorText(e))
    }
  }, [])
  const refresh = useCallback(async (after = 0) => {
    if (!api) return
    const status = await api.status()
    setConnection(status)
    if (!status.connected) return
    const page = await api.listTasks(after)
    setTasks((previous) => (after ? [...previous, ...page.items] : page.items))
    setNext(page.next_after_id)
  }, [])
  const selectTask = useCallback(async (id: number) => {
    if (!api) return
    const seq = ++generation.current
    setBusy(true)
    setError('')
    setContext(undefined)
    setChanges(undefined)
    setJob(undefined)
    setReview(undefined)
    setTab('task')
    try {
      const selected = await api.context(id)
      if (seq !== generation.current) return
      setContext(selected)
      localStorage.setItem('arl.task', String(id))
      if (selected.latest_review_job_id) {
        const status = await api.reviewStatus(selected.latest_review_job_id)
        if (seq === generation.current) setJob(status)
      }
    } catch (e) {
      if (seq === generation.current) setError(errorText(e))
    } finally {
      if (seq === generation.current) setBusy(false)
    }
  }, [])
  useEffect(() => {
    if (!api) return
    const initialize = async () => {
      await refresh()
      const id = Number(localStorage.getItem('arl.task'))
      if (Number.isSafeInteger(id) && id > 0) await selectTask(id)
    }
    initialize().catch((e) => setError(errorText(e)))
  }, [refresh, selectTask])
  const jobId = job?.job_id
  useEffect(() => {
    if (!api || !jobId) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const status = await api.reviewStatus(jobId)
        if (!active) return
        setJob(status)
        if (status.status === 'succeeded') {
          const result = await api.readReview(jobId)
          if (active) setReview(result)
        } else if (!terminal.has(status.status)) timer = setTimeout(poll, 2500)
      } catch (e) {
        if (active) setError(errorText(e))
      }
    }
    poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [jobId])
  async function prepare(event: React.FormEvent) {
    event.preventDefault()
    if (!api) return
    setBusy(true)
    await protect(async () => {
      const data = {
        repo: repo.trim(),
        title: title.trim() || instructions.trim().split('\n')[0].slice(0, 80),
        instructions: instructions.trim(),
        acceptance: acceptance.trim()
      }
      const fingerprint = JSON.stringify(data)
      if (startRequest.current.fingerprint !== fingerprint)
        startRequest.current = { fingerprint, id: crypto.randomUUID() }
      const result = await api.startTask({ ...data, request_id: startRequest.current.id })
      await selectTask(result.task_id)
      await refresh()
    })
    setBusy(false)
  }
  async function showChanges() {
    setTab('changes')
    setChanges(undefined)
    if (!api || !context) return
    const seq = generation.current
    await protect(async () => {
      const result = await api.changes(context.task_id)
      if (seq === generation.current) setChanges(result)
    })
  }
  async function startReview() {
    if (!api || !context) return
    const id = context.task_id
    const seq = generation.current
    setBusy(true)
    await protect(async () => {
      if (reviewRequest.current.task !== id)
        reviewRequest.current = { task: id, id: crypto.randomUUID() }
      const status = await api.startReview(id, reviewRequest.current.id)
      if (seq === generation.current) {
        setReview(undefined)
        setJob(status)
      }
    })
    setBusy(false)
  }
  function newTask() {
    ++generation.current
    setContext(undefined)
    setJob(undefined)
    setReview(undefined)
    setChanges(undefined)
    setError('')
    setBusy(false)
    localStorage.removeItem('arl.task')
  }
  return (
    <div className="workbench">
      <nav className="sidebar" aria-label="任务导航">
        <div className="brand">
          <Layers3 size={25} />
          <span>
            Agent Review Loop<small>本地开发工作台</small>
          </span>
        </div>
        <button className="new-task" disabled={busy} onClick={newTask}>
          <Plus size={17} />
          新建任务
        </button>
        <div className="nav-heading">
          <span>任务</span>
          <button
            className="icon-button"
            aria-label="刷新任务"
            onClick={() => protect(() => refresh())}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="task-list">
          {tasks.length ? (
            tasks.map((task) => (
              <button
                key={task.task_id}
                className={`task-item ${context?.task_id === task.task_id ? 'selected' : ''}`}
                disabled={busy}
                onClick={() => selectTask(task.task_id)}
              >
                <FileCode2 size={16} />
                <span>
                  {task.title}
                  <small>
                    #{task.task_id} · {states[task.status] ?? task.status}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p className="nav-empty">
              你的任务会保存在这里。
              <br />
              从一个 Git 项目开始。
            </p>
          )}
          {next !== null && (
            <button className="load-more" onClick={() => protect(() => refresh(next))}>
              加载更多任务
            </button>
          )}
        </div>
        <button className="guide" onClick={() => protect(async () => api?.openGuide())}>
          <Workflow size={17} />
          Agent 接入说明
          <ArrowRight size={15} />
        </button>
        <div className="sidebar-footer">
          <span className={`dot ${connection?.connected ? 'connected' : ''}`} />
          {connection?.connected ? '本地服务已连接' : '等待本地服务'}
        </div>
      </nav>
      <main>
        <header className="topbar">
          <span>
            <GitBranch size={16} />
            本地工作区
          </span>
          <span className="connection" title={connection?.database}>
            {connection?.connected ? `MCP · ${connection.tools} 个工具可用` : '正在连接 MCP 服务'}
          </span>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError('')} aria-label="关闭错误">
              关闭
            </button>
          </div>
        )}
        {connection?.error && (
          <div className="error" role="alert">
            {connection.error}
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button onClick={() => setNotice('')}>知道了</button>
          </div>
        )}
        <div className="content-grid">
          <section className="primary">
            {!context ? (
              <>
                <div className="page-heading">
                  <h1>开始一项开发任务</h1>
                  <p>先写清需求，再让每个 Agent 接手适合的工作。</p>
                </div>
                <form onSubmit={prepare} className="task-form">
                  <label htmlFor="repo">项目目录</label>
                  <div className="path-input">
                    <input
                      id="repo"
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      required
                      placeholder="选择本机上的 Git 项目"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        protect(async () => {
                          const path = await api?.chooseProject()
                          if (path) setRepo(path)
                        })
                      }
                    >
                      <FolderOpen size={17} />
                      选择目录
                    </button>
                  </div>
                  <p className="hint">从已提交的 HEAD 建立独立工作区。未提交的改动不会复制过去。</p>
                  <label htmlFor="title">
                    任务名称 <span>可选</span>
                  </label>
                  <input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={160}
                    placeholder="例如：修复导出文件时的中文编码问题"
                  />
                  <label htmlFor="instructions">你想实现什么？</label>
                  <textarea
                    id="instructions"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    maxLength={8000}
                    rows={6}
                    required
                    placeholder="描述当前行为、期望结果，以及需要保留的功能。"
                  />
                  <label htmlFor="acceptance">怎样算完成？</label>
                  <textarea
                    id="acceptance"
                    value={acceptance}
                    onChange={(e) => setAcceptance(e.target.value)}
                    maxLength={4000}
                    rows={3}
                    required
                    placeholder="写下可以验证的结果，例如：导出后中文无乱码，已有测试通过。"
                  />
                  <div className="form-footer">
                    <span>准备任务不调用模型，不消耗模型额度。</span>
                    <button
                      className="primary-button"
                      disabled={busy || !connection?.connected}
                      type="submit"
                    >
                      {busy ? '正在准备…' : '准备任务'}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="page-heading">
                  <div className="title-row">
                    <h1>{context.task.title}</h1>
                    <span className="badge">
                      {states[context.task.status] ?? context.task.status}
                    </span>
                  </div>
                  <p>
                    任务 #{context.task_id} · 基于提交{' '}
                    <code>{context.base_commit.slice(0, 10)}</code>
                  </p>
                </div>
                <div className="workspace-path">
                  <FolderOpen size={18} />
                  <code title={context.workspace}>{context.workspace}</code>
                  <button
                    className="icon-button"
                    aria-label="复制工作区路径"
                    onClick={() =>
                      protect(async () => {
                        await api?.copyWorkspace(context.task_id)
                        setNotice('工作区路径已复制。')
                      })
                    }
                  >
                    <Copy size={16} />
                  </button>
                  <button onClick={() => protect(async () => api?.openWorkspace(context.task_id))}>
                    打开目录
                  </button>
                </div>
                <div className="tabs" aria-label="任务视图">
                  {[
                    ['task', '任务说明'],
                    ['changes', '代码改动'],
                    ['review', '审查结果']
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={tab === key}
                      className={tab === key ? 'active' : ''}
                      onClick={() => (key === 'changes' ? showChanges() : setTab(key))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {tab === 'task' && (
                  <div className="task-details">
                    <h2>需求</h2>
                    <p className="preserve">{context.task.instructions}</p>
                    <h2>验收条件</h2>
                    <p className="preserve">{context.task.acceptance}</p>
                    <div className="handoff-note">
                      <Check size={18} />
                      <div>
                        <strong>工作区已准备好</strong>
                        <p>
                          在上方目录中修改代码，再查看改动并发起审查。目前尚不会自动派发给
                          WorkBuddy。
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {tab === 'changes' && (
                  <div className="changes">
                    {!changes ? (
                      <p className="empty">正在读取工作区改动…</p>
                    ) : !changes.patch ? (
                      <div className="empty">
                        <FileCode2 size={30} />
                        <h2>尚无代码改动</h2>
                        <p>工作区内的修改和新增文件会出现在这里。</p>
                      </div>
                    ) : changes.truncated ? (
                      <>
                        <p className="hint">改动较大，仅显示前 200 KB。完整内容请在工作区查看。</p>
                        <pre>{changes.patch}</pre>
                      </>
                    ) : (
                      <Suspense fallback={<p className="empty">正在加载代码视图…</p>}>
                        <PatchView patch={changes.patch} />
                      </Suspense>
                    )}
                  </div>
                )}
                {tab === 'review' && (
                  <section className="review-panel">
                    <div className="review-heading">
                      <ShieldCheck size={23} />
                      <div>
                        <h2>Codex 代码审查</h2>
                        <p>审查固定快照，返回问题与依据。</p>
                      </div>
                    </div>
                    {!job ? (
                      <>
                        <p>
                          代码准备完成后，停止编辑，再发起一次审查。此操作会调用本机
                          Codex，消耗对应账号的额度；每个任务最多两次。
                        </p>
                        <button className="primary-button" disabled={busy} onClick={startReview}>
                          发起 Codex 审查
                          <ArrowRight size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="review-state">
                          <strong>{states[job.status] ?? job.status}</strong>
                          {!terminal.has(job.status) && (
                            <button
                              onClick={() =>
                                protect(async () => {
                                  const seq = generation.current
                                  const status = await api!.cancelReview(job.job_id)
                                  if (seq === generation.current) setJob(status)
                                })
                              }
                            >
                              <Square size={13} />
                              停止审查
                            </button>
                          )}
                        </div>
                        {job.error_code && (
                          <p role="alert">{job.error_code}。请检查本机 Codex 配置与任务工作区。</p>
                        )}
                        {review && (
                          <>
                            <p className="review-summary">{review.summary}</p>
                            <div className="result-facts">
                              <span>结论：{review.verdict}</span>
                              <span>快照：{review.freshness}</span>
                              <span>检查：{review.checks.status}</span>
                            </div>
                            {review.findings.map((finding, index) => (
                              <article
                                className="finding"
                                key={`${finding.path}:${finding.line}:${index}`}
                              >
                                <strong>
                                  {finding.priority} · {finding.path}:{finding.line}
                                </strong>
                                <p>{finding.trigger}</p>
                                <p>{finding.impact}</p>
                                <pre>{finding.evidence}</pre>
                              </article>
                            ))}
                            {review.next_after_index !== null && (
                              <button
                                onClick={() =>
                                  protect(async () => {
                                    const seq = generation.current
                                    const more = await api!.readReview(
                                      job.job_id,
                                      review.next_after_index!
                                    )
                                    if (seq === generation.current)
                                      setReview({
                                        ...more,
                                        findings: [...review.findings, ...more.findings]
                                      })
                                  })
                                }
                              >
                                加载更多问题
                              </button>
                            )}
                            <p className="hint">审查通过不等于测试通过，也不等于人工验收完成。</p>
                          </>
                        )}
                        {terminal.has(job.status) && (
                          <button
                            className="secondary-review"
                            disabled={busy}
                            onClick={() => {
                              reviewRequest.current = { task: 0, id: '' }
                              startReview()
                            }}
                          >
                            发起新一轮审查（消耗额度）
                          </button>
                        )}
                      </>
                    )}
                  </section>
                )}
              </>
            )}
          </section>
          <aside className="agents">
            <h2>协作分工</h2>
            <div className="agent-row">
              <div className="agent-icon">
                <ShieldCheck size={21} />
              </div>
              <div>
                <strong>Codex</strong>
                <span>规划 · 审查</span>
              </div>
            </div>
            <p>审查可按需发起。需求拆解与自动调度尚未接入。</p>
            <div className="role-status">
              <Circle size={9} />
              发起审查时连接本机 CLI
            </div>
            <div className="agent-row worker">
              <div className="agent-icon">
                <FileCode2 size={21} />
              </div>
              <div>
                <strong>WorkBuddy</strong>
                <span>编码 · 运行检查</span>
              </div>
            </div>
            <p>保留自己的模型、Skills 与环境。自动执行接口尚未接通。</p>
            <div className="role-status pending">
              <Circle size={9} />
              等待执行适配器
            </div>
            <div className="flow">
              <h3>任务如何流转</h3>
              <ol>
                <li className={context ? 'done' : ''}>
                  需求与工作区{context && <Check size={14} />}
                </li>
                <li>
                  Codex 拆解任务<span>待接入</span>
                </li>
                <li>
                  WorkBuddy 执行<span>待接入</span>
                </li>
                <li>
                  检查与 Codex 审查<span>按需发起</span>
                </li>
              </ol>
            </div>
            <p className="local-note">
              <GitBranch size={15} />
              任务与审查记录保存在本机。
            </p>
          </aside>
        </div>
      </main>
    </div>
  )
}
