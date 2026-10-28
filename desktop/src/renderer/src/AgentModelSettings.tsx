import { useCallback, useEffect, useState } from 'react'
import { Button } from '@jean/components/ui/button'
import { Field, FieldLabel } from '@jean/components/ui/field'
import { RefreshCw } from 'lucide-react'
import type { AgentModels, AgentSettingsState } from '../../shared/types'
import { errorText } from './errors'

export function AgentModelSettings({
  agent,
  config,
  onSaved
}: {
  agent: string
  config: AgentSettingsState
  onSaved: (config: AgentSettingsState) => void
}) {
  const saved = config.native_models?.[agent]
  const [catalog, setCatalog] = useState<AgentModels>()
  const [model, setModel] = useState(saved?.model || '')
  const [effort, setEffort] = useState(saved?.effort || '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const load = useCallback(() => window.workbench!.agentModels(agent), [agent])
  const receive = useCallback((result: AgentModels) => {
    setCatalog(result)
    setModel((value) => value || result.default_model || '')
    setEffort((value) => value || result.default_effort || '')
    setError('')
  }, [])
  async function refresh() {
    setLoading(true)
    try {
      receive(await load())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    let active = true
    load()
      .then((result) => {
        if (active) receive(result)
      })
      .catch((e) => {
        if (active) setError(errorText(e))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [load, receive])
  const selected = catalog?.models.find((m) => m.id === model)
  const efforts = selected?.efforts || []
  const effectiveEffort = efforts.includes(effort) ? effort : selected?.default_effort || efforts[0]
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setNotice('')
    try {
      const result = await window.workbench!.saveModel({
        agent,
        model,
        ...(agent === 'codex' && effectiveEffort ? { effort: effectiveEffort } : {}),
        revision: config.revision
      })
      onSaved(result)
      setError('')
      setNotice('已保存，后续回合使用此选择。正在运行的回合保持原配置。')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form className="agent-editor" onSubmit={save} aria-label="模型设置">
      <div className="flex items-center justify-between gap-2">
        <h3>模型设置</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="刷新可用模型"
          disabled={loading || saving}
          onClick={refresh}
        >
          <RefreshCw />
        </Button>
      </div>
      <Field>
        <FieldLabel htmlFor={`${agent}-model`}>模型</FieldLabel>
        <select
          id={`${agent}-model`}
          value={model}
          disabled={loading || saving}
          required
          onChange={(e) => {
            setModel(e.target.value)
            setNotice('')
          }}
        >
          <option value="">{loading ? '正在读取可用模型…' : '请选择模型'}</option>
          {model && !selected && (
            <option value={model} disabled>
              {model}（当前不可用）
            </option>
          )}
          {catalog?.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {['fast-model', 'balanced-model', 'deep-model'].includes(m.id)
                ? '（WorkBuddy 自动路由）'
                : ''}
            </option>
          ))}
        </select>
      </Field>
      {agent === 'codex' && efforts.length > 0 && (
        <Field>
          <FieldLabel htmlFor="codex-effort">思考强度</FieldLabel>
          <select
            id="codex-effort"
            value={effectiveEffort}
            disabled={loading || saving}
            onChange={(e) => {
              setEffort(e.target.value)
              setNotice('')
            }}
          >
            {efforts.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
      )}
      <p className="supporting">
        读取会启动 Agent；ACP 可能建立一次不发送消息的临时会话，不发起生成。登录、Skills 和 MCP
        沿用本机环境；不修改原客户端的全局设置。
        {agent === 'codex'
          ? '此设置用于 Rondo 中由 Codex 承担的规划、执行与审查。'
          : '自动返修沿用执行开始时固定的模型。'}
      </p>
      {catalog?.unsupported_reason && (
        <p role="status" className="supporting">
          {catalog.unsupported_reason}
        </p>
      )}
      <div className="agent-form-actions">
        <Button type="submit" disabled={loading || saving || !selected}>
          {saving ? '保存中…' : '保存模型设置'}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && (
        <p role="status" className="supporting">
          {notice}
        </p>
      )}
    </form>
  )
}
