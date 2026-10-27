import { GitBranch } from 'lucide-react'
import { Button } from '@jean/components/ui/button'
import type { PlanResult } from '../../shared/types'
import type { taskFlow } from './taskFlow'

// Outside both panels: opening a compact inspector cannot hide task dispatch.
export function WorkflowBar({
  flow,
  plan,
  executor,
  reviewer,
  busy,
  onExecute
}: {
  flow: ReturnType<typeof taskFlow>
  plan?: PlanResult
  executor: string
  reviewer: string
  busy: boolean
  onExecute: () => void
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
      {flow.action === 'execute' && plan && (
        <div className="workflow-start">
          <Button size="sm" disabled={busy} onClick={onExecute}>
            采用 V{plan.version || 1}，交给 {executor} 执行
          </Button>
          <span>启动后自动接续 · 使用各 Agent 账号额度</span>
        </div>
      )}
    </section>
  )
}
