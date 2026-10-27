import { GitBranch } from 'lucide-react'
import { Button } from '@jean/components/ui/button'
import type { PlanResult } from '../../shared/types'
import type { taskFlow } from './taskFlow'

// Status stays task-wide; adoption lives beside the conversation or full plan.
export function WorkflowBar({
  flow,
  executor,
  reviewer
}: {
  flow: ReturnType<typeof taskFlow>
  executor: string
  reviewer: string
}) {
  return (
    <section className="workflow-strip" aria-label="自动工作流">
      <div className="workflow-description">
        <div>
          <GitBranch className="size-3.5" />
          <strong>自动工作流</strong>
          <span role="status">{flow.label}</span>
        </div>
        <p>
          {executor} 执行 → 项目检查 → {reviewer} 审查 → 需要时返修一次并复查
        </p>
      </div>
    </section>
  )
}

export function PlanAdoption({
  plan,
  executor,
  busy,
  onExecute
}: {
  plan: PlanResult
  executor: string
  busy: boolean
  onExecute: () => void
}) {
  return (
    <div className="plan-adoption">
      <Button size="sm" disabled={busy} onClick={onExecute}>
        采用 V{plan.version || 1}，交给 {executor} 执行
      </Button>
      <span>启动后自动接续检查与审查 · 使用各 Agent 账号额度</span>
    </div>
  )
}
