import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import {
  ChevronDown,
  Code2,
  ExternalLink,
  FolderGit2,
  ListChecks,
  RefreshCw,
  ShieldCheck
} from 'lucide-react'
import { Button } from '@jean/components/ui/button'
import { agentName, defaultAgents } from '../../shared/types'
import type { Context, ExecutionStatus, PlanResult, Review, ReviewStatus } from '../../shared/types'
import { taskFlow, terminal, type TaskAction } from './taskFlow'
import { ChatWorkspace, UserMessage } from './vendor/t3code/ChatWorkspace'
import { TimelineSystemDivider } from './vendor/t3code/TimelineSystemDivider'

function NativeEvents({
  job,
  kind,
  onRefresh
}: {
  job?: ReviewStatus
  kind: 'plan' | 'review' | 'execution'
  onRefresh: () => void
}) {
  const [answer, setAnswer] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  async function respond(value: string | Record<string, string>) {
    if (!job?.pending) return
    setSending(true)
    try {
      await window.workbench!.answerRequest(job.job_id, job.pending.id, value, kind)
      setError('')
      onRefresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setSending(false)
    }
  }
  const name = agentName(job?.backend || 'codex')
  return (
    <>
      {job?.environment === 'native' && (
        <p className="native-environment">
          本机配置 · {job.model || '默认模型'}
          {job.effort && ` · ${job.effort}`} · {job.skills_count ?? '—'} Skills ·{' '}
          {job.mcp_servers?.length ?? 0} MCP 配置 · 会话已保存
        </p>
      )}
      {job?.environment === 'acp' && (
        <p className="native-environment">
          ACP · {name} · {job.model || 'Agent默认模型'} · 会话记录已保存
        </p>
      )}
      {!!job?.events?.length && (
        <details className="native-events" open={!terminal.has(job.status)}>
          <summary>工具与会话记录 · {job.events.length} 项</summary>
          {job.events.map((entry, index) => (
            <details key={`${entry.id}:${index}`} className="tool-event">
              <summary>
                <Code2 className="size-3.5" />
                <span>
                  {entry.kind === 'agentMessage' ? `${name} 回复` : entry.text.slice(0, 110)}
                </span>
                <small>{entry.status}</small>
              </summary>
              <pre>
                {entry.text}
                {entry.output && `\n\n${entry.output}`}
              </pre>
            </details>
          ))}
          <p className="supporting">展示最近 60 项；原始记录保存在本机作业目录。</p>
        </details>
      )}
      {job?.pending && (
        <section className="native-request" aria-label={`${name} 等待你处理`}>
          <strong>{name} 等待你处理</strong>
          <p>{job.pending.params.reason || '本机策略要求确认后才能继续。'}</p>
          {job.pending.params.command ? (
            <pre>{job.pending.params.command}</pre>
          ) : (
            job.pending.method !== 'item/tool/requestUserInput' && (
              <pre>{JSON.stringify(job.pending.params, null, 2)}</pre>
            )
          )}
          {job.pending.method === 'acp/permission' ? (
            <div className="document-actions">
              {job.pending.params.options?.map((option) => (
                <Button
                  key={option.optionId}
                  size="sm"
                  variant={option.kind.startsWith('reject') ? 'outline' : 'default'}
                  disabled={sending}
                  onClick={() => respond(option.optionId)}
                >
                  {option.name}
                </Button>
              ))}
            </div>
          ) : job.pending.method === 'item/tool/requestUserInput' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                respond(answer)
              }}
            >
              {job.pending.params.questions?.map((q) => (
                <label key={q.id}>
                  {q.question}
                  {q.options && (
                    <select
                      required
                      value={answer[q.id] || ''}
                      onChange={(e) => setAnswer({ ...answer, [q.id]: e.target.value })}
                    >
                      <option value="">选择答复</option>
                      {q.options.map((o) => (
                        <option key={o.label} value={o.label}>
                          {o.label} — {o.description}
                        </option>
                      ))}
                    </select>
                  )}
                  {!q.options && (
                    <input
                      required
                      maxLength={4000}
                      value={answer[q.id] || ''}
                      onChange={(e) => setAnswer({ ...answer, [q.id]: e.target.value })}
                    />
                  )}
                </label>
              ))}
              <Button size="sm" disabled={sending}>
                提交答复
              </Button>
            </form>
          ) : (
            <div className="document-actions">
              <Button size="sm" disabled={sending} onClick={() => respond('accept')}>
                允许这一次
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={sending}
                onClick={() => respond('decline')}
              >
                拒绝
              </Button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      )}
    </>
  )
}

export function TaskTimeline({
  context,
  planJob,
  plan,
  execution,
  workbuddyConnected,
  onCancelExecution,
  reviewJob,
  review,
  patch,
  planContent,
  reviewContent,
  workspaceActions,
  busy,
  onAction,
  onRefresh
}: {
  context: Context
  planJob?: ReviewStatus
  plan?: PlanResult
  execution?: ExecutionStatus
  workbuddyConnected?: boolean
  onCancelExecution: () => void
  reviewJob?: ReviewStatus
  review?: Review
  patch?: string
  planContent: ReactNode
  reviewContent: ReactNode
  workspaceActions: ReactNode
  busy: boolean
  onAction: (action: TaskAction) => void
  onRefresh: () => void
}) {
  const selected = context.agents || defaultAgents
  const planner = agentName(selected.planner),
    executor = agentName(selected.executor),
    reviewer = agentName(selected.reviewer)
  const [sessionError, setSessionError] = useState('')
  const planRef = useRef<HTMLElement>(null)
  const executionRef = useRef<HTMLElement>(null)
  const reviewRef = useRef<HTMLElement>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const flow = taskFlow(context, planJob, plan, reviewJob, review, patch, execution)
  const planOpen = expanded.plan ?? Boolean(planJob && !execution && !reviewJob)
  const reviewOpen = expanded.review ?? Boolean(reviewJob)
  const executionOpen = expanded.execution ?? Boolean(execution || context.task.result)
  const executionSummary = execution?.summary || context.task.result?.summary
  const toggle = (key: string, value: boolean) =>
    setExpanded((previous) => ({ ...previous, [key]: !value }))
  const count = (kind: 'plan' | 'review' | 'execution' | 'execution', current?: ReviewStatus) =>
    new Set([
      ...context.activity.filter((row) => row.kind === kind).map((row) => row.id),
      ...(current ? [current.job_id] : [])
    ]).size
  function action(value: TaskAction) {
    const showExecution =
      value === 'execute' || value === 'repair' || (value === 'refresh' && execution && !reviewJob)
    if (showExecution) setExpanded((p) => ({ ...p, execution: true }))
    if (value === 'plan-record' || value === 'plan') setExpanded((p) => ({ ...p, plan: true }))
    if (value === 'review-record' || value === 'review')
      setExpanded((p) => ({ ...p, review: true }))
    const destination = showExecution
      ? executionRef
      : value === 'plan-record' || value === 'plan'
        ? planRef
        : value === 'review-record' || value === 'review'
          ? reviewRef
          : null
    if (destination)
      requestAnimationFrame(() => {
        destination.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
        destination.current?.querySelector('button')?.focus({ preventScroll: true })
      })
    onAction(value)
  }
  const rowHeading = (
    key: string,
    title: string,
    open: boolean,
    icon: ReactNode,
    status: string
  ) => (
    <button
      type="button"
      className="agent-message-heading"
      aria-expanded={open}
      onClick={() => toggle(key, open)}
    >
      {icon}
      <strong>{title}</strong>
      <span>{status}</span>
      <ChevronDown className={`size-3.5 ${open ? 'rotate-180' : ''}`} />
    </button>
  )
  return (
    <section className="task-conversation" aria-label="任务工作记录">
      <ChatWorkspace
        header={
          <>
            <div className="session-title">
              <h1>{context.task.title}</h1>
              <span>
                #{context.task_id} · {planner} 规划 / {executor} 执行 / {reviewer} 审查
              </span>
            </div>
            <Button size="icon-sm" variant="ghost" aria-label="刷新任务记录" onClick={onRefresh}>
              <RefreshCw />
            </Button>
          </>
        }
        footer={
          <>
            <div className="dock-context">
              <span className="status-dot" />
              <span role="status">{flow.label}</span>
              <span>本机 Agent · 独立工作区</span>
            </div>
            <div className="dock-action">
              <p>{flow.detail}</p>
              <Button disabled={busy} onClick={() => action(flow.action)}>
                {flow.button}
              </Button>
            </div>
          </>
        }
      >
        <UserMessage>
          <p className="preserve">{context.task.instructions}</p>
          <details className="acceptance-message">
            <summary>验收条件</summary>
            <p className="preserve">{context.task.acceptance}</p>
          </details>
        </UserMessage>
        <div className="workspace-receipt">
          <FolderGit2 className="size-3.5" />
          <button
            type="button"
            aria-expanded={!!expanded.workspace}
            onClick={() => toggle('workspace', !!expanded.workspace)}
          >
            独立工作区已创建
          </button>
          <code>{context.base_commit.slice(0, 8)}</code>
        </div>
        {expanded.workspace && (
          <div className="workspace-detail">
            <code className="workspace-code">{context.workspace}</code>
            {workspaceActions}
          </div>
        )}
        <TimelineSystemDivider label="规划 → 执行 → 审查" detail="本机 Agent 协作" />
        <article className="agent-message" ref={planRef}>
          {rowHeading(
            'plan',
            `${planner} · 执行计划`,
            planOpen,
            <ListChecks className="size-4" />,
            planJob ? (planJob.status === 'succeeded' ? '已生成' : planJob.status) : '待开始'
          )}
          <NativeEvents job={planJob} kind="plan" onRefresh={onRefresh} />
          {planOpen ? (
            planContent
          ) : (
            <p className="message-preview">
              {plan && plan.freshness !== 'current' && '原计划基于旧代码，查看时请核对当前改动。 '}
              {plan?.plan.summary.slice(0, 180) ||
                '从需求与项目源码拆解实施步骤，交给所选执行 Agent。'}
            </p>
          )}
        </article>
        <article className="agent-message" ref={executionRef}>
          {rowHeading(
            'execution',
            context.task.status === 'submitted'
              ? execution?.mode === 'repair'
                ? '返修结果已提交'
                : '执行结果已提交'
              : `${executor} · 执行`,
            executionOpen,
            <Code2 className="size-4" />,
            execution
              ? execution.status === 'succeeded'
                ? '已返回'
                : execution.phase || execution.status
              : '待派发'
          )}
          <NativeEvents job={execution} kind="execution" onRefresh={onRefresh} />
          {executionOpen && (
            <div className="execution-message">
              <p className="preserve">
                {executionSummary || '计划就绪后，在下方交给所选 Agent 执行。结果将返回这里审查。'}
              </p>
              {execution?.session_id && (
                <p className="supporting">
                  原生会话 {execution.session_id}
                  {execution.model && ` · ${execution.model}`}
                </p>
              )}
              {execution?.session_id && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selected.executor.startsWith('acp:')}
                  onClick={() =>
                    window
                      .workbench!.openSession(context.task_id, 'workbuddy')
                      .catch((e) => setSessionError(String(e)))
                  }
                >
                  <ExternalLink />
                  打开 {executor} 会话
                </Button>
              )}
              {sessionError && <p role="alert">{sessionError}</p>}
              {execution?.review_error && (
                <p role="alert">自动审查未启动：{execution.review_error}</p>
              )}
              {execution?.repair_error && (
                <p role="alert">自动交接已停止：{execution.repair_error}</p>
              )}
              {execution?.source_review_job_id && (
                <p className="supporting">
                  返修依据 {execution.source_review_job_id} · 最多一次返修
                </p>
              )}
              {execution && !terminal.has(execution.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={execution.status === 'cancelling'}
                  onClick={onCancelExecution}
                >
                  停止 {executor} 执行
                </Button>
              )}
            </div>
          )}
          {!executionOpen && executionSummary && (
            <p className="message-preview">{executionSummary.slice(0, 180)}</p>
          )}
        </article>
        <article className="agent-message" ref={reviewRef}>
          {rowHeading(
            'review',
            `${reviewer} · 代码审查`,
            reviewOpen,
            <ShieldCheck className="size-4" />,
            review
              ? review.verdict === 'approved'
                ? '已通过'
                : '需修改'
              : reviewJob?.status || '待开始'
          )}
          <NativeEvents job={reviewJob} kind="review" onRefresh={onRefresh} />
          {reviewOpen ? (
            reviewContent
          ) : (
            <p className="message-preview">
              {review?.summary || '执行提交后，对固定快照进行独立审查。'}
            </p>
          )}
        </article>
        <details className="job-history">
          <summary>
            已保存作业记录 · 计划 {count('plan', planJob)}/2 · 执行/返修{' '}
            {count('execution', execution)}/2 · 审查 {count('review', reviewJob)}/2
          </summary>
          {context.activity.map((row) => (
            <div className="history-row" key={`${row.kind}:${row.id}`}>
              <span>
                {row.kind} · {row.status}
              </span>
              <time>{new Date(row.updated_at * 1000).toLocaleString('zh-CN')}</time>
            </div>
          ))}
          <p className="supporting">失败、取消也计入；刷新和恢复只读记录。</p>
        </details>
        {workbuddyConnected && <p className="supporting">WorkBuddy 本机通道已连接</p>}
      </ChatWorkspace>
    </section>
  )
}
