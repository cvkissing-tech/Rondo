# T3 Code work log reuse

Source: https://github.com/pingdotgg/t3code
Commit: 3de45c6254345f968fbdc64db7b149bf4f429855
File: apps/web/src/components/chat/WorkLog.tsx
Original blob SHA: 90a42a68f0cede3999b40aa75fcc7a9f10cd5c5b
License: MIT, retained in LICENSE.

Actual WorkLogBlock/List/Button/Row/Details product source is copied. Imports use
Jean's existing cn; text-secondary-label maps to text-muted-foreground. No private
backend, store, model connection or new package is imported. Task state and record
content come from our existing MCP and persisted SQLite jobs.


## Conversation workspace (0.14.0)

Source commit: 210b2e7c6a8be11441b7afc94742ce3c76860111.
`ChatWorkspace.tsx` extracts the actual ChatView column/header/content/composer
parent composition and UserTimelineRow message container into Rondo slots.
`TimelineSystemDivider.tsx` copies the upstream divider, adapting import aliases
and Base UI Tooltip's render prop to the already installed Radix asChild.
The files/source/diff/session inspector adapts RightPanelTabs and PreviewPanelShell
structure to existing react-resizable-panels and Rondo's Electron IPC; it does
not copy T3's browser, terminal or transport implementation.
Exact source file SHA-256 values and adaptations: `workspace-provenance.json`.
Jean theme/primitives, Vibe Kanban plan and Pierre diff renderer remain in use.
