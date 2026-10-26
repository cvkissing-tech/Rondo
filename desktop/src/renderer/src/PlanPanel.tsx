import { ListChecks, RefreshCw, Square, Unplug } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@jean/components/ui/button'
import { Badge } from '@jean/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@jean/components/ui/alert'
import type { PlanResult, ReviewStatus } from '../../shared/types'
import { ChatEntryContainer } from './vendor/vibe-kanban/ChatEntryContainer'
import { ChatTodoList } from './vendor/vibe-kanban/ChatTodoList'
import './vendor/vibe-kanban/theme.css'

const terminal = new Set(['succeeded', 'failed', 'cancelled', 'interrupted'])
const labels: Record<string, string> = {
  preparing: '准备上下文',
  running: '生成中',
  cancelling: '正在停止',
  succeeded: '计划已生成',
  failed: '生成失败',
  cancelled: '已取消',
  interrupted: '已中断'
}
export default function PlanPanel({
  job,
  result,
  busy,
  onStart,
  onCancel,
  onRefresh
}: {
  job?: ReviewStatus
  result?: PlanResult
  busy: boolean
  onStart: (fresh?: boolean) => void
  onCancel: () => void
  onRefresh: () => void
}) {
  const [stepsExpanded, setStepsExpanded] = useState(true)
  return (
    <section className="plan-body vibe-plan-surface" aria-label="Codex 执行计划">
      <ChatEntryContainer
        variant="plan"
        title="Codex 执行计划"
        expanded
        headerRight={job && <Badge variant="secondary">{labels[job.status] ?? job.status}</Badge>}
        actions={
          job &&
          terminal.has(job.status) &&
          (job.status !== 'succeeded' || result) && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onStart(true)}>
              重新生成计划（消耗额度）
            </Button>
          )
        }
      >
        <div className="space-y-4">
          {!job ? (
            <>
              <p className="supporting">
                Codex 根据当前需求和有限代码上下文，拆出可以交给执行 Agent 的步骤。
              </p>
              <p className="supporting">
                生成一次计划会消耗本机 Codex 账号额度；每项任务最多两次，失败或取消也计入。
              </p>
              <Button disabled={busy} onClick={() => onStart()}>
                <ListChecks />
                生成 Codex 计划
              </Button>
            </>
          ) : (
            <>
              <div className="review-status">
                {!terminal.has(job.status) ? (
                  <Button size="sm" variant="outline" onClick={onCancel}>
                    <Square />
                    停止生成
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" aria-label="刷新计划状态" onClick={onRefresh}>
                    <RefreshCw />
                    刷新
                  </Button>
                )}
              </div>
              {!terminal.has(job.status) && (
                <p className="supporting">
                  正在等待本次生成结果。可以切换视图，任务仍在后台继续；不会自动重试。
                </p>
              )}
              {job.error_code && (
                <Alert variant="destructive">
                  <AlertTitle>计划未生成</AlertTitle>
                  <AlertDescription>
                    {job.error_code}。检查 Codex 登录、额度与项目目录后，可显式发起新一轮。
                  </AlertDescription>
                </Alert>
              )}
              {job.status === 'succeeded' && !result && (
                <p className="supporting" role="status">
                  正在读取已保存的计划…
                </p>
              )}
              {result && (
                <>
                  {result.freshness !== 'current' && (
                    <Alert variant="destructive">
                      <AlertTitle>代码已变化，计划已过期</AlertTitle>
                      <AlertDescription>
                        这份计划基于旧版本，请重新核对步骤或生成新计划。
                      </AlertDescription>
                    </Alert>
                  )}
                  <p className="preserve plan-summary">{result.plan.summary}</p>
                  <ChatTodoList
                    expanded={stepsExpanded}
                    onToggle={() => setStepsExpanded((value) => !value)}
                    todos={result.plan.steps.map((step) => ({
                      content: step.title.replace(/^\s*\d+[.、)]\s+(?=\S)/, ''),
                      details: (
                        <>
                          <p className="preserve">{step.details}</p>
                          {!!step.files.length && (
                            <div className="plan-files">
                              {step.files.map((file, i) => (
                                <code key={i}>{file}</code>
                              ))}
                            </div>
                          )}
                          <div className="plan-verification">
                            <strong>验收方式</strong>
                            <ul>
                              {step.verification.map((check, i) => (
                                <li key={i}>{check}</li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )
                    }))}
                  />
                  {!!result.plan.assumptions.length && (
                    <details className="plan-assumptions" open>
                      <summary>假设与待确认项</summary>
                      <ul>
                        {result.plan.assumptions.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <p className="supporting">
                    本次读取 {result.context.files.length} 个源码片段，项目共{' '}
                    {result.context.file_count} 个文件
                    {result.context.file_list_truncated ? '，文件列表已截断' : ''}
                    。计划中的验收方式尚未执行。
                  </p>
                  {result.usage?.total?.totalTokens !== undefined && (
                    <p className="supporting">
                      本次用量 {result.usage.total.totalTokens.toLocaleString()} tokens
                      {result.cost == null ? ' · 费用未返回' : ''}
                    </p>
                  )}
                </>
              )}
            </>
          )}
          <div className="next-step">
            <Unplug />
            <p>WorkBuddy 自动执行未接入。生成计划不会修改代码或自动运行其中的命令。</p>
          </div>
        </div>
      </ChatEntryContainer>
    </section>
  )
}
