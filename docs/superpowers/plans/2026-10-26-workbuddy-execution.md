# WorkBuddy native execution implementation plan

> For agentic workers: execute this approved plan inline, task by task. User explicitly approved implementation and reuse; no additional design approval is needed.

**Goal:** Rondo dispatches to a dedicated native WorkBuddy session and passes its submitted result to existing checks/Codex review.
**Architecture:** Reuse the native MessageChannel RPC bridge from codex-workbuddy-gateway, use the Windows live-session discovery/activation approach from workbuddy-acp-bridge, and keep TaskLauncher, SQLite jobs, review checks and the current WorkLog UI. No account credential extraction or WorkBuddy database writes.
**Tech stack:** Existing Electron/React, Node built-in WebSocket, Python standard library, SQLite/MCP.
**Spec:** docs/research/2026-10-26-workbuddy-native-bridge-survey.md

## Constraints

- Fixed upstream source fbaaa2ef6d6cb59f48b953a1f27058202a81553f; preserve provenance and adapter differences.
- Native session IDs and input tree are saved before dispatch; ambiguous sends never replay automatically.
- Keep user-selected WorkBuddy permissions. Only cancel the session owned by the execution job.
- Normal tests make zero model calls. One isolated live execution is the acceptance target; evidence must identify skipped/unavailable steps honestly.
- Preserve existing docs/learning/06-async-review-mcp.md user change.

## Task 1: Native driver and reproducible connection

- [x] Add integrations/workbuddy/native-bridge.mjs and native-driver.mjs; reuse upstream RPC transport and session management, add Windows process/endpoint ownership checks and JSON-lines boundary.
- [x] Implement status, run and cancel operations; exact session/workspace binding, per-call timeouts, no automatic prompt retries.
- [x] Test native RPC with four offline receipt/busy/model/uncertain-send checks; execution lifecycle/cancellation with offline runners. Actual CDP transport is covered by the separate live acceptance, not a simulated browser.

## Task 2: Durable execution and automatic review

- [x] Add execution_jobs schema migration; extend TaskLauncher context with execution metadata.
- [x] Add ExecutionJobs and MCP start/status/cancel tools. Require current saved plan, one execution per task/request, preserve session identity and version.
- [x] Wait for actual submit_result from the expected WorkBuddy attempt and native turn end, then call existing ReviewJobs with a stable request ID.
- [x] Test duplicate starts, stale plans, missing/wrong submissions, cancellation, schema migration and automatic review with offline runners. Existing owner-lock reconciliation is reused; execution-specific crash recovery has no separate live crash test.

## Task 3: Product entry and live acceptance

- [x] Extend existing DesktopAPI, taskFlow and T3 WorkLog execution row. Show actual execution, waiting/unknown states and explicit quota behavior; apply Rondo naming to visible shell.
- [x] Run targeted Python tests, existing frontend flow assertions, lint/typecheck/build and zero-model Electron smoke.
- [x] Connect current WorkBuddy through the local native transport, create a dedicated isolated task and verify one real execution/result/check/review where available.
- [x] Finish scoped UI review/documentation and write learning notes with key source excerpts and evidence paths.

## Completed evidence

- Python: 102 tests passed; execution-specific rerun 7 passed.
- Node native fixture: 4 passed; taskFlow: 15 assertions; lint/typecheck/build passed.
- Electron zero-model smoke passed: `.agent-review-loop/desktop-smoke-Bnkf3B/result.json`.
- Live Windows WorkBuddy 5.9.2 / deepseek-v4.1-flash: task 1, native execution 38c33f8b6df44bc5a53df6277c5a5be8, automatic Codex review 02131275c5bf4e38b8eb6457545efe0d, 4 checks passed, approved/current. Evidence `.agent-review-loop/native-connection/live-e1a03ba4dd/evidence.json`.
- UI finish reviewer: ship at scoped fix verdict; documenter preserved incumbent tokens and component CSS.
- Deferred: automatic repair, installers, cross-platform/native-version compatibility.
