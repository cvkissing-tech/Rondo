"""The MCP boundary: types describe the tools; TaskStore owns the rules."""

import json
from typing import Annotated, Any

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from .store import StoreError, TaskStore


TaskId = Annotated[int, Field(strict=True, ge=1, le=2**63 - 1)]
Version = TaskId
LeaseSeconds = Annotated[int, Field(strict=True, ge=30, le=3600)]
ClaimToken = Annotated[str, Field(strict=True, min_length=1, max_length=128)]
AttemptId = Annotated[str, Field(strict=True, min_length=1, max_length=64)]


def _invoke(operation, *args):
    try:
        return operation(*args)
    except StoreError as error:
        # ToolError becomes a genuine MCP isError result, not a success string.
        raise ToolError(json.dumps({"code": error.code, "message": str(error)}, ensure_ascii=False)) from error


def create_server(store: TaskStore) -> MCPServer:
    server = MCPServer(
        "Agent Review Loop", version="0.2.0", log_level="WARNING",
        instructions=(
            "Local task handoffs for one trusted user. Read a task before claiming. "
            "Keep the returned attempt_id, claim_token and version; do not publish the token. "
            "Renew long-running claims before expiry. Submit a bounded result with a stable "
            "request_id; retry the same submission only with identical content. "
            "Submitted means a worker report is stored, not tested or reviewed code. "
            "This server neither runs models nor wakes other agent applications."
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

    return server
