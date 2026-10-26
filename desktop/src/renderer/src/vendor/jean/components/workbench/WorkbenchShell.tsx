// Product layout adapted from Jean MainWindow.tsx and SidebarTabRail.tsx at
// cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3. See ../../NOTICE.md.
import type { ReactNode } from 'react'
import { Code, BookOpen } from 'lucide-react'
import { useSidebar } from '@jean/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@jean/components/ui/tooltip'

export function WorkbenchShell({
  sidebar,
  toolbar,
  children,
  onGuide
}: {
  sidebar: ReactNode
  toolbar: ReactNode
  children: ReactNode
  onGuide: () => void
}) {
  const { open, toggleSidebar, state } = useSidebar()
  return (
    <div className="relative flex h-full w-full overflow-hidden" data-upstream="jean/MainWindow">
      <header
        className="absolute inset-x-0 top-0 z-50 flex h-8 items-center gap-2 px-2"
        aria-label="工作台工具栏"
      >
        {toolbar}
      </header>
      <div className="h-full shrink-0 bg-sidebar pt-8 dark:bg-[#0b0b0b]">
        <nav
          className="flex h-full w-18 shrink-0 flex-col items-center gap-1.5 border-r border-border/40 pt-2 pb-2"
          aria-label="工作台导航"
          data-upstream="jean/SidebarTabRail"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="切换侧栏"
                aria-expanded={open}
                className="flex size-12 shrink-0 items-center justify-center rounded-md text-primary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Code className="size-6" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">工作区 · Ctrl B</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onGuide}
                aria-label="接入说明"
                className="mt-auto flex size-12 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <BookOpen className="size-6" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">接入说明</TooltipContent>
          </Tooltip>
          <span className="pb-1 text-[0.625rem] leading-none text-muted-foreground">v0.10.0</span>
        </nav>
      </div>
      <aside
        data-slot="sidebar"
        data-state={state}
        aria-label="任务侧栏"
        hidden={!open}
        className="h-full w-60 shrink-0 overflow-hidden border-r border-border/40 bg-sidebar pt-8 dark:bg-[#0b0b0b]"
      >
        {sidebar}
      </aside>
      <main className="app-main flex min-w-0 flex-1 flex-col overflow-hidden pt-8">{children}</main>
    </div>
  )
}
