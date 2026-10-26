# Rondo one-repair implementation plan

User approved continuing the previously proposed automatic repair. Execute inline; reuse existing jobs, MCP claims and native driver. This is an extension of the existing execution/review flow, not a new scheduler.

## Deliverable

Initial execution → checks → review. A fresh `changes_requested` result automatically produces at most one native WorkBuddy repair in the same task/workspace → checks → final review. No third execution/review, no automatic retry, no model calls on refresh. Existing review-only tasks may explicitly start their one repair. Check failures/cancellation/unknown dispatch stop the flow.

## Source decisions

- Directly port `pathMatchesContract` and `unauthorizedChangedFiles` from badgids/pi-pr-repair-loop `4c417231160f00d47c074c0510eca888c3c1181f`, src/policy.js blob `84b6020de391573b9424ac9f0026fe34e4e54d4e`; preserve MIT notice.
- Adapt its bounded finding prompt: inspect/reproduce concrete findings, keep focused changes and report verification; omit its commit/push workflow.
- Borrow Aider's bounded reflection stop rule from `5dc9490bb35f9729ef2c95d00a19ccd30c26339c`, aider/coders/base_coder.py lines 933–944. No Aider runtime dependency.
- Patchloop `03eb09b2248b60be2205dee6db33e2a80f20aae6` examined as a PR automation comparison; its GitHub polling/state subsystem is unnecessary here.

## Tasks

- [x] Add repair source validation and the ported file-contract functions. Read all findings (limit20), require current/latest review, reserve review budget, freeze reviewed tree and permitted paths. Scope check is post-execution validation, not a filesystem sandbox.
- [x] Add a transactional job-start hook in ReviewJobs. ExecutionJobs permits initial + one repair; repair reopens submitted task in the same transaction as durable job insertion. TaskStore reads latest submission while preserving history. Reuse existing driver/claim/submit/automatic review.
- [x] Continue initial jobs through review completion; launch one repair only for fresh changes_requested. Stop on final review, cancellation, no progress, changed source, scope violation or budget. Add one MCP repair entry and existing desktop IPC/status affordances; keep Jean/T3 components.
- [x] Exercise real SQLite/offline workers for full loop, duplicate repair, stale review, no progress, wrong scope and budget; run existing tests/build/smoke. Then one isolated native repair acceptance, scoped UI finish review/documentation and learning notes.

Core transaction: `metadata = self._prepare_start(db, task, repo, request_id)` → INSERT job with metadata. Any refusal rolls back task reopening too.

Core handoff: `if mode != 'repair' and review['verdict'] == 'changes_requested': self.start_repair(review_job_id)`; repair mode always stops after final review. Stable identity: `repair-<source-review-job-id>`.

## Evidence

- Python full suite:108 passed; final idempotency regression also passed after exact request lookup adjustment.
- Desktop: lint/typecheck/build,20 flow assertions, zero-model smoke `.agent-review-loop/desktop-smoke-O9Eccx/result.json`.
- Real source review→native repair→automatic re-review: `.agent-review-loop/repair-live-657f3bd068/evidence.json`; task2, source42cea60ea5a947b9bff0db78a10c358a, repairce26886b40274f6697775f5e98af0f2e, finald6e3f4fb87b4473393162e1938a868c9; approved/current/checkspassed. Initial implementation explicitly seeded; full automatic first handoff independently covered offline.
- UI5 captures `.impeccable/review/repair/`; one detector[]; scoped reviewer scored the behavior-documentation sync resolved and returned ship; final verdict is recorded in `.agent-review-loop/repair-ui-finish-review.md`.
