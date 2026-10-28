import type { ReviewStatus } from './types'

export function nativeSessionNotice(
  job: (ReviewStatus & { phase?: string | null }) | undefined,
  agent: string
): string | undefined {
  if (!job || !['preparing', 'running', 'cancelling'].includes(job.status)) return undefined
  if (agent === 'codex')
    return '打开对应的 Codex 原生会话。Rondo 正在运行此回合，原生端可能提示会话被占用，暂时无法输入；打开不会停止任务。'
  if (agent === 'workbuddy' && job.phase !== 'waiting_input')
    return '打开对应的 WorkBuddy 原生会话。桌面历史与后台状态可能不同步，请结合 Rondo 的工具记录判断进展；打开不会重新派发任务。'
  return undefined
}
