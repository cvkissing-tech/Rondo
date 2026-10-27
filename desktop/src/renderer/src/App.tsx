import { Button } from '@jean/components/ui/button'
import { Input } from '@jean/components/ui/input'
import { Textarea } from '@jean/components/ui/textarea'
import { Badge } from '@jean/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@jean/components/ui/alert'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription
} from '@jean/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@jean/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@jean/components/ui/input-group'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@jean/components/ui/resizable'
import { SidebarProvider } from '@jean/components/ui/sidebar'
import { WorkbenchShell } from '@jean/components/workbench/WorkbenchShell'
import { TaskSidebar } from '@jean/components/workbench/TaskSidebar'
import { Tooltip, TooltipTrigger, TooltipContent } from '@jean/components/ui/tooltip'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  ChevronRight,
  Settings2,
  Copy,
  FileCode2,
  FolderOpen,
  GitBranch,
  Moon,
  MoreHorizontal,
  ShieldCheck,
  Square,
  Sun,
  X
} from 'lucide-react'
import type {
  Context,
  ExecutionStatus,
  PlanResult,
  Review,
  ReviewStatus,
  StartInput,
  Task,
  WorkBuddyConnection
} from '../../shared/types'
import { defaultAgents, agentName } from '../../shared/types'
import type { AgentAssignments } from '../../shared/types'
import { AgentPicker } from './AgentPicker'
import { AgentSettings } from './AgentSettings'
import { errorText } from './errors'
import PlanPanel from './PlanPanel'
import { ComposerLayout } from './vendor/codex/ComposerLayout'
import { TaskTimeline } from './TaskTimeline'
import { WorkspaceInspector } from './WorkspaceInspector'
import type { TaskAction } from './taskFlow'
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
function savedDraft(): Partial<StartInput> {
  try {
    const value = JSON.parse(localStorage.getItem('arl.draft') || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}
export default function App() {
  const [connection, setConnection] =
    useState<Awaited<ReturnType<NonNullable<typeof api>['status']>>>()
  const [search, setSearch] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workbuddy, setWorkbuddy] = useState<WorkBuddyConnection>()
  const [dark, setDark] = useState(
    () =>
      localStorage.getItem('arl.theme') === 'dark' ||
      (!localStorage.getItem('arl.theme') && matchMedia('(prefers-color-scheme: dark)').matches)
  )
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('arl.theme', dark ? 'dark' : 'light')
  }, [dark])
  const [tasks, setTasks] = useState<Task[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [context, setContext] = useState<Context>()
  const [changesOpen, setChangesOpen] = useState(true)
  const [diffRequest, setDiffRequest] = useState(0)
  const [error, setError] = useState(
    api ? '' : '请通过桌面应用打开工作台，浏览器预览无法调用本地服务。'
  )
  const [busy, setBusy] = useState(false)
  const [draft] = useState(savedDraft)
  const [agents, setAgents] = useState<AgentAssignments>(
    draft.agents?.planner && draft.agents.executor && draft.agents.reviewer
      ? draft.agents
      : defaultAgents
  )
  const [repo, setRepo] = useState(typeof draft.repo === 'string' ? draft.repo : '')
  const [title, setTitle] = useState(typeof draft.title === 'string' ? draft.title : '')
  const [instructions, setInstructions] = useState(
    typeof draft.instructions === 'string' ? draft.instructions : ''
  )
  const [acceptance, setAcceptance] = useState(
    typeof draft.acceptance === 'string' ? draft.acceptance : ''
  )
  useEffect(() => {
    localStorage.setItem(
      'arl.draft',
      JSON.stringify({ repo, title, instructions, acceptance, agents })
    )
  }, [repo, title, instructions, acceptance, agents])
  const [changesError, setChangesError] = useState('')
  const [changesLoading, setChangesLoading] = useState(false)
  const [changes, setChanges] = useState<{ patch: string; truncated: boolean }>()
  const [job, setJob] = useState<ReviewStatus>()
  const [review, setReview] = useState<Review>()
  const [planJob, setPlanJob] = useState<ReviewStatus>()
  const [planResult, setPlanResult] = useState<PlanResult>()
  const [execution, setExecution] = useState<ExecutionStatus>()
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const startRequest = useRef({ fingerprint: '', id: '' })
  const reviewRequest = useRef({ task: 0, id: '' })
  const planRequest = useRef({ task: 0, id: '' })
  const executionRequest = useRef({ task: 0, id: '' })
  const pendingPlanRequest = useRef(false)
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
    setPlanJob(undefined)
    setPlanResult(undefined)
    setChangesOpen(true)
    setDiffRequest(0)
    setChangesError('')
    setExecution(undefined)
    try {
      const selected = await api.context(id)
      if (seq !== generation.current) return
      setContext(selected)
      localStorage.setItem('arl.task', String(id))
      if (selected.latest_execution_job_id) {
        const status = await api.executionStatus(selected.latest_execution_job_id)
        if (seq === generation.current) setExecution(status)
      }
      if (selected.latest_review_job_id) {
        const status = await api.reviewStatus(selected.latest_review_job_id)
        if (seq === generation.current) setJob(status)
      }
      if (selected.latest_plan_job_id) {
        const status = await api.planStatus(selected.latest_plan_job_id)
        if (seq === generation.current) setPlanJob(status)
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
  const planJobId = planJob?.job_id
  useEffect(() => {
    if (!api || !planJobId) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const status = await api.planStatus(planJobId)
        if (!active) return
        setPlanJob(status)
        if (status.status === 'succeeded') {
          const result = await api.readPlan(planJobId)
          if (active) setPlanResult(result)
        } else if (!terminal.has(status.status)) timer = setTimeout(poll, 2500)
      } catch (error) {
        if (active) setError(errorText(error))
      }
    }
    poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [planJobId])
  const selectedTaskId = context?.task_id
  const planAttempts = new Set([
    ...(context?.activity || []).filter((row) => row.kind === 'plan').map((row) => row.id),
    ...(planJob ? [planJob.job_id] : [])
  ]).size
  const reviewAttempts = new Set([
    ...(context?.activity || []).filter((row) => row.kind === 'review').map((row) => row.id),
    ...(job ? [job.job_id] : [])
  ]).size
  useEffect(() => {
    if (!api || !selectedTaskId) return
    let active = true,
      inFlight = false
    // Metadata only: no Git snapshot, model call, or automatic job start.
    const timer = setInterval(async () => {
      if (inFlight) return
      inFlight = true
      try {
        const updated = await api.context(selectedTaskId)
        if (!active) return
        setContext(updated)
        if (updated.latest_execution_job_id) {
          const state = await api.executionStatus(updated.latest_execution_job_id)
          if (!active) return
          setExecution(state)
        }
        setTasks((previous) =>
          previous.map((task) =>
            task.task_id === selectedTaskId ? { ...task, status: updated.task.status } : task
          )
        )
        if (updated.latest_plan_job_id && updated.latest_plan_job_id !== planJobId) {
          const state = await api.planStatus(updated.latest_plan_job_id)
          if (!active) return
          setPlanResult(undefined)
          setPlanJob(state)
        }
        if (updated.latest_review_job_id && updated.latest_review_job_id !== jobId) {
          const state = await api.reviewStatus(updated.latest_review_job_id)
          if (!active) return
          setReview(undefined)
          setJob(state)
        }
      } catch (error) {
        if (active) setError(errorText(error))
      } finally {
        inFlight = false
      }
    }, 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [selectedTaskId, planJobId, jobId])
  async function refreshPlan() {
    if (!api || !planJob) return
    const seq = generation.current
    const status = await api.planStatus(planJob.job_id)
    if (seq !== generation.current) return
    setPlanJob(status)
    if (status.status === 'succeeded') {
      const result = await api.readPlan(planJob.job_id)
      if (seq === generation.current) setPlanResult(result)
    }
  }
  async function startPlan(fresh = false) {
    if (!api || !context) return
    const id = context.task_id,
      seq = generation.current
    if ((fresh && !pendingPlanRequest.current) || planRequest.current.task !== id)
      planRequest.current = { task: id, id: crypto.randomUUID() }
    pendingPlanRequest.current = true
    setBusy(true)
    await protect(async () => {
      const status = await api.startPlan(id, planRequest.current.id)
      pendingPlanRequest.current = false
      if (seq === generation.current) {
        setPlanResult(undefined)
        setPlanJob(status)
      }
    })
    if (seq === generation.current) setBusy(false)
  }
  async function prepare(event: React.FormEvent) {
    event.preventDefault()
    if (!api) return
    setBusy(true)
    await protect(async () => {
      const data = {
        agents,
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
    setChangesOpen(true)
    if (!api || !context) return
    const seq = generation.current
    setChangesLoading(true)
    setChangesError('')
    try {
      const result = await api.changes(context.task_id)
      if (seq === generation.current) setChanges(result)
    } catch (e) {
      if (seq === generation.current) setChangesError(errorText(e))
    } finally {
      if (seq === generation.current) setChangesLoading(false)
    }
  }
  async function startReview() {
    if (!api || !context) return
    if (planJob && !terminal.has(planJob.status)) {
      setError('正在生成计划，请先等待完成或停止生成。')
      return
    }
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
  async function refreshTask() {
    if (!api || !context) return
    const seq = generation.current,
      updated = await api.context(context.task_id)
    if (seq !== generation.current) return
    setContext(updated)
    if (updated.latest_execution_job_id) {
      const state = await api.executionStatus(updated.latest_execution_job_id)
      if (seq !== generation.current) return
      setExecution(state)
    }
    if (updated.latest_plan_job_id) {
      const state = await api.planStatus(updated.latest_plan_job_id)
      if (seq !== generation.current) return
      setPlanJob(state)
      if (state.status === 'succeeded') {
        const result = await api.readPlan(state.job_id)
        if (seq === generation.current) setPlanResult(result)
      }
    }
    if (updated.latest_review_job_id) {
      const state = await api.reviewStatus(updated.latest_review_job_id)
      if (seq !== generation.current) return
      setJob(state)
      if (state.status === 'succeeded') {
        const result = await api.readReview(state.job_id)
        if (seq === generation.current) setReview(result)
      }
    }
  }
  function taskAction(action: TaskAction) {
    if (action === 'plan') startPlan()
    else if (action === 'review') startReview()
    else if (action === 'execute') startExecution()
    else if (action === 'repair') startRepair()
    else if (action === 'refresh') protect(refreshTask)
    else if (action === 'changes') showChanges()
    else if (action === 'guide') protect(async () => api?.openGuide())
  }
  async function startExecution() {
    if (!api || !context) return
    const id = context.task_id,
      seq = generation.current
    setBusy(true)
    await protect(async () => {
      if ((context.agents || defaultAgents).executor === 'workbuddy') {
        const status = await api.workbuddyStatus()
        setWorkbuddy(status)
        if (!status.connected)
          throw Error('WorkBuddy 本地通道未连接。打开“Agent 设置”检查或启动 WorkBuddy。')
      }
      if (executionRequest.current.task !== id)
        executionRequest.current = { task: id, id: crypto.randomUUID() }
      const started = await api.startExecution(id, executionRequest.current.id)
      if (seq === generation.current) setExecution(started)
    })
    if (seq === generation.current) setBusy(false)
  }
  async function startRepair() {
    if (!api || !job) return
    const seq = generation.current
    setBusy(true)
    await protect(async () => {
      const started = await api.startRepair(job.job_id)
      if (seq === generation.current) setExecution(started)
    })
    if (seq === generation.current) setBusy(false)
  }
  function newTask() {
    ++generation.current
    setContext(undefined)
    setJob(undefined)
    setReview(undefined)
    setPlanJob(undefined)
    setPlanResult(undefined)
    setChanges(undefined)
    setError('')
    setBusy(false)
    localStorage.removeItem('arl.task')
    setExecution(undefined)
  }
  const workspaceName =
    context?.repository?.replace(/\\/g, '/').split('/').pop() ||
    repo.replace(/\\/g, '/').split('/').pop()
  const workspaceActions = context && (
    <div className="document-actions">
      <Button
        size="sm"
        variant="outline"
        onClick={() => protect(async () => api?.openWorkspace(context.task_id))}
      >
        <FolderOpen />
        打开目录
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          protect(async () => {
            await api?.copyWorkspace(context.task_id)
            setNotice('工作区路径已复制')
          })
        }
      >
        <Copy />
        复制路径
      </Button>
    </div>
  )
  const difference = (
    <div className="pane-body">
      {changesError ? (
        <div className="loading-text" role="alert">
          改动读取失败：{changesError}
          <Button variant="outline" size="sm" onClick={showChanges}>
            重新读取改动
          </Button>
        </div>
      ) : !changes ? (
        <div className="loading-text">
          {changesLoading ? '正在读取改动…' : '点击读取工作区改动'}
          {!changesLoading && (
            <Button variant="outline" size="sm" onClick={showChanges}>
              读取改动
            </Button>
          )}
        </div>
      ) : !changes.patch ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileCode2 />
            </EmptyMedia>
            <EmptyTitle>尚无代码改动</EmptyTitle>
            <EmptyDescription>在任务工作区修改或新增文件后，点刷新查看。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : changes.truncated ? (
        <>
          <p className="supporting">仅显示前 200 KB，完整差异请在工作区查看。</p>
          <pre>{changes.patch}</pre>
        </>
      ) : (
        <Suspense fallback={<p className="loading-text">加载代码视图…</p>}>
          <PatchView patch={changes.patch} theme={dark ? 'github-dark' : 'github-light'} />
        </Suspense>
      )}
    </div>
  )
  const reviewerName = agentName((context?.agents || defaultAgents).reviewer)
  const plannerName = agentName((context?.agents || defaultAgents).planner)
  const reviewPanel = (
    <div className="review-body">
      <div className="review-intro">
        <ShieldCheck />
        <h2>{reviewerName} 代码审查</h2>
      </div>
      {!job ? (
        <>
          <p>代码准备完成后停止编辑，再审查一次固定快照。</p>
          <div className="quota-note">
            <span>使用所选审查 Agent 的账号额度</span>
            <span>每项任务最多两次</span>
          </div>
          <Button disabled={busy} onClick={startReview}>
            <ShieldCheck />
            发起 {reviewerName} 审查
          </Button>
        </>
      ) : (
        <>
          <div className="review-status">
            <Badge variant="secondary">{states[job.status] ?? job.status}</Badge>
            {!terminal.has(job.status) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  protect(async () => {
                    const seq = generation.current
                    const status = await api!.cancelReview(job.job_id)
                    if (seq === generation.current) setJob(status)
                  })
                }
              >
                <Square />
                停止审查
              </Button>
            )}
          </div>
          {job.error_code && (
            <Alert variant="destructive">
              <AlertTitle>审查未完成</AlertTitle>
              <AlertDescription>
                {job.error_message || job.error_code}。请检查原生会话与工作区配置。
              </AlertDescription>
            </Alert>
          )}
          {review && (
            <>
              <p className="preserve">{review.summary}</p>
              <div className="result-facts">
                <Badge variant="outline">{review.verdict}</Badge>
                <span>快照 {review.freshness}</span>
                <span>检查 {review.checks.status}</span>
              </div>
              {review.findings.map((finding, index) => (
                <article className="finding" key={`${finding.path}:${index}`}>
                  <strong>
                    P{finding.priority} · {finding.path}
                    {finding.line !== null && `:${finding.line}`}
                  </strong>
                  <p>{finding.trigger}</p>
                  <p>{finding.impact}</p>
                  <pre>{finding.evidence}</pre>
                </article>
              ))}
              {review.next_after_index !== null && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    protect(async () => {
                      const seq = generation.current
                      const more = await api!.readReview(job.job_id, review.next_after_index!)
                      if (seq === generation.current)
                        setReview({ ...more, findings: [...review.findings, ...more.findings] })
                    })
                  }
                >
                  加载更多问题
                </Button>
              )}
              <p className="supporting">审查通过不等于测试通过或人工验收完成。</p>
            </>
          )}
          {terminal.has(job.status) && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || reviewAttempts >= 2}
              onClick={() => {
                reviewRequest.current = { task: 0, id: '' }
                startReview()
              }}
            >
              {reviewAttempts >= 2 ? '审查次数已用完（2/2）' : '新一轮审查（消耗额度）'}
            </Button>
          )}
        </>
      )}
    </div>
  )
  return (
    <SidebarProvider
      className="app-shell"
      style={{ '--sidebar-width': '240px' } as React.CSSProperties}
    >
      <WorkbenchShell
        onGuide={() => protect(async () => api?.openGuide())}
        onAgents={() => setSettingsOpen(true)}
        sidebar={
          <TaskSidebar
            tasks={[...tasks].reverse()}
            selected={context?.task_id}
            search={search}
            onSearch={setSearch}
            onSelect={(id) => {
              setSettingsOpen(false)
              selectTask(id)
            }}
            onNew={() => {
              setSettingsOpen(false)
              newTask()
            }}
            onRefresh={() => protect(() => refresh())}
            onLoadMore={next !== null ? () => protect(() => refresh(next)) : undefined}
            busy={busy}
            connection={connection?.connected ? '本地任务服务已连接' : '本地服务未连接'}
          />
        }
        toolbar={
          <>
            <div className="breadcrumb">
              <span>{workspaceName || '工作台'}</span>
              <ChevronRight />
              <strong>
                {settingsOpen ? 'Agent 设置' : context ? context.task.title : '新建任务'}
              </strong>
            </div>
            <div className="toolbar-actions">
              {context && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="查看代码改动"
                  onClick={() => {
                    setDiffRequest((n) => n + 1)
                    showChanges()
                  }}
                >
                  <GitBranch />
                  代码改动
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
                <Settings2 />
                Agent 设置
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={dark ? '切换浅色' : '切换深色'}
                    onClick={() => setDark(!dark)}
                  >
                    {dark ? <Sun /> : <Moon />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{dark ? '浅色主题' : '深色主题'}</TooltipContent>
              </Tooltip>
            </div>
          </>
        }
      >
        {(error || connection?.error) && (
          <Alert variant="destructive" className="app-alert">
            <AlertTitle>操作未完成</AlertTitle>
            <AlertDescription>
              {error || connection?.error}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setError('')
                  if (!connection?.connected) protect(() => refresh())
                }}
              >
                {connection?.connected ? '关闭错误提示' : '重新连接 / 刷新'}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert className="app-alert">
            <AlertDescription>
              <span role="status">{notice}</span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="关闭提示"
                onClick={() => setNotice('')}
              >
                <X />
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {settingsOpen ? (
          <AgentSettings onClose={() => setSettingsOpen(false)} />
        ) : !context ? (
          <div className="new-task-surface" data-upstream="jean/WelcomeProjectGrid">
            <h1 className="new-task-title">开始一项开发任务</h1>
            <form onSubmit={prepare} className="w-full max-w-4xl">
              <FieldGroup>
                <p className="supporting">
                  选择项目文件夹或保存位置即可。已有文件会保留，新项目会自动使用独立子文件夹。
                </p>
                <Field>
                  <FieldLabel htmlFor="repo" className="sr-only">
                    项目目录
                  </FieldLabel>
                  <InputGroup>
                    <FolderOpen className="project-input-icon" />
                    <InputGroupInput
                      id="repo"
                      value={repo}
                      onChange={(event) => setRepo(event.target.value)}
                      required
                      placeholder="选择项目文件夹（支持空文件夹）"
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="sm"
                        onClick={() =>
                          protect(async () => {
                            const path = await api?.chooseProject()
                            if (path) setRepo(path)
                          })
                        }
                      >
                        浏览目录
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
                <ComposerLayout
                  dark={dark}
                  leading={
                    <span className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                      <GitBranch className="size-3.5" />
                      独立工作区
                    </span>
                  }
                  trailing={
                    <Button
                      type="submit"
                      className="rounded-full"
                      disabled={busy || !connection?.connected}
                    >
                      {busy ? '正在准备…' : '准备任务'}
                      <ArrowUp />
                    </Button>
                  }
                >
                  <label htmlFor="instructions" className="sr-only">
                    需求
                  </label>
                  <Textarea
                    id="instructions"
                    rows={5}
                    maxLength={8000}
                    required
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    placeholder="你想实现什么？描述当前行为与期望结果…"
                    aria-label="你想实现什么？"
                    className="min-h-28 w-full resize-none border-0 bg-transparent py-2 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </ComposerLayout>
                <Field>
                  <FieldLabel htmlFor="acceptance">验收条件</FieldLabel>
                  <Textarea
                    id="acceptance"
                    rows={2}
                    maxLength={4000}
                    required
                    value={acceptance}
                    onChange={(event) => setAcceptance(event.target.value)}
                    placeholder="怎样才算完成？写下可检查的结果。"
                    aria-label="怎样算完成？"
                  />
                </Field>
                <AgentPicker
                  value={agents}
                  onChange={setAgents}
                  onManage={() => setSettingsOpen(true)}
                />
                <details className="task-settings">
                  <summary>
                    <MoreHorizontal />
                    任务设置<span>可选</span>
                  </summary>
                  <Field>
                    <FieldLabel htmlFor="title">任务名称</FieldLabel>
                    <Input
                      id="title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      maxLength={160}
                      placeholder="留空时使用需求第一行"
                    />
                  </Field>
                </details>
              </FieldGroup>
              <div className="form-footnote">
                <span>准备任务不消耗模型额度。</span>
                <span>计划就绪后，交给所选执行 Agent</span>
              </div>
            </form>
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="task-panels">
            <ResizablePanel id="timeline" order={1} defaultSize={62} minSize={42}>
              <div className="timeline-pane conversation-pane">
                <TaskTimeline
                  key={context.task_id}
                  context={context}
                  planJob={planJob}
                  plan={planResult}
                  execution={execution}
                  workbuddyConnected={workbuddy?.connected}
                  onCancelExecution={() =>
                    protect(async () => {
                      if (api && execution)
                        setExecution(await api.cancelExecution(execution.job_id))
                    })
                  }
                  reviewJob={job}
                  review={review}
                  patch={changes?.patch}
                  busy={busy}
                  workspaceActions={workspaceActions}
                  onRefresh={() => protect(refreshTask)}
                  onAction={taskAction}
                  planContent={
                    <PlanPanel
                      agentName={plannerName}
                      attempts={planAttempts}
                      job={planJob}
                      result={planResult}
                      busy={busy || Boolean(job && !terminal.has(job.status))}
                      onStart={startPlan}
                      onRefresh={() => protect(refreshPlan)}
                      onCancel={() =>
                        protect(async () => {
                          const seq = generation.current
                          const status = await api!.cancelPlan(planJob!.job_id)
                          if (seq === generation.current) setPlanJob(status)
                        })
                      }
                    />
                  }
                  reviewContent={reviewPanel}
                />
              </div>
            </ResizablePanel>
            {changesOpen && (
              <>
                <ResizableHandle />
                <ResizablePanel id="changes" order={2} defaultSize={38} minSize={28}>
                  <WorkspaceInspector
                    key={context.task_id}
                    context={context}
                    plan={planJob}
                    review={job}
                    execution={execution}
                    difference={difference}
                    showDiff={diffRequest}
                    onDiff={showChanges}
                    onClose={() => setChangesOpen(false)}
                    refreshKey={`${execution?.status}:${execution?.phase}:${context.task.status}`}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        )}
      </WorkbenchShell>
    </SidebarProvider>
  )
}
