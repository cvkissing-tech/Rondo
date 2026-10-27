// RightPanelTabs / PreviewPanelShell surface pattern from T3 Code; Rondo's local
// file and native-session services replace upstream browser/terminal services.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ExternalLink,
  FileCode2,
  Files,
  FolderOpen,
  GitBranch,
  ListChecks,
  MessagesSquare,
  Play,
  RefreshCw,
  X
} from 'lucide-react'
import { Button } from '@jean/components/ui/button'
import { handleTabKeys } from '@jean/lib/utils'
import { agentName, defaultAgents } from '../../shared/types'
import type { Context, ExecutionStatus, ReviewStatus, WorkspaceFiles } from '../../shared/types'

export function WorkspaceInspector({
  context,
  plan,
  review,
  execution,
  difference,
  planContent,
  request,
  onDiff,
  onClose,
  refreshKey
}: {
  context: Context
  plan?: ReviewStatus
  review?: ReviewStatus
  execution?: ExecutionStatus
  difference: ReactNode
  planContent: ReactNode
  request: { seq: number; tab: string }
  onDiff: () => void
  onClose: () => void
  refreshKey: string
}) {
  const [view, setView] = useState({ request: request.seq, tab: request.tab })
  if (view.request !== request.seq) setView({ request: request.seq, tab: request.tab })
  const tab = view.tab
  const setTab = (value: string) => setView({ request: request.seq, tab: value })
  const [files, setFiles] = useState<WorkspaceFiles>()
  const [selected, setSelected] = useState('')
  const [source, setSource] = useState<string>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const sequence = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const refresh = useCallback(async () => {
    try {
      const result = await window.workbench!.workspaceFiles(context.task_id)
      if (mounted.current) {
        setFiles(result)
        setError('')
      }
    } catch (e) {
      if (mounted.current) setError(String(e))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [context.task_id])
  useEffect(() => {
    const timer = setTimeout(() => {
      refresh()
    }, 0)
    return () => clearTimeout(timer)
  }, [refresh, refreshKey])
  async function action(run: () => Promise<unknown>) {
    try {
      await run()
      if (mounted.current) setError('')
    } catch (e) {
      if (mounted.current) setError(String(e))
    }
  }
  async function read(path: string) {
    const current = ++sequence.current
    setSelected(path)
    setSource(undefined)
    setError('')
    try {
      const result = await window.workbench!.readFile(context.task_id, path)
      if (mounted.current && current === sequence.current) setSource(result.text)
    } catch (e) {
      if (mounted.current && current === sequence.current) setError(String(e))
    }
  }
  const roles = context.agents || defaultAgents
  const sessions = [
    {
      name: `${agentName(roles.planner)} · 规划`,
      agent: 'codex-plan' as const,
      job: plan,
      id: plan?.thread_id || plan?.session_id
    },
    {
      name: `${agentName(roles.executor)} · 执行`,
      agent: 'workbuddy' as const,
      job: execution,
      id: execution?.session_id
    },
    {
      name: `${agentName(roles.reviewer)} · 审查`,
      agent: 'codex-review' as const,
      job: review,
      id: review?.thread_id || review?.session_id
    }
  ]
  return (
    <aside
      className="workspace-inspector"
      aria-label="文件与产物"
      data-upstream="t3code/RightPanelTabs"
    >
      <div
        className="inspector-tabs"
        role="tablist"
        aria-label="工作区面板"
        onKeyDown={handleTabKeys}
      >
        {[
          ['plan', '计划', ListChecks],
          ['files', '文件', Files],
          ['diff', '改动', GitBranch],
          ['sessions', '会话', MessagesSquare]
        ].map(([value, label, Icon]) => {
          const I = Icon as typeof Files
          return (
            <button
              key={String(value)}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => {
                setTab(String(value))
                if (value === 'diff') onDiff()
              }}
            >
              <I className="size-3.5" />
              {String(label)}
            </button>
          )
        })}
        <Button size="icon-sm" variant="ghost" aria-label="收起工作区面板" onClick={onClose}>
          <X />
        </Button>
      </div>
      {error && (
        <p className="inspector-error" role="alert">
          {error}
        </p>
      )}
      {tab === 'plan' && (
        <div className="inspector-plan" role="tabpanel" aria-label="任务计划">
          {planContent}
        </div>
      )}
      {tab === 'files' && (
        <div className="inspector-files" role="tabpanel" aria-label="工作区文件">
          <div className="artifact-actions">
            <Button
              size="sm"
              variant="outline"
              onClick={() => action(() => window.workbench!.openWorkspace(context.task_id))}
            >
              <FolderOpen />
              打开文件夹
            </Button>
            {files?.preview && (
              <Button
                size="sm"
                onClick={() =>
                  action(() => window.workbench!.openArtifact(context.task_id, files.preview!))
                }
              >
                <Play />
                运行预览
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={loading}
              aria-label="刷新文件"
              onClick={() => {
                setLoading(true)
                refresh()
              }}
            >
              <RefreshCw />
            </Button>
          </div>
          <div className="file-list" aria-label="文件列表">
            {loading && !files && <p className="supporting">正在读取工作区…</p>}
            {files?.files.map((file) => (
              <button
                type="button"
                key={file.path}
                aria-current={selected === file.path ? 'true' : undefined}
                onClick={() => read(file.path)}
              >
                <FileCode2 className="size-3.5" />
                <span>{file.path}</span>
                <small>
                  {file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`}
                </small>
              </button>
            ))}
            {files && !files.files.length && (
              <p className="supporting">工作区还没有文件。Agent 生成后会显示在这里。</p>
            )}
            {files?.truncated && (
              <p className="supporting">列表已截断，完整文件请打开文件夹查看。</p>
            )}
          </div>
          {selected ? (
            <div className="source-view">
              <div>
                <span>{selected}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="关闭文件预览"
                  onClick={() => {
                    setSelected('')
                  }}
                >
                  <X />
                </Button>
              </div>
              <pre>{source ?? (error ? '无法预览此文件。' : '读取中…')}</pre>
            </div>
          ) : (
            <div className="file-placeholder">
              <FileCode2 />
              <p>选择文件查看代码</p>
              <span>生成的文件直接来自任务工作区</span>
            </div>
          )}
        </div>
      )}
      {tab === 'diff' && (
        <div className="inspector-diff" role="tabpanel" aria-label="代码改动面板">
          {difference}
        </div>
      )}
      {tab === 'sessions' && (
        <div className="session-list" role="tabpanel" aria-label="原生会话">
          {sessions.map((session) => (
            <section key={session.agent}>
              <h2>{session.name}</h2>
              <p>{session.job ? session.job.status : '尚未发起'}</p>
              {session.id && <code>{session.id}</code>}
              {session.job?.model && (
                <p>
                  {session.job.model}
                  {session.job.effort && ` · ${session.job.effort}`}
                </p>
              )}
              {session.job?.environment === 'native' && (
                <p>
                  {session.job.skills_count ?? '—'} Skills ·{' '}
                  {session.job.mcp_servers?.join(', ') || '无启用的 MCP'}
                </p>
              )}
              {session.agent !== 'workbuddy' && session.job && !session.job.persistent && (
                <p>历史临时会话没有保存到 Codex；新发起的会话会持久保存。</p>
              )}
              {session.job?.backend?.startsWith('acp:') && (
                <p>ACP会话和工具记录保存在Rondo；此Agent未提供原生客户端快捷入口。</p>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !session.id ||
                  session.job?.backend?.startsWith('acp:') ||
                  (session.agent !== 'workbuddy' && !session.job?.persistent)
                }
                onClick={() =>
                  action(() => window.workbench!.openSession(context.task_id, session.agent))
                }
              >
                <ExternalLink />
                打开原生会话
              </Button>
            </section>
          ))}
          <p className="supporting">
            会话按钮打开已保存的原生记录，不会再次发送任务。Rondo 沿用本机 CLI
            配置；桌面应用专属连接器由原客户端提供。
          </p>
        </div>
      )}
    </aside>
  )
}
