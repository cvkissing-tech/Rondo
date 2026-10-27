import { useEffect, useState } from 'react'
import { Button } from '@jean/components/ui/button'
import { Field, FieldLabel } from '@jean/components/ui/field'
import type { AgentAssignments, AgentCatalog } from '../../shared/types'
export function AgentPicker({
  value,
  onChange,
  onManage
}: {
  value: AgentAssignments
  onChange: (value: AgentAssignments) => void
  onManage: () => void
}) {
  const [catalog, setCatalog] = useState<AgentCatalog>()
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  useEffect(() => {
    let active = true
    window.workbench
      ?.agents()
      .then((result) => {
        if (active) setCatalog(result)
      })
      .catch((e) => {
        if (active) setError(String(e))
      })
      .finally(() => {
        if (active) setChecking(false)
      })
    return () => {
      active = false
    }
  }, [])
  async function refresh() {
    setChecking(true)
    try {
      setCatalog(await window.workbench!.agents())
      setError('')
    } catch (e) {
      setError(String(e))
    } finally {
      setChecking(false)
    }
  }
  return (
    <section className="agent-picker" aria-label="选择开发Agent">
      <div className="agent-picker-heading">
        <strong>Agent 分工</strong>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={checking} onClick={refresh}>
            {checking ? '检测中…' : '重新检测'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onManage}>
            管理 Agent
          </Button>
        </div>
      </div>
      <div className="agent-role-selects">
        {(
          [
            ['planner', '规划'],
            ['executor', '执行'],
            ['reviewer', '审查']
          ] as const
        ).map(([role, label]) => (
          <Field key={role}>
            <FieldLabel htmlFor={`agent-${role}`}>{label}</FieldLabel>
            <select
              id={`agent-${role}`}
              value={value[role]}
              onChange={(e) => onChange({ ...value, [role]: e.target.value })}
            >
              {!catalog && <option value={value[role]}>{value[role]} · 检测中</option>}
              {catalog && !catalog.agents.some((a) => a.id === value[role]) && (
                <option value={value[role]} disabled>
                  {value[role]} · 配置已移除
                </option>
              )}
              {catalog?.agents
                .filter((agent) => agent.roles.includes(role))
                .sort((a, b) => Number(b.available) - Number(a.available))
                .map((agent) => (
                  <option key={agent.id} value={agent.id} disabled={!agent.available}>
                    {agent.name}
                    {agent.available ? '' : ' · 未安装适配器'}
                  </option>
                ))}
            </select>
          </Field>
        ))}
      </div>
      <p className="supporting">
        各角色使用所选 Agent 的本机配置与账号，任务创建后固定。安装检测不验证登录，也不调用模型。
      </p>
      {(error || catalog?.error) && (
        <p className="supporting" role="status">
          {error || catalog?.error}
        </p>
      )}
    </section>
  )
}
