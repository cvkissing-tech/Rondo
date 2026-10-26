# Vibe Kanban source attribution

Source: https://github.com/BloopAI/vibe-kanban
Commit: d5cbb5380fa0b32e98ef9b8d987f63decce4be3a
License: Apache-2.0 (full upstream LICENSE included alongside this file).

Copied product components:
- packages/ui/src/components/ChatEntryContainer.tsx
- packages/ui/src/components/ChatTodoList.tsx

Theme values extracted from:
- packages/local-web/tailwind.new.config.js
- packages/web-core/src/app/styles/new/index.css

Adaptations: imports reuse installed Jean cn and Lucide icons; Chinese text replaces
the i18next dependency. ChatTodoList accepts optional ReactNode details so the existing
plan details, files and verification are retained. Its disclosure uses a native button.
ChatEntryContainer puts optional header actions beside its disclosure button to avoid
nested interactive controls. Its product layout and utility classes are retained.
theme.css scopes the extracted Vibe spacing and color tokens to .vibe-plan-surface;
brand/error surfaces target only the copied components and do not change Jean primitives.
No execution or completed status is inferred from generating a plan.

Integration contrast adjustment: light text-low 39% -> 38%; dark text-low 56% ->
66.6667% (Jean #aaa). The original dark text measured 3.79:1 against the composed
plan-header background; the mapped value measured 5.27:1. Geometry and structure
remain those of the upstream components.
