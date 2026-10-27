# AionUi Agent management reuse

Source: https://github.com/iOfficeAI/AionUi
Commit: 11cd2a9a20d1e033157636efc570b41384c66d85
Copyright 2025 AionUi (aionui.com), Apache-2.0. License included.

AgentRow.tsx adapts AgentSettings/AgentCard.tsx's identity/status/action row to a native accessible button and Rondo's AgentInfo and Jean theme. agentFilters.ts directly adapts the availability helpers, using passive `available` rather than AionUi's `online` status. AgentSettings.tsx adapts LocalAgents.tsx's search/filter, selection, custom create/edit/save/refresh flow, with inline detail editing and separate executable/argv fields as in InlineAgentEditor.tsx.

Removed AionUi-specific assistant binding, provider preference ordering, avatars, Arco, analytics, i18n and Electron bridge. No claim that AionUi's agent backend or authentication is included. Rondo preserves its existing task sidebar; list/detail division is the management extension, not a replacement visual identity. Original-file SHA256 hashes are in source-manifest.json; runtime API/IPC and configuration persistence are Rondo adaptations.
