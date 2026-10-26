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
import { Popover, PopoverContent, PopoverTrigger } from '@jean/components/ui/popover'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@jean/components/ui/resizable'
import { Separator } from '@jean/components/ui/separator'
import { SidebarProvider } from '@jean/components/ui/sidebar'
import { WorkbenchShell } from '@jean/components/workbench/WorkbenchShell'
import { TaskSidebar } from '@jean/components/workbench/TaskSidebar'
import { ToggleGroup, ToggleGroupItem } from '@jean/components/ui/toggle-group'
import { Tooltip, TooltipTrigger, TooltipContent } from '@jean/components/ui/tooltip'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChevronRight,
  Code2,
  Copy,
  FileCode2,
  FolderOpen,
  GitBranch,
  Moon,
  MoreHorizontal,
  PanelRightClose,
  RefreshCw,
  ShieldCheck,
  Square,
  Sun,
  Unplug,
  X
} from 'lucide-react'
import type { Context, PlanResult, Review, ReviewStatus, Task } from '../../shared/types'
import PlanPanel from './PlanPanel'
import { ComposerLayout } from './vendor/codex/ComposerLayout'
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
  const [search, setSearch] = useState('')
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
  const [planJob, setPlanJob] = useState<ReviewStatus>()
  const [planResult, setPlanResult] = useState<PlanResult>()
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const startRequest = useRef({ fingerprint: '', id: '' })
  const reviewRequest = useRef({ task: 0, id: '' })
  const planRequest = useRef({ task: 0, id: '' })
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
  }
  const workspaceName =
    context?.repository?.replace(/\\/g, '/').split('/').pop() ||
    repo.replace(/\\/g, '/').split('/').pop()
  const taskDescription = context && (
    <div className="task-document">
      <div className="document-heading">
        <Badge variant="outline">#{context.task_id}</Badge>
        <span>{states[context.task.status] ?? context.task.status}</span>
      </div>
      <h2>{context.task.title}</h2>
      <section>
        <h3>需求</h3>
        <p className="preserve">{context.task.instructions}</p>
      </section>
      <section>
        <h3>验收条件</h3>
        <p className="preserve">{context.task.acceptance}</p>
      </section>
      <div className="workspace-event">
        <Check />
        <div>
          <strong>独立工作区已创建</strong>
          <p>
            基于提交 <code>{context.base_commit.slice(0, 10)}</code>，修改将与原目录隔离。
          </p>
          <code className="workspace-code">{context.workspace}</code>
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
        </div>
      </div>
      <div className="next-step">
        <Unplug />
        <p>可以先生成执行计划。WorkBuddy 自动执行尚未接入；修改代码后可查看差异并发起审查。</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setTab('plan')
          if (planJob) protect(refreshPlan)
        }}
      >
        查看执行计划
      </Button>
    </div>
  )
  const difference = (
    <div className="pane-body">
      {!changes ? (
        <p className="loading-text">正在读取改动…</p>
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
  const reviewPanel = (
    <div className="review-body">
      <div className="review-intro">
        <ShieldCheck />
        <h2>Codex 代码审查</h2>
      </div>
      {!job ? (
        <>
          <p>代码准备完成后停止编辑，再审查一次固定快照。</p>
          <div className="quota-note">
            <span>使用本机 Codex 账号额度</span>
            <span>每项任务最多两次</span>
          </div>
          <Button disabled={busy} onClick={startReview}>
            <ShieldCheck />
            发起 Codex 审查
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
              <AlertDescription>{job.error_code}。请检查本机 Codex 与工作区配置。</AlertDescription>
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
              disabled={busy}
              onClick={() => {
                reviewRequest.current = { task: 0, id: '' }
                startReview()
              }}
            >
              新一轮审查（消耗额度）
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
        sidebar={
          <TaskSidebar
            tasks={[...tasks].reverse()}
            selected={context?.task_id}
            search={search}
            onSearch={setSearch}
            onSelect={selectTask}
            onNew={newTask}
            onRefresh={() => protect(() => refresh())}
            onLoadMore={next !== null ? () => protect(() => refresh(next)) : undefined}
            busy={busy}
            connection={
              connection?.connected ? `MCP · ${connection.tools} 个工具可用` : '本地服务未连接'
            }
          />
        }
        toolbar={
          <>
            <div className="breadcrumb">
              <span>{workspaceName || '工作台'}</span>
              <ChevronRight />
              <strong>{context ? context.task.title : '新建任务'}</strong>
            </div>
            <div className="toolbar-actions">
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="ghost">
                    <span className="status-dot" />
                    Agent 连接
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end">
                  <h2 className="popover-title">Agent 连接</h2>
                  <div className="connection-row">
                    <ShieldCheck />
                    <div>
                      <strong>Codex</strong>
                      <span>计划与审查时连接本机 CLI</span>
                    </div>
                    <Badge variant="outline">按需</Badge>
                  </div>
                  <div className="connection-row">
                    <Code2 />
                    <div>
                      <strong>WorkBuddy</strong>
                      <span>自动执行接口尚未接通</span>
                    </div>
                    <Badge variant="outline">未接入</Badge>
                  </div>
                  <Separator />
                  <p className="supporting">
                    可在任务内显式生成 Codex
                    执行计划。创建任务只准备本地工作区，不会自动派发或调用模型。
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => protect(async () => api?.openGuide())}
                  >
                    查看接入说明
                  </Button>
                </PopoverContent>
              </Popover>
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
                  protect(() => refresh())
                }}
              >
                重新连接 / 刷新
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
        {!context ? (
          <div
            className="flex min-h-0 flex-1 flex-col items-center gap-6 overflow-y-auto px-6 py-12 font-sans"
            data-upstream="jean/WelcomeProjectGrid"
          >
            <h1 className="text-4xl font-bold text-foreground">新的开发任务</h1>
            <form onSubmit={prepare} className="w-full max-w-4xl">
              <FieldGroup>
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
                      placeholder="选择 Git 项目目录"
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
                      独立工作区 · HEAD
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
                <span>WorkBuddy 自动执行未接入</span>
              </div>
            </form>
          </div>
        ) : (
          <>
            <div className="task-toolbar">
              <div>
                <Badge variant="outline">#{context.task_id}</Badge>
                <h1>{context.task.title}</h1>
              </div>
              <ToggleGroup
                type="single"
                size="sm"
                value={tab}
                aria-label="任务视图"
                onValueChange={(value) => {
                  if (value === 'changes') showChanges()
                  else if (value === 'plan') {
                    setTab('plan')
                    if (planJob) protect(refreshPlan)
                  } else if (value) setTab(value)
                }}
              >
                <ToggleGroupItem value="task" aria-label="任务说明">
                  任务说明
                </ToggleGroupItem>
                <ToggleGroupItem value="plan" aria-label="执行计划">
                  执行计划
                </ToggleGroupItem>
                <ToggleGroupItem value="changes" aria-label="代码改动">
                  代码改动
                </ToggleGroupItem>
                <ToggleGroupItem value="review" aria-label="审查结果">
                  审查结果
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            {tab === 'task' ? (
              <div className="single-document">{taskDescription}</div>
            ) : (
              <ResizablePanelGroup direction="horizontal" className="task-panels">
                <ResizablePanel defaultSize={40} minSize={25}>
                  <div className="context-pane">
                    <div className="pane-title">
                      <span>
                        <FileCode2 />
                        任务上下文
                      </span>
                    </div>
                    {taskDescription}
                  </div>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={60} minSize={40}>
                  <div className="work-pane">
                    <div className="pane-title">
                      <span>
                        {tab === 'changes' ? (
                          <>
                            <GitBranch />
                            工作区改动
                          </>
                        ) : (
                          <>
                            <ShieldCheck />
                            {tab === 'plan' ? '执行计划' : '审查结果'}
                          </>
                        )}
                      </span>
                      <div>
                        {tab === 'changes' && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="刷新改动"
                            onClick={showChanges}
                          >
                            <RefreshCw />
                          </Button>
                        )}
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="收起右侧面板"
                          onClick={() => setTab('task')}
                        >
                          <PanelRightClose />
                        </Button>
                      </div>
                    </div>
                    {tab === 'changes' ? (
                      difference
                    ) : tab === 'plan' ? (
                      <PlanPanel
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
                    ) : (
                      reviewPanel
                    )}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </>
        )}
      </WorkbenchShell>
    </SidebarProvider>
  )
}
