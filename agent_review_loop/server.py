"""The MCP boundary: types describe the tools; TaskStore owns the rules."""

import json
import asyncio
from contextlib import asynccontextmanager
from typing import Annotated, Any

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field
import anyio

from .store import StoreError, TaskStore
from .snapshots import SnapshotError
from .review_jobs import ReviewJobs
from .task_launch import TaskLauncher
from .planning import PlanJobs
from .execution import ExecutionJobs, workbuddy_connection
from .agents import catalog, check_agent


TaskId = Annotated[int, Field(strict=True, ge=1, le=2**63 - 1)]
Version = TaskId
LeaseSeconds = Annotated[int, Field(strict=True, ge=30, le=3600)]
ClaimToken = Annotated[str, Field(strict=True, min_length=1, max_length=128)]
AttemptId = Annotated[str, Field(strict=True, min_length=1, max_length=64)]
JobId = Annotated[str, Field(strict=True, pattern='^[a-f0-9]{32}$')]


def _invoke(operation, *args):
    try:
        return operation(*args)
    except (StoreError, SnapshotError) as error:
        # ToolError becomes a genuine MCP isError result, not a success string.
        raise ToolError(json.dumps({"code": error.code, "message": str(error)}, ensure_ascii=False)) from error


def create_server(store: TaskStore, reviews: ReviewJobs | None = None, tasks: TaskLauncher | None = None, plans: PlanJobs | None = None,
                  executions: ExecutionJobs | None = None) -> MCPServer:
    reviews = reviews or ReviewJobs(store)
    tasks = tasks or TaskLauncher(store)
    plans = plans or PlanJobs(store, reviews.root, executable=reviews.executable)
    executions = executions or ExecutionJobs(store, tasks, plans, reviews)

    @asynccontextmanager
    async def lifespan(server):
        try:
            yield
        finally:
            with anyio.CancelScope(shield=True):
                await anyio.to_thread.run_sync(executions.close)
                await anyio.to_thread.run_sync(plans.close)
                await anyio.to_thread.run_sync(reviews.close)

    server = MCPServer(
        "Rondo", version="0.15.0", log_level="WARNING", lifespan=lifespan,
        instructions=(
            "Local task handoffs for one trusted user. Read a task before claiming. "
            "Use start_task to prepare a new task and isolated workspace; retain task_id and recover with get_task_context. "
            "When implementation is ready, start_task_review uses the saved workspace and base commit. "
            "start_task_plan explicitly consumes quota for one bounded plan; read_plan verifies code freshness. "
            "Plan verification text is not executed. Plans have a separate two-attempt budget; no automatic retries. "
            "Keep the returned attempt_id, claim_token and version; do not publish the token. "
            "Renew long-running claims before expiry. Submit a bounded result with a stable "
            "request_id; retry the same submission only with identical content. "
            "Submitted means a worker report is stored, not tested or reviewed code. "
            "start_review explicitly runs one bounded Codex review and consumes quota. "
            "Reuse its request_id to recover lost replies; poll status rather than restart. "
            "At most two review attempts per task, including failed/cancelled attempts. "
            "Cancel requests are not completion proof. Review approval is not test success."
            " Locally configured checks run on a disposable snapshot copy before Codex; check failures stop generation."
        ),
    )

    @server.tool(structured_output=True)
    async def check_agent_connection(agent: Annotated[str, Field(strict=True, min_length=1, max_length=50)]) -> dict[str, Any]:
        """Explicit local protocol handshake; starts the selected program but no session, prompt, login or model call. Does not certify account or quota."""
        return await asyncio.to_thread(_invoke, check_agent, agent)

    @server.tool(structured_output=True)
    async def start_task(
        repo: Annotated[str, Field(strict=True, min_length=1, max_length=4096)],
        title: Annotated[str, Field(strict=True, min_length=1, max_length=160)],
        instructions: Annotated[str, Field(strict=True, min_length=1, max_length=8000)],
        acceptance: Annotated[str, Field(strict=True, min_length=1, max_length=4000)],
        request_id: Annotated[str, Field(strict=True, min_length=1, max_length=128)],
        base_ref: Annotated[str, Field(strict=True, min_length=1, max_length=200)] = 'HEAD',
        new_project: Annotated[bool, Field(strict=True)] = False,
        agents: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Prepare task + isolated Git workspace + fixed base in ONE call. Same request_id/content reuses it. No model call."""
        return await asyncio.to_thread(_invoke, tasks.start, repo, title, instructions, acceptance, request_id, base_ref, new_project, agents)

    @server.tool(structured_output=True)
    async def list_agents() -> dict[str, Any]:
        """Read local native/ACP agents and prerequisites. Installed is not authenticated; no model or download."""
        return await asyncio.to_thread(catalog)

    @server.tool(structured_output=True)
    def get_task_context(task_id: TaskId) -> dict[str, Any]:
        """Resume a prepared task: requirements, workspace, fixed base and next action. No full chat history."""
        return _invoke(tasks.context, task_id)

    @server.tool(structured_output=True)
    async def get_task_changes(task_id: TaskId) -> dict[str, Any]:
        """Read bounded Git changes, including untracked files, in this task's saved workspace. No model call."""
        return await asyncio.to_thread(_invoke, tasks.changes, task_id)

    @server.tool(structured_output=True)
    async def workbuddy_status(launch: bool = False) -> dict[str, Any]:
        """Check native WorkBuddy transport/models without a model call; optionally launch the installed desktop if closed."""
        return await asyncio.to_thread(workbuddy_connection, reviews.root, launch)

    @server.tool(structured_output=True)
    async def start_task_execution(
        task_id: TaskId,
        request_id: Annotated[str, Field(strict=True, min_length=1, max_length=128)],
        plan_job_id: JobId | None = None,
        expected_plan_id: str | None = None,
        model_choice: dict[str, str] | None = None,
        review_model_choice: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Run a saved current plan in native WorkBuddy, then Codex review; changes_requested may trigger ONE repair and final review. At most two native turns and two reviews, using both quotas. Never replay unknown dispatches."""
        return await asyncio.to_thread(_invoke, executions.start_execution, task_id, request_id, plan_job_id, expected_plan_id, model_choice, review_model_choice)

    @server.tool(structured_output=True)
    def get_execution_status(job_id: JobId) -> dict[str, Any]:
        """Read saved native session/phase/review link. Reading does not send another prompt."""
        return _invoke(executions.status, job_id)

    @server.tool(structured_output=True)
    def cancel_execution(job_id: JobId) -> dict[str, Any]:
        """Request cancellation of this job's dedicated WorkBuddy session; poll for confirmed terminal state."""
        return _invoke(executions.cancel, job_id)

    @server.tool(structured_output=True)
    async def start_task_repair(source_review_job_id: JobId, model_choice: dict[str, str] | None = None) -> dict[str, Any]:
        """Run the task's ONE native WorkBuddy repair from its latest current changes_requested review, then one Codex re-review. Consumes both quotas. Stable source identity reuses the same repair; no third round."""
        return await asyncio.to_thread(_invoke, executions.start_repair, source_review_job_id, model_choice)

    @server.tool(structured_output=True)
    async def start_task_plan(
        task_id: TaskId,
        request_id: Annotated[str, Field(strict=True, min_length=1, max_length=128)],
    ) -> dict[str, Any]:
        """Generate ONE bounded plan for a saved workspace. Explicitly consumes quota; same request_id reuses it. No automatic retry."""
        context = _invoke(tasks.context, task_id)
        return await asyncio.to_thread(_invoke, plans.start_review, task_id, context['workspace'], context['base_commit'], request_id)

    @server.tool(structured_output=True)
    async def send_planning_message(task_id: TaskId,
                                    request_id: Annotated[str, Field(strict=True, min_length=1, max_length=128)],
                                    message: Annotated[str, Field(strict=True, min_length=1, max_length=4000)],
                                    model_choice: dict[str, str] | None = None) -> dict[str, Any]:
        """Explicit paid planning turn: answer a question or revise the plan. Never starts execution. Same request_id/content reuses the turn."""
        context = _invoke(tasks.context, task_id)
        return await asyncio.to_thread(_invoke, plans.start_message, task_id, context['workspace'], context['base_commit'], request_id, message, model_choice)

    @server.tool(structured_output=True)
    def read_planning_conversation(task_id: TaskId) -> dict[str, Any]:
        """Read up to 100 persisted planning turns, including failed user messages and plan version references. No model call."""
        return _invoke(plans.conversation, task_id)

    @server.tool(structured_output=True)
    def get_plan_status(job_id: JobId) -> dict[str, Any]:
        """Read the planning job state; poll without starting another generation."""
        return _invoke(plans.status, job_id)

    @server.tool(structured_output=True)
    def answer_native_request(job_id: JobId, request_id: str, answer: str | dict[str, str], kind: str) -> dict[str, Any]:
        """Reply to a pending Codex request after the user chooses in Rondo; never auto-approve. kind: plan or review."""
        if kind not in ('plan', 'review', 'execution'):
            raise ValueError('Expected plan, review or execution')
        return _invoke({'plan': plans, 'review': reviews, 'execution': executions}[kind].answer, job_id, request_id, answer)

    @server.tool(structured_output=True)
    async def read_plan(job_id: JobId) -> dict[str, Any]:
        """Read a completed plan and verify saved evidence/current-code freshness. Plain-language verification is not executed."""
        return await asyncio.to_thread(_invoke, plans.read_plan, job_id)

    @server.tool(structured_output=True)
    def cancel_plan(job_id: JobId) -> dict[str, Any]:
        """Request cancellation; keep polling until a terminal state. No automatic replay."""
        return _invoke(plans.cancel, job_id)

    @server.tool(structured_output=True)
    async def list_agent_models(agent: str) -> dict[str, Any]:
        """Read native model choices via Agent handshake. No model turn or authentication change."""
        from .model_settings import list_agent_models as read_models
        return await asyncio.to_thread(_invoke, read_models, agent)

    @server.tool(structured_output=True)
    async def start_task_review(
        task_id: TaskId,
        request_id: Annotated[str, Field(strict=True, min_length=1, max_length=128)],
        model_choice: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Review a prepared task using its SAVED workspace/base. Stop editing first. Can consume Codex quota."""
        context = _invoke(tasks.context, task_id)
        from .model_settings import validate_model_choice
        from functools import partial
        _invoke(validate_model_choice, model_choice)
        operation = partial(reviews.start_review, input_data={'model_choice': model_choice} if model_choice else None)
        return await asyncio.to_thread(_invoke, operation, task_id, context['workspace'], context['base_commit'], request_id)

    @server.tool(structured_output=True)
    def create_task(
        title: Annotated[str, Field(strict=True, min_length=1, max_length=160)],
        instructions: Annotated[str, Field(strict=True, min_length=1, max_length=8000)],
        acceptance: Annotated[str, Field(strict=True, min_length=1, max_length=4000)],
    ) -> dict[str, Any]:
        """Create a ready task with explicit instructions and acceptance criteria."""
        return _invoke(store.create_task, title, instructions, acceptance)

    @server.tool(structured_output=True)
    def get_task(task_id: TaskId) -> dict[str, Any]:
        """Read one task, its current version, claim summary and submitted report."""
        return _invoke(store.get_task, task_id)

    @server.tool(structured_output=True)
    def list_tasks(
        limit: Annotated[int, Field(strict=True, ge=1, le=20)] = 10,
        after_id: Annotated[int, Field(strict=True, ge=0, le=2**63 - 1)] = 0,
    ) -> dict[str, Any]:
        """List compact tasks in ID order; pass next_after_id to read the next page."""
        return _invoke(store.list_tasks, limit, after_id)

    @server.tool(structured_output=True)
    def claim_task(
        task_id: TaskId,
        owner: Annotated[str, Field(strict=True, min_length=1, max_length=80)],
        expected_version: Version,
        lease_seconds: LeaseSeconds = 900,
    ) -> dict[str, Any]:
        """Atomically claim an unclaimed task; retain its private attempt credentials."""
        return _invoke(store.claim_task, task_id, owner, expected_version, lease_seconds)

    @server.tool(structured_output=True)
    def renew_claim(
        task_id: TaskId, attempt_id: AttemptId, claim_token: ClaimToken,
        lease_seconds: LeaseSeconds = 900,
    ) -> dict[str, Any]:
        """Extend a live claim before expiry; expired attempts cannot be renewed."""
        return _invoke(store.renew_claim, task_id, attempt_id, claim_token, lease_seconds)

    @server.tool(structured_output=True)
    def submit_result(
        task_id: TaskId, attempt_id: AttemptId, claim_token: ClaimToken,
        expected_version: Version,
        summary: Annotated[str, Field(strict=True, min_length=1, max_length=4000)],
        request_id: Annotated[str, Field(strict=True, min_length=1, max_length=128)],
    ) -> dict[str, Any]:
        """Store a report once. Repeat identical request_id/content to recover a lost reply."""
        return _invoke(store.submit_result, task_id, attempt_id, claim_token, expected_version, summary, request_id)

    @server.tool(structured_output=True)
    def start_review(
        task_id: TaskId,
        repo: Annotated[str, Field(strict=True, min_length=1, max_length=4096)],
        base_ref: Annotated[str, Field(strict=True, min_length=1, max_length=200)],
        request_id: Annotated[str, Field(strict=True, min_length=1, max_length=128)],
    ) -> dict[str, Any]:
        """Start ONE paid Codex review in background. Stop editing first. Same request_id retries reuse the job."""
        return _invoke(reviews.start_review, task_id, repo, base_ref, request_id)

    @server.tool(structured_output=True)
    def get_review_status(job_id: JobId) -> dict[str, Any]:
        """Read compact status. Poll this job, never repeat start with a new request_id to wait."""
        return _invoke(reviews.status, job_id)

    @server.tool(structured_output=True)
    async def read_review(
        job_id: JobId,
        limit: Annotated[int, Field(strict=True, ge=1, le=10)] = 5,
        after_index: Annotated[int, Field(strict=True, ge=0)] = 0,
    ) -> dict[str, Any]:
        """Read successful findings in pages, verify fixed files and current-code freshness. Checks may be not_run."""
        return await asyncio.to_thread(_invoke, reviews.read_review, job_id, limit, after_index)

    @server.tool(structured_output=True)
    def cancel_review(job_id: JobId) -> dict[str, Any]:
        """Request stop; cancelling is intermediate. Poll until cancelled/failed/succeeded/interrupted."""
        return _invoke(reviews.cancel, job_id)

    return server
