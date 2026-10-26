// Jean ProjectsSidebar.tsx and ProjectTreeItem.tsx product JSX adapted to
// MCP task props. Source commit cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3.
import { useState } from 'react'
import { Plus, Search, RefreshCw, GitBranch } from 'lucide-react'
import { Input } from '@jean/components/ui/input'
import { cn, handleTabKeys } from '@jean/lib/utils'

export function TaskSidebar({
  tasks,
  selected,
  search,
  onSearch,
  onSelect,
  onNew,
  onRefresh,
  onLoadMore,
  busy,
  connection
}: {
  tasks: { task_id: number; title: string; status: string }[]
  selected?: number
  search: string
  onSearch: (value: string) => void
  onSelect: (id: number) => void
  onNew: () => void
  onRefresh: () => void
  onLoadMore?: () => void
  busy: boolean
  connection: string
}) {
  const [view, setView] = useState('tasks')
  const visible = tasks.filter(
    (task) =>
      (view === 'tasks' || task.status === 'submitted') &&
      task.title.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div
      className="relative flex h-full min-w-0 flex-1 flex-col"
      data-upstream="jean/ProjectsSidebar"
    >
      <div
        className="mt-2 flex h-12 shrink-0 items-center gap-1 px-3"
        role="tablist"
        aria-label="侧栏任务范围"
        onKeyDown={handleTabKeys}
      >
        {[
          ['tasks', '任务'],
          ['submitted', '已提交']
        ].map(([value, label]) => (
          <button
            type="button"
            role="tab"
            key={value}
            aria-selected={view === value}
            className={cn(
              'h-7 flex-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              view === value
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
            onClick={() => setView(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="border-b border-border/40 pb-2">
          <div className="flex gap-1 px-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="筛选已加载任务"
                placeholder="搜索任务…"
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                className="h-8 border-transparent bg-transparent pl-7 pr-2 text-xs shadow-none focus-visible:border-transparent dark:bg-transparent"
              />
            </div>
            <button
              type="button"
              onClick={onNew}
              disabled={busy}
              aria-label="新建任务"
              title="新建任务"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
            >
              <Plus className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onRefresh}
              aria-label="刷新任务"
              title="刷新任务"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              <RefreshCw className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="py-2">
          {visible.map((task) => (
            <button
              type="button"
              key={task.task_id}
              disabled={busy}
              aria-current={selected === task.task_id ? 'page' : undefined}
              onClick={() => onSelect(task.task_id)}
              className={cn(
                'group relative flex w-full items-center gap-1.5 overflow-hidden px-2 py-1.5 text-left transition-colors duration-150 disabled:opacity-50',
                selected === task.task_id
                  ? 'bg-primary/10 text-foreground before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:bg-primary'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <GitBranch className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {{ ready: '待执行', claimed: '执行中', submitted: '已提交' }[task.status] ??
                  task.status}{' '}
                · #{task.task_id}
              </span>
            </button>
          ))}
          {!visible.length && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {search
                ? '没有匹配的任务。'
                : view === 'submitted'
                  ? '还没有已提交的任务。'
                  : '还没有任务。'}
            </p>
          )}
          {onLoadMore && (
            <button
              type="button"
              className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={onLoadMore}
            >
              加载更多
            </button>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t border-border/40 px-3 py-3 text-[11px] text-muted-foreground">
        {connection}
      </div>
    </div>
  )
}
