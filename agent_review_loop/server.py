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


def create_server(store: TaskStore, reviews: ReviewJobs | None = None) -> MCPServer:
    reviews = reviews or ReviewJobs(store)

    @asynccontextmanager
    async def lifespan(server):
        try:
            yield
        finally:
            with anyio.CancelScope(shield=True):
                await anyio.to_thread.run_sync(reviews.close)

    server = MCPServer(
        "Agent Review Loop", version="0.5.0", log_level="WARNING", lifespan=lifespan,
        instructions=(
            "Local task handoffs for one trusted user. Read a task before claiming. "
            "Keep the returned attempt_id, claim_token and version; do not publish the token. "
            "Renew long-running claims before expiry. Submit a bounded result with a stable "
            "request_id; retry the same submission only with identical content. "
            "Submitted means a worker report is stored, not tested or reviewed code. "
            "start_review explicitly runs one bounded Codex review and consumes quota. "
            "Reuse its request_id to recover lost replies; poll status rather than restart. "
            "At most two review attempts per task, including failed/cancelled attempts. "
            "Cancel requests are not completion proof. Review approval is not test success."
        ),
    )

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
