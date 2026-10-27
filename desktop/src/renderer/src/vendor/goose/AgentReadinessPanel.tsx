// AcpReadinessPanel layout/conditional states adapted from Goose at
// 2c6812a358db1b11953b9fafc05c6126eb818788. Apache-2.0. See NOTICE.md.
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react'
import { Button } from '@jean/components/ui/button'
import type { AgentCheck, AgentInfo } from '../../../../shared/types'
export function AgentReadinessPanel({
  agent,
  result,
  checking,
  onCheck
}: {
  agent: AgentInfo
  result?: AgentCheck
  checking: boolean
  onCheck: () => void
}) {
  return (
    <section
      className="agent-readiness"
      data-upstream="goose/AcpReadinessPanel"
      aria-label="协议检查"
    >
      <div className="flex items-center gap-2 font-medium">
        {checking ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : result?.ok ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <CircleAlert className="size-4" />
        )}
        <strong>
          {checking
            ? '正在检查协议…'
            : result
              ? result.ok
                ? '协议检查通过'
                : '协议检查未通过'
              : agent.available
                ? '程序已找到，尚未检查协议'
                : '尚未找到启动程序'}
        </strong>
      </div>
      <p className="supporting">
        检查会启动所选程序并完成握手，不发送任务、不调用模型。账号、额度与模型可用性需在 Agent
        中确认。
      </p>
      {result && (
        <div role="status" className={result.ok ? 'supporting' : 'agent-inline-error'}>
          <p>{result.message}</p>
          {result.details?.length ? (
            <details>
              <summary>查看诊断</summary>
              <pre>{result.details.join('\n')}</pre>
            </details>
          ) : null}
          <p className="supporting">
            检查时间：{new Date(result.checked_at).toLocaleTimeString()} · 账号未检查
          </p>
        </div>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={checking || !agent.available}
        onClick={onCheck}
      >
        <RefreshCw className="size-3.5" />
        {checking ? '检查中…' : '检查协议'}
      </Button>
    </section>
  )
}
