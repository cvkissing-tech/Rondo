import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ListChecks, Square } from 'lucide-react'
import { Button } from '@jean/components/ui/button'
import { Textarea } from '@jean/components/ui/textarea'
import { ComposerLayout } from './vendor/codex/ComposerLayout'
import { errorText } from './errors'
import type { AgentModels } from '../../shared/types'

// Compose into the existing Codex surface. Submission belongs to Rondo's task,
// not a second embedded agent client; drafts survive task switches and restarts.
export function PlanningComposer({
  task,
  planner,
  plannerId,
  version,
  dark,
  blocked,
  running,
  onSend,
  onStop
}: {
  task: number
  planner: string
  plannerId: string
  version?: number
  dark: boolean
  blocked?: string
  running: boolean
  onSend: (
    message: string,
    request: string,
    model?: { model: string; effort?: string }
  ) => Promise<void>
  onStop: () => void
}) {
  const key = `rondo.planning-draft.${task}`
  const [text, setText] = useState(() => localStorage.getItem(key) || '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [catalog, setCatalog] = useState<AgentModels>()
  const [modelNotice, setModelNotice] = useState('')
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState('')
  useEffect(() => {
    let active = true
    window
      .workbench!.agentModels(plannerId)
      .then((result) => {
        if (active) {
          setCatalog(result)
          setModelNotice(result.unsupported_reason || '')
        }
      })
      .catch(() => {
        if (active) {
          setCatalog(undefined)
          setModelNotice('模型列表暂不可用，请检查 Agent 连接或在 Agent 设置中配置。')
        }
      })
    return () => {
      active = false
    }
  }, [plannerId])
  const selected = catalog?.models.find((item) => item.id === model)
  const efforts = selected?.efforts || []
  const chosenEffort = efforts.includes(effort) ? effort : selected?.default_effort || efforts[0]
  const request = useRef<{ text: string; id: string }>(
    (() => {
      try {
        const saved = JSON.parse(localStorage.getItem(`${key}.request`) || '{}')
        return typeof saved.text === 'string' && typeof saved.id === 'string'
          ? saved
          : { text: '', id: '' }
      } catch {
        return { text: '', id: '' }
      }
    })()
  )
  async function send() {
    const message = text.trim()
    if (!message || sending || blocked || running) return
    const choice = model
      ? { model, ...(plannerId === 'codex' && chosenEffort ? { effort: chosenEffort } : {}) }
      : undefined
    const identity = JSON.stringify({ message, choice })
    if (
      request.current.text !== identity &&
      !(choice === undefined && request.current.text === message)
    )
      request.current = { text: identity, id: crypto.randomUUID() }
    localStorage.setItem(`${key}.request`, JSON.stringify(request.current))
    setSending(true)
    setError('')
    try {
      await onSend(message, request.current.id, choice)
      localStorage.removeItem(key)
      localStorage.removeItem(`${key}.request`)
      setText('')
      request.current = { text: '', id: '' }
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSending(false)
    }
  }
  return (
    <form
      className="planning-composer"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <ComposerLayout
        dark={dark}
        leading={
          <span className="composer-recipient">
            <ListChecks className="size-3.5" />
            规划 · {planner}
            {version && <span>计划 V{version}</span>}
            {catalog?.models.length ? (
              <select
                aria-label="本次对话模型"
                value={model}
                disabled={sending || running}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="">Agent 默认模型</option>
                {catalog.models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : null}
            {plannerId === 'codex' && efforts.length > 0 && (
              <select
                aria-label="本次对话思考强度"
                value={chosenEffort}
                disabled={sending || running}
                onChange={(e) => setEffort(e.target.value)}
              >
                {efforts.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            )}
          </span>
        }
        trailing={
          running ? (
            <Button type="button" size="sm" variant="outline" onClick={onStop}>
              <Square className="size-3.5" />
              停止回答
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              aria-label="发送给规划 Agent"
              disabled={sending || !!blocked || !text.trim()}
            >
              <ArrowUp />
            </Button>
          )
        }
      >
        <Textarea
          aria-label="讨论或修改方案"
          rows={2}
          maxLength={4000}
          value={text}
          readOnly={sending}
          placeholder="对方案有疑问，或想调整哪些地方？"
          onChange={(e) => {
            setText(e.target.value)
            localStorage.setItem(key, e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send()
            }
          }}
        />
      </ComposerLayout>
      <p className="composer-hint" role="status">
        {blocked ||
          (running ? '正在回答，你可以先写下下一条意见。' : `发送给 ${planner} · 使用账号额度`)}
      </p>
      {modelNotice && (
        <p className="composer-hint" role="status">
          {modelNotice}
        </p>
      )}
      {error && (
        <p className="composer-error" role="alert">
          {error}。文字已保留，可重试。
        </p>
      )}
    </form>
  )
}
