// Product layout adapted from Jean MainWindow.tsx and SidebarTabRail.tsx at
// cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3. See ../../NOTICE.md.
import type { ReactNode } from 'react'
import { Code, BookOpen, Settings2 } from 'lucide-react'
import { useSidebar } from '@jean/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@jean/components/ui/tooltip'

export function WorkbenchShell({
  sidebar,
  toolbar,
  children,
  onGuide,
  onAgents
}: {
  sidebar: ReactNode
  toolbar: ReactNode
  children: ReactNode
  onGuide: () => void
  onAgents: () => void
}) {
  const { open, toggleSidebar, state } = useSidebar()
  return (
    <div className="rondo-workbench" data-upstream="jean/MainWindow">
      <aside
        data-slot="sidebar"
        data-state={state}
        aria-label="任务侧栏"
        hidden={!open}
        className="project-sidebar"
      >
        <div className="sidebar-brand">
          <Code className="size-5" />
          <strong>Rondo</strong>
          <span>本地工作台</span>
        </div>
        {sidebar}
        <button type="button" className="sidebar-guide" onClick={onAgents}>
          <Settings2 className="size-4" />Agent 设置
        </button>
        <button type="button" className="sidebar-guide" onClick={onGuide}>
          <BookOpen className="size-4" />
          接入说明
        </button>
      </aside>
      <main className="app-main">
        <header className="workspace-toolbar" aria-label="工作台工具栏">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="切换侧栏"
                aria-expanded={open}
                className="sidebar-toggle"
              >
                <Code className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>切换侧栏 · Ctrl B</TooltipContent>
          </Tooltip>
          {toolbar}
        </header>
        {children}
      </main>
    </div>
  )
}
