import { Button } from '@jean/components/ui/button'
import type { PlanResult } from '../../shared/types'
import { useEffect, useState } from 'react'
import type { AgentModels } from '../../shared/types'

const modelLoads = new Map<string, Promise<AgentModels>>()
function loadModels(agent: string) {
  let pending = modelLoads.get(agent)
  if (!pending) {
    pending = window.workbench!.agentModels(agent).finally(() => modelLoads.delete(agent))
    modelLoads.set(agent, pending)
  }
  return pending
}

export function PlanAdoption({
  plan,
  executor,
  executorId,
  reviewerId,
  executionModel,
  reviewModel,
  onExecutionModel,
  onReviewModel,
  busy,
  onExecute
}: {
  plan: PlanResult
  executor: string
  executorId: string
  reviewerId: string
  executionModel?: ModelChoice
  reviewModel?: ModelChoice
  onExecutionModel: (model?: ModelChoice) => void
  onReviewModel: (model?: ModelChoice) => void
  busy: boolean
  onExecute: (model?: ModelChoice, reviewModel?: ModelChoice) => void
}) {
  return (
    <div className="plan-adoption">
      <ModelSelector
        key={`execute-${executorId}`}
        agent={executorId}
        role="执行"
        busy={busy}
        value={executionModel}
        onChange={onExecutionModel}
      />
      <ModelSelector
        key={`review-${reviewerId}`}
        agent={reviewerId}
        role="审查"
        busy={busy}
        value={reviewModel}
        onChange={onReviewModel}
      />
      <Button size="sm" disabled={busy} onClick={() => onExecute(executionModel, reviewModel)}>
        采用 V{plan.version || 1}，交给 {executor} 执行
      </Button>
      <span>自动返修与复查沿用所选模型。</span>
    </div>
  )
}

export type ModelChoice = { model: string; effort?: string }
export function ModelSelector({
  agent,
  role,
  busy,
  value,
  onChange,
  defaultLabel = '已保存的 Agent 配置'
}: {
  agent: string
  role: string
  busy: boolean
  value?: ModelChoice
  onChange: (model?: ModelChoice) => void
  defaultLabel?: string
}) {
  const [catalog, setCatalog] = useState<AgentModels>()
  const model = value?.model || ''
  const effort = value?.effort || ''
  const [notice, setNotice] = useState('正在读取模型…')
  useEffect(() => {
    let active = true
    loadModels(agent)
      .then((result) => {
        if (active) {
          setCatalog(result)
          setNotice(result.unsupported_reason || '')
        }
      })
      .catch(() => {
        if (active) setNotice('无法读取模型列表，请在 Agent 设置检查连接。')
      })
    return () => {
      active = false
    }
  }, [agent])
  const selected = catalog?.models.find((item) => item.id === model)
  const efforts = selected?.efforts || []
  const chosenEffort = efforts.includes(effort) ? effort : selected?.default_effort || efforts[0]
  return (
    <div className="workflow-model-choice">
      {Boolean(catalog?.models.length) && (
        <label>
          {role}模型{' '}
          <select
            aria-label={`本次${role}模型`}
            value={model}
            disabled={busy}
            onChange={(event) => {
              const nextModel = event.target.value
              const item = catalog?.models.find((m) => m.id === nextModel)
              const next = item?.default_effort || item?.efforts?.[0]
              onChange(
                nextModel
                  ? { model: nextModel, ...(agent === 'codex' && next ? { effort: next } : {}) }
                  : undefined
              )
            }}
          >
            <option value="">{defaultLabel}</option>
            {model && !selected && (
              <option value={model} disabled>
                {model}（当前不可用）
              </option>
            )}
            {catalog!.models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {agent === 'codex' && efforts.length > 0 && (
        <label>
          思考强度{' '}
          <select
            aria-label={`本次${role}思考强度`}
            value={chosenEffort}
            disabled={busy}
            onChange={(event) => onChange({ model, effort: event.target.value })}
          >
            {efforts.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      )}
      {notice && <span role="status">{notice}</span>}
    </div>
  )
}
