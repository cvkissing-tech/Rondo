// ChatView's column/header/timeline/composer composition, and UserTimelineRow's
// message container, adapted from T3 Code 210b2e7c6a8be11441b7afc94742ce3c76860111.
// Business stores, routing, virtualisation and transport are replaced by Rondo slots.
import type { ReactNode } from 'react'

export function ChatWorkspace({
  header,
  children,
  footer
}: {
  header: ReactNode
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      data-upstream="t3code/ChatView"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden" data-chat-column>
        <header data-chat-header className="session-header">
          {header}
        </header>
        <div className="session-scroll">
          <div className="chat-content-lane">{children}</div>
        </div>
        <div data-chat-composer-stack className="session-dock">
          {footer}
        </div>
      </div>
    </div>
  )
}

export function UserMessage({ children }: { children: ReactNode }) {
  return (
    <div className="group flex flex-col items-end gap-1" data-upstream="t3code/UserTimelineRow">
      <div className="relative min-w-0 max-w-[88%] rounded-2xl bg-muted p-3 text-foreground user-message">
        {children}
      </div>
    </div>
  )
}
