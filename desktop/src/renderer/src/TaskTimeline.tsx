import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import {
  FileText,
  FolderGit2,
  GitBranch,
  ListChecks,
  ShieldCheck,
  ChevronDown,
  RefreshCw
} from 'lucide-react'
import { Button } from '@jean/components/ui/button'
import { Badge } from '@jean/components/ui/badge'
import {
  WorkLogBlock,
  WorkLogList,
  WorkLogButton,
  WorkLogRow,
  WorkLogDetails
} from './vendor/t3code/WorkLog'
import type { Context, PlanResult, Review, ReviewStatus } from '../../shared/types'
import { taskFlow, terminal, type TaskAction } from './taskFlow'

const labels: Record<string, string> = {
  preparing: '准备中',
  running: '进行中',
  cancelling: '停止中',
  succeeded: '已返回',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断'
}
function stateLabel(job?: ReviewStatus) {
  return job ? (labels[job.status] ?? job.status) : '尚未发起'
}

export function TaskTimeline({
  context,
  planJob,
  plan,
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const planRef = useRef<HTMLDivElement>(null),
    reviewRef = useRef<HTMLDivElement>(null)
  const flow = taskFlow(context, planJob, plan, reviewJob, review, patch)
  const planOpen = expanded.plan ?? Boolean(planJob && !reviewJob)
  const reviewOpen = expanded.review ?? Boolean(reviewJob)
  const toggle = (key: string, current: boolean) =>
    setExpanded((previous) => ({ ...previous, [key]: !current }))
  function action(value: TaskAction) {
    if (value === 'plan-record' || value === 'plan') {
      setExpanded((previous) => ({ ...previous, plan: true }))
      planRef.current?.scrollIntoView({ block: 'nearest' })
    }
    if (value === 'review-record' || value === 'review') {
      setExpanded((previous) => ({ ...previous, review: true }))
      reviewRef.current?.scrollIntoView({ block: 'nearest' })
    }
    onAction(value)
  }
  const count = (kind: 'plan' | 'review', current?: ReviewStatus) =>
    new Set([
      ...(context.activity ?? []).filter((row) => row.kind === kind).map((row) => row.id),
      ...(current ? [current.job_id] : [])
    ]).size
  return (
    <section className="task-timeline" aria-label="任务工作记录" data-upstream="t3code/WorkLog">
      <div className="flow-heading">
        <div>
          <Badge variant="outline">#{context.task_id}</Badge>
          <h1>{context.task.title}</h1>
        </div>
        <Button size="sm" variant="ghost" aria-label="刷新任务记录" onClick={onRefresh}>
          <RefreshCw />
          刷新
        </Button>
      </div>
      <div className="agent-assignment" aria-label="Agent 分工">
        <span>
          规划 <strong>Codex</strong> · 按需连接
        </span>
        <span>
          执行 <strong>WorkBuddy</strong> · 未接入
        </span>
        <span>
          审查 <strong>Codex</strong> · 按需连接
        </span>
      </div>
      <div className="current-stage" aria-label="当前阶段">
        <div role="status" aria-live="polite">
          <strong>{flow.label}</strong>
          <p>{flow.detail}</p>
        </div>
        <Button size="sm" disabled={busy} onClick={() => action(flow.action)}>
          {flow.button}
        </Button>
      </div>
      <div className="task-records">
        <WorkLogList>
          <WorkLogBlock>
            <WorkLogButton
              icon={<FileText className="size-4" />}
              label="需求与验收"
              trailing={
                <ChevronDown className={`size-3.5 ${expanded.request ? 'rotate-180' : ''}`} />
              }
              aria-expanded={!!expanded.request}
              onClick={() => toggle('request', !!expanded.request)}
            />
            <p className="request-preview">
              {context.task.instructions.split('\n')[0].slice(0, 160)}
            </p>
            {expanded.request && (
              <WorkLogDetails kind="panel">
                <div className="record-prose">
                  <p className="preserve">{context.task.instructions}</p>
                  <h2>验收条件</h2>
                  <p className="preserve">{context.task.acceptance}</p>
                </div>
              </WorkLogDetails>
            )}
          </WorkLogBlock>
          <WorkLogBlock>
            <WorkLogButton
              icon={<FolderGit2 className="size-4" />}
              label="独立工作区已创建"
              trailing={
                <ChevronDown className={`size-3.5 ${expanded.workspace ? 'rotate-180' : ''}`} />
              }
              aria-expanded={!!expanded.workspace}
              onClick={() => toggle('workspace', !!expanded.workspace)}
            />
            {expanded.workspace && (
              <WorkLogDetails kind="panel">
                <div className="record-prose">
                  <p>
                    基础提交 <code>{context.base_commit.slice(0, 10)}</code>
                  </p>
                  <code className="workspace-code">{context.workspace}</code>
                  {workspaceActions}
                </div>
              </WorkLogDetails>
            )}
          </WorkLogBlock>
          <WorkLogBlock>
            <div ref={planRef}>
              <WorkLogButton
                icon={<ListChecks className="size-4" />}
                label="Codex · 执行计划"
                trailing={<span className="record-status">{stateLabel(planJob)}</span>}
                aria-expanded={planOpen}
                onClick={() => toggle('plan', planOpen)}
              />
              {planOpen ? (
                <WorkLogDetails kind="panel">{planContent}</WorkLogDetails>
              ) : (
                plan && <p className="request-preview">{plan.plan.summary.slice(0, 160)}</p>
              )}
            </div>
          </WorkLogBlock>
          <WorkLogBlock>
            <WorkLogRow
              icon={<GitBranch className="size-4" />}
              label={
                context.task.status === 'submitted'
                  ? '执行结果已提交'
                  : context.task.status === 'claimed'
                    ? `执行任务已领取 · ${context.task.owner || '未提供名称'}`
                    : 'WorkBuddy · 等待执行接入'
              }
            />
            <WorkLogDetails kind="panel">
              <div className="record-prose supporting">
                {context.task.result?.summary ||
                  (context.task.status === 'claimed'
                    ? '这是 MCP 任务领取记录，尚未收到执行完成提交。'
                    : '尚无执行结果。WorkBuddy 自动派发、检查与返修尚未接通。')}
                {patch?.trim() && <p>已发现工作区改动；文件变化不等于执行完成。</p>}
              </div>
            </WorkLogDetails>
          </WorkLogBlock>
          <WorkLogBlock>
            <div ref={reviewRef}>
              <WorkLogButton
                icon={<ShieldCheck className="size-4" />}
                label="Codex · 代码审查"
                trailing={<span className="record-status">{stateLabel(reviewJob)}</span>}
                aria-expanded={reviewOpen}
                onClick={() => toggle('review', reviewOpen)}
              />
              {reviewOpen ? (
                <WorkLogDetails kind="panel">{reviewContent}</WorkLogDetails>
              ) : (
                review && <p className="request-preview">{review.summary.slice(0, 160)}</p>
              )}
            </div>
          </WorkLogBlock>
        </WorkLogList>
        <details className="job-history">
          <summary>
            已保存作业记录 · 计划 {count('plan', planJob)}/2 · 审查 {count('review', reviewJob)}/2
          </summary>
          <p className="supporting">失败、取消也计入；本区域只读取记录，不发起模型调用。</p>
          {(context.activity ?? []).map((row) => (
            <div key={`${row.kind}:${row.id}`} className="history-row">
              <span>
                {row.kind === 'workspace'
                  ? '工作区创建'
                  : row.kind === 'plan'
                    ? 'Codex 计划'
                    : 'Codex 审查'}{' '}
                ·{' '}
                {row.kind === 'workspace'
                  ? '已完成'
                  : row.id === planJob?.job_id
                    ? stateLabel(planJob)
                    : row.id === reviewJob?.job_id
                      ? stateLabel(reviewJob)
                      : (labels[row.status] ?? row.status)}
              </span>
              <time dateTime={new Date(row.updated_at * 1000).toISOString()}>
                {new Date(row.updated_at * 1000).toLocaleString('zh-CN')}
              </time>
              {row.error_code && <code>{row.error_code}</code>}
            </div>
          ))}
          {context.activity_truncated && <p className="supporting">仅显示最近十条模型作业记录。</p>}
        </details>
        {Boolean(planJob && !terminal.has(planJob.status)) && (
          <p className="supporting">可以切换任务，当前作业继续在后台进行。</p>
        )}
      </div>
    </section>
  )
}
