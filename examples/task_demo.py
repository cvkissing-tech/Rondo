"""Run: python -m examples.task_demo. Real MCP, synthetic work, no model calls."""

import asyncio
import json
import sys
import tempfile
from pathlib import Path

from mcp import Client, StdioServerParameters


def show(event, **fields):
    print(json.dumps({"event": event, **fields}, ensure_ascii=False), flush=True)


async def demonstrate(db: Path):
    parameters = StdioServerParameters(
        command=sys.executable,
        args=["-X", "utf8", "-m", "agent_review_loop", "serve", "--db", str(db)],
        cwd=Path(__file__).resolve().parents[1],
    )
    async with Client(parameters, read_timeout_seconds=15) as planner, Client(parameters, mode="legacy", read_timeout_seconds=15) as worker:
        show("connected", clients=2, protocols=[planner.protocol_version, worker.protocol_version])
        tools = await planner.list_tools()
        show("tools", names=[tool.name for tool in tools.tools], catalog_bytes=len(tools.model_dump_json().encode("utf-8")))
        created = await planner.call_tool("create_task", {"title": "首次双客户端交接", "instructions": "返回一句完成说明，不修改任何文件", "acceptance": "第三个服务进程能读到同一条提交记录"})
        assert not created.is_error, created.content
        task = created.structured_content
        task_id = task["task_id"]
        show("created", **task)
        claimed = await worker.call_tool("claim_task", {"task_id": task_id, "owner": "synthetic-worker", "expected_version": task["version"]})
        assert not claimed.is_error, claimed.content
        claim = claimed.structured_content
        show("claimed", task_id=task_id, version=claim["version"])
        conflict = await planner.call_tool("claim_task", {"task_id": task_id, "owner": "second-worker", "expected_version": task["version"]})
        assert conflict.is_error and "TASK_CLAIMED" in conflict.content[0].text
        show("second_claim_rejected", code="TASK_CLAIMED")
        arguments = {"task_id": task_id, "attempt_id": claim["attempt_id"], "claim_token": claim["claim_token"], "expected_version": claim["version"], "summary": "已完成合成交接；没有调用模型，也没有修改代码。", "request_id": "demo-submit-1"}
        submitted = await worker.call_tool("submit_result", arguments)
        assert not submitted.is_error, submitted.content
        receipt = submitted.structured_content
        show("submitted", task_id=task_id, version=receipt["version"])
        replay = await worker.call_tool("submit_result", arguments)
        assert replay.structured_content == receipt and not replay.is_error
        show("duplicate_submission", same_receipt=True)
    async with Client(parameters, read_timeout_seconds=15) as restarted:
        replay = await restarted.call_tool("submit_result", arguments)
        detail = await restarted.call_tool("get_task", {"task_id": task_id})
        assert replay.structured_content == receipt and not replay.is_error
        assert detail.structured_content["result"]["summary"] == arguments["summary"]
        show("restart_verified", status=detail.structured_content["status"], same_receipt=True)
    show("complete", model_calls=0, real_agent_clients_verified=False)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    with tempfile.TemporaryDirectory(prefix="任务 演示 ") as folder:
        asyncio.run(demonstrate(Path(folder) / "tasks.sqlite3"))


if __name__ == "__main__":
    main()
