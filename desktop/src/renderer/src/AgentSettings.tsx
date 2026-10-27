import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText } from './errors'
import { ArrowLeft, FolderOpen, Plus, RefreshCw, Search, X } from 'lucide-react'
import { Button } from '@jean/components/ui/button'
import { Input } from '@jean/components/ui/input'
import { Field, FieldLabel } from '@jean/components/ui/field'
import type { AgentCatalog, AgentCheck, AgentSettingsState } from '../../shared/types'
import { AgentRow } from './vendor/aionui/AgentRow'
import {
  filterAgentsByAvailability,
  getAgentAvailabilityFilterStats,
  type AgentAvailabilityFilter
} from './vendor/aionui/agentFilters'
import { AgentReadinessPanel } from './vendor/goose/AgentReadinessPanel'
const api = window.workbench!
export function AgentSettings({ onClose }: { onClose: () => void }) {
  const [catalog, setCatalog] = useState<AgentCatalog>()
  const [config, setConfig] = useState<AgentSettingsState>()
  const [selected, setSelected] = useState('codex')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<AgentAvailabilityFilter>('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [checking, setChecking] = useState('')
  const [checks, setChecks] = useState<Record<string, AgentCheck>>({})
  const [editor, setEditor] = useState(false)
  const [id, setId] = useState('')
  const [program, setProgram] = useState('')
  const [args, setArgs] = useState<string[]>([])
  const [original, setOriginal] = useState<string | null>(null)
  const [remove, setRemove] = useState(false)
  const detail = useRef<HTMLDivElement>(null)
  useEffect(() => {
    detail.current?.scrollTo({ top: 0 })
  }, [selected, editor, error])
  const refresh = useCallback(async () => {
    try {
      const [list, state] = await Promise.all([api.agents(), api.agentSettings()])
      setCatalog(list)
      setConfig(state)
      setError('')
      setChecks({})
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    let active = true
    Promise.all([api.agents(), api.agentSettings()])
      .then(([list, state]) => {
        if (active) {
          setCatalog(list)
          setConfig(state)
        }
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
  }, [])
  const items = catalog?.agents || []
  const current = items.find((a) => a.id === selected)
  const customId = selected.startsWith('acp:') ? selected.slice(4) : ''
  const custom = Boolean(config?.agents[customId])
  const stats = getAgentAvailabilityFilterStats(items)
  const visible = filterAgentsByAvailability(items, filter)
    .filter((a) =>
      `${a.name} ${a.protocol} ${a.requirements?.join(' ')}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    )
    .sort((a, b) => Number(b.available) - Number(a.available))
  function edit(existing?: string) {
    const argv = existing ? config?.agents[existing] : undefined
    setOriginal(existing || null)
    setId(existing || '')
    setProgram(argv?.[0] || '')
    setArgs(argv?.slice(1) || [])
    setEditor(true)
    setRemove(false)
    setNotice('')
    setError('')
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!config) return
    setSaving(true)
    setError('')
    try {
      if (!original && Object.hasOwn(config.agents, id))
        throw Error('这个标识已有自定义配置，请返回列表编辑它，或使用不同标识。')
      await api.saveAgent({ id, argv: [program, ...args], revision: config.revision })
      await refresh()
      setSelected('acp:' + id)
      setEditor(false)
      setNotice('配置已保存。可检查协议，或返回任务选择这个 Agent。')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }
  async function deleteAgent() {
    if (!config) return
    setSaving(true)
    try {
      await api.saveAgent({ id: customId, argv: null, revision: config.revision })
      await refresh()
      setRemove(false)
      setSelected('codex')
      setNotice('自定义配置已移除；Agent 程序和账号均保留。')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }
  async function check() {
    if (!current) return
    const target = current.id
    setChecking(target)
    setError('')
    try {
      const result = await api.checkAgent(target)
      setChecks((v) => ({ ...v, [target]: result }))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setChecking('')
    }
  }
  return (
    <section className="agent-settings" aria-label="Agent 设置">
      <header className="agent-settings-header">
        <div>
          <h1>Agent 设置</h1>
          <p className="supporting">连接你自己的开发工具，再为任务分配角色。</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft />
          返回工作台
        </Button>
      </header>
      <div className="agent-settings-body">
        <div className="agent-directory">
          <div className="agent-directory-tools">
            <div className="flex items-center justify-between">
              <strong>本机 Agent</strong>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="刷新 Agent 列表"
                disabled={loading || saving || editor || Boolean(checking)}
                onClick={() => {
                  setLoading(true)
                  void refresh()
                }}
              >
                <RefreshCw />
              </Button>
            </div>
            <div className="agent-search">
              <Search className="size-4" />
              <Input
                aria-label="搜索 Agent"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索名称或协议"
              />
            </div>
            <select
              aria-label="筛选 Agent"
              value={filter}
              onChange={(e) => setFilter(e.target.value as AgentAvailabilityFilter)}
            >
              <option value="all">全部 · {stats.all}</option>
              <option value="available">已找到 · {stats.available}</option>
              <option value="unavailable">未找到 · {stats.unavailable}</option>
            </select>
          </div>
          <div className="agent-directory-list" aria-busy={loading}>
            {loading && !catalog ? (
              <p className="supporting">正在读取本机安装情况…</p>
            ) : (
              visible.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  selected={!editor && selected === agent.id}
                  custom={Boolean(config?.agents[agent.id.replace(/^acp:/, '')])}
                  onConfigure={() => {
                    if (saving) return
                    setSelected(agent.id)
                    setEditor(false)
                    setRemove(false)
                    setError('')
                    setNotice('')
                  }}
                />
              ))
            )}
            {!loading && !visible.length && (
              <p className="supporting">没有匹配的 Agent。可清空搜索，或添加自定义程序。</p>
            )}
          </div>
          <Button
            variant="outline"
            disabled={saving || loading || Boolean(checking) || !config || Boolean(config.error)}
            onClick={() => edit()}
          >
            <Plus />
            添加自定义 Agent
          </Button>
        </div>
        <div ref={detail} className="agent-detail" aria-live="polite">
          {(error || config?.error || catalog?.error) && (
            <div className="agent-inline-error" role="alert">
              {error || config?.error || catalog?.error}
              {editor && error.includes('配置已被其他窗口或程序更新') && (
                <div className="agent-form-actions">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true)
                      try {
                        const latest = await api.agentSettings()
                        if (latest.error) throw Error(latest.error)
                        setConfig(latest)
                        setError('')
                        setNotice('已读取最新配置，当前输入已保留。请检查后点击“保存配置”。')
                      } catch (e) {
                        setError(errorText(e))
                      } finally {
                        setSaving(false)
                      }
                    }}
                  >
                    保留输入，读取最新配置
                  </Button>
                </div>
              )}
              {config?.error && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => api.openAgentConfig().catch((e) => setError(errorText(e)))}
                >
                  打开配置文件
                </Button>
              )}
            </div>
          )}
          {notice && (
            <p className="agent-notice" role="status">
              {notice}
            </p>
          )}
          {editor ? (
            <form onSubmit={save} className="agent-editor">
              <div>
                <h2>{original ? '编辑启动配置' : '添加自定义 Agent'}</h2>
                <p className="supporting">
                  使用支持 ACP stdio 的程序。程序路径和参数分开填写，无需编辑 JSON。
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="custom-agent-id">Agent 标识</FieldLabel>
                <Input
                  id="custom-agent-id"
                  value={id}
                  disabled={Boolean(original) || saving}
                  pattern="[a-z0-9][a-z0-9_-]{0,39}"
                  maxLength={40}
                  required
                  placeholder="例如 my-agent"
                  onChange={(e) => setId(e.target.value)}
                />
                <p className="supporting">标识用于任务绑定，保存后保持固定。</p>
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-program">启动程序</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="agent-program"
                    value={program}
                    required
                    disabled={saving}
                    placeholder="程序名称或完整路径"
                    onChange={(e) => setProgram(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    aria-label="浏览 Agent 程序"
                    onClick={async () => {
                      try {
                        const path = await api.chooseAgentProgram()
                        if (path) setProgram(path)
                      } catch (e) {
                        setError(errorText(e))
                      }
                    }}
                  >
                    <FolderOpen />
                  </Button>
                </div>
                <p className="supporting">路径含空格时也无需加引号；不要在这里拼接参数。</p>
              </Field>
              <div className="space-y-2">
                <strong className="text-xs">启动参数</strong>
                <p className="supporting">每项单独填写，按顺序传入，例如 --acp 或 --stdio。</p>
                {args.map((arg, index) => (
                  <div className="flex gap-2" key={index}>
                    <Input
                      aria-label={`参数 ${index + 1}`}
                      value={arg}
                      disabled={saving}
                      onChange={(e) =>
                        setArgs((v) => v.map((x, i) => (i === index ? e.target.value : x)))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={saving}
                      aria-label={`移除参数 ${index + 1}`}
                      onClick={() => setArgs((v) => v.filter((_, i) => i !== index))}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving || args.length >= 23}
                  onClick={() => setArgs((v) => [...v, ''])}
                >
                  <Plus />
                  添加参数
                </Button>
              </div>
              <p className="supporting">
                保存只更新启动配置。登录、模型与 Skills 继续由这个 Agent
                管理；不要把密钥填入启动参数。
              </p>
              <div className="agent-form-actions">
                <Button type="submit" disabled={saving || !id || !program.trim()}>
                  {saving ? '保存中…' : '保存配置'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => setEditor(false)}
                >
                  取消
                </Button>
              </div>
            </form>
          ) : (
            current && (
              <>
                <div className="agent-detail-heading">
                  <h2>{current.name}</h2>
                  <span className="supporting">
                    {current.protocol}
                    {custom ? ' · 自定义配置' : ''}
                  </span>
                </div>
                <dl className="agent-facts">
                  <div>
                    <dt>可承担角色</dt>
                    <dd>
                      {current.roles
                        .map((r) => ({ planner: '规划', executor: '执行', reviewer: '审查' })[r])
                        .join('、')}
                    </dd>
                  </div>
                  <div>
                    <dt>安装检测</dt>
                    <dd>
                      {current.available ? '已找到程序，账号未检查' : '未找到所需程序或适配器'}
                    </dd>
                  </div>
                </dl>
                {current.requirements?.length ? (
                  <p className="supporting">
                    缺少依赖：{current.requirements.join('、')}
                    。请安装对应适配器后重新检测；非标准位置可使用下方启动配置。
                  </p>
                ) : null}
                <AgentReadinessPanel
                  agent={current}
                  result={checks[current.id]}
                  checking={Boolean(checking)}
                  onCheck={check}
                />
                {custom && (
                  <div className="agent-command">
                    <h3>启动配置</h3>
                    <p>程序</p>
                    <code>{config?.agents[customId][0]}</code>
                    {config?.agents[customId].slice(1).map((arg, i) => (
                      <div key={i}>
                        <p>参数 {i + 1}</p>
                        <code>{arg || '（空参数）'}</code>
                      </div>
                    ))}
                  </div>
                )}
                {current.id.startsWith('acp:') && (
                  <div className="agent-form-actions">
                    <Button
                      variant="outline"
                      disabled={saving || Boolean(config?.error) || !config || Boolean(checking)}
                      onClick={() => edit(customId)}
                    >
                      {custom ? '编辑启动配置' : '设置程序位置'}
                    </Button>
                    {custom && (
                      <Button
                        variant="ghost"
                        disabled={saving || Boolean(checking)}
                        onClick={() => setRemove(true)}
                      >
                        移除配置
                      </Button>
                    )}
                  </div>
                )}
                {current.id === 'workbuddy' && (
                  <>
                    <p className="supporting">
                      此通道仍为 Windows WorkBuddy 5.9.2 实验适配。需启动 WorkBuddy 并信任 Rondo
                      MCP；检查不会自动发起开发任务。
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={Boolean(checking)}
                      onClick={async () => {
                        setChecking('workbuddy')
                        setError('')
                        try {
                          const result = await api.workbuddyStatus(true)
                          setChecks((v) => ({
                            ...v,
                            workbuddy: {
                              agent: 'workbuddy',
                              ok: result.connected,
                              stage: 'protocol',
                              message: result.error || 'WorkBuddy 本机通道可用',
                              auth: 'not_checked',
                              checked_at: new Date().toISOString()
                            }
                          }))
                        } catch (e) {
                          setError(errorText(e))
                        } finally {
                          setChecking('')
                        }
                      }}
                    >
                      启动并连接 WorkBuddy
                    </Button>
                  </>
                )}
                {remove && (
                  <div className="agent-remove" role="alert">
                    <p>
                      移除后，绑定此 Agent 的任务可能无法继续，直到重新配置。Agent
                      程序、账号和任务记录会保留。
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={saving}
                        onClick={deleteAgent}
                      >
                        确认移除配置
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => setRemove(false)}
                      >
                        保留配置
                      </Button>
                    </div>
                  </div>
                )}
                <section className="agent-help">
                  <h3>准备好后，回到任务开始工作</h3>
                  <p className="supporting">
                    在新任务中分别选择规划、执行和审查
                    Agent。已创建任务保留原来的角色绑定；这里的检测不会重发任务。
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => api.openGuide().catch((e) => setError(errorText(e)))}
                  >
                    查看接入与安装说明
                  </Button>
                </section>
              </>
            )
          )}
          <p className="agent-config-location supporting">
            本机配置：{config?.path || '正在读取…'}
          </p>
        </div>
      </div>
    </section>
  )
}
