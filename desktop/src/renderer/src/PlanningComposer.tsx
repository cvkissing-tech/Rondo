import { useRef, useState } from 'react'
import { ArrowUp, ListChecks, Square } from 'lucide-react'
import { Button } from '@jean/components/ui/button'
import { Textarea } from '@jean/components/ui/textarea'
import { ComposerLayout } from './vendor/codex/ComposerLayout'
import { errorText } from './errors'

// Compose into the existing Codex surface. Submission belongs to Rondo's task,
// not a second embedded agent client; drafts survive task switches and restarts.
export function PlanningComposer({
  task,
  planner,
  version,
  dark,
  blocked,
  running,
  onSend,
  onStop
}: {
  task: number
  planner: string
  version?: number
  dark: boolean
  blocked?: string
  running: boolean
  onSend: (message: string, request: string) => Promise<void>
  onStop: () => void
}) {
  const key = `rondo.planning-draft.${task}`
  const [text, setText] = useState(() => localStorage.getItem(key) || '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
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
    if (request.current.text !== message)
      request.current = { text: message, id: crypto.randomUUID() }
    localStorage.setItem(`${key}.request`, JSON.stringify(request.current))
    setSending(true)
    setError('')
    try {
      await onSend(message, request.current.id)
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
          (running
            ? '正在回答，你可以先写下下一条意见。'
            : `发送使用 ${planner} 的账号额度 · Enter 发送，Shift+Enter 换行`)}
      </p>
      {error && (
        <p className="composer-error" role="alert">
          {error}。文字已保留，可重试。
        </p>
      )}
    </form>
  )
}
