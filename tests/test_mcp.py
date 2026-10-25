"""Two actual stdio server processes, using the official SDK as the clients."""

import asyncio
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from mcp import Client, StdioServerParameters

ROOT = Path(__file__).resolve().parents[1]


class MCPTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="MCP 中文 ")
        self.addCleanup(self.temp.cleanup)
        self.db = Path(self.temp.name) / "tasks.sqlite3"

    def parameters(self):
        return StdioServerParameters(
            command=sys.executable,
            args=["-X", "utf8", "-m", "agent_review_loop", "serve", "--db", str(self.db)],
            cwd=ROOT,
        )

    async def test_two_servers_handoff_legacy_compatibility_and_restart(self):
        async with (
            Client(self.parameters(), read_timeout_seconds=15) as first,
            Client(self.parameters(), mode="legacy", read_timeout_seconds=15) as second,
        ):
            self.assertEqual(first.protocol_version, "2026-07-28")
            self.assertEqual(second.protocol_version, "2025-11-25")
            tools = await first.list_tools()
            self.assertEqual({tool.name for tool in tools.tools}, {"create_task", "get_task", "list_tasks", "claim_task", "renew_claim", "submit_result", "start_review", "get_review_status", "read_review", "cancel_review"})
            self.assertLess(len(tools.model_dump_json().encode()), 18000)
            created = await first.call_tool("create_task", {"title": "SDK 合成任务", "instructions": "返回一条说明，不改代码", "acceptance": "另一个客户端能读取"})
            self.assertFalse(created.is_error, created.content)
            task = created.structured_content
            task_id = task["task_id"]
            read = await second.call_tool("get_task", {"task_id": task_id})
            self.assertEqual(read.structured_content["title"], "SDK 合成任务")
            results = await asyncio.gather(*[
                client.call_tool("claim_task", {"task_id": task_id, "owner": owner, "expected_version": 1})
                for client, owner in ((first, "client-A"), (second, "client-B"))
            ])
            winners = [result for result in results if not result.is_error]
            losers = [result for result in results if result.is_error]
            self.assertEqual(len(winners), 1)
            self.assertEqual(len(losers), 1)
            self.assertIn("TASK_CLAIMED", losers[0].content[0].text)
            claim = winners[0].structured_content
            arguments = {"task_id": task_id, "attempt_id": claim["attempt_id"], "claim_token": claim["claim_token"], "expected_version": claim["version"], "summary": "离线交接完成；未调用模型", "request_id": "sdk-submit-1"}
            receipts = await asyncio.gather(first.call_tool("submit_result", arguments), second.call_tool("submit_result", arguments))
            receipt = receipts[0]
            self.assertFalse(receipt.is_error, receipt.content)
            self.assertFalse(receipts[1].is_error, receipts[1].content)
            self.assertEqual(receipt.structured_content, receipts[1].structured_content)
            bad = await second.call_tool("submit_result", {**arguments, "summary": "different"})
            self.assertTrue(bad.is_error)
            self.assertIn("IDEMPOTENCY_CONFLICT", bad.content[0].text)
        # Both original servers exited. A fresh process must recover the receipt.
        async with Client(self.parameters(), read_timeout_seconds=15) as restarted:
            replay = await restarted.call_tool("submit_result", arguments)
            self.assertEqual(replay.structured_content, receipt.structured_content)
            self.assertFalse(replay.is_error)
            detail = await restarted.call_tool("get_task", {"task_id": task_id})
            self.assertEqual(detail.structured_content["status"], "submitted")
            self.assertNotIn(claim["claim_token"], detail.model_dump_json())

    async def test_validation_and_tools_are_bounded(self):
        async with Client(self.parameters(), read_timeout_seconds=15) as client:
            for name, args in (
                ("get_task", {"task_id": True}),
                ("list_tasks", {"limit": 1000}),
                ("create_task", {"title": " " * 3, "instructions": "x", "acceptance": "y"}),
                ("get_task", {"task_id": 999}),
            ):
                with self.subTest(tool=name, arguments=args):
                    result = await client.call_tool(name, args)
                    self.assertTrue(result.is_error, result.content)

    def test_generated_config_and_help_do_not_create_database(self):
        command = [sys.executable, "-m", "agent_review_loop"]
        config = subprocess.run(command + ["config", "--db", str(self.db)], cwd=ROOT, capture_output=True, encoding="utf-8", timeout=15)
        self.assertEqual(config.returncode, 0, config.stderr)
        entry = json.loads(config.stdout)["mcpServers"]["agent-review-loop"]
        self.assertEqual(entry["args"][-1], str(self.db))
        self.assertFalse(self.db.exists())
        checks = Path(self.temp.name) / 'checks.json'
        configured = subprocess.run(command + ['config', '--db', str(self.db), '--check-config', str(checks)],
                                    cwd=ROOT, capture_output=True, encoding='utf-8', timeout=15)
        self.assertEqual(configured.returncode, 0, configured.stderr)
        self.assertEqual(json.loads(configured.stdout)['mcpServers']['agent-review-loop']['args'][-2:],
                         ['--check-config', str(checks)])
        self.assertFalse(self.db.exists())
        invalid = subprocess.run(command + ["serve", "--db", "relative.db"], cwd=ROOT, capture_output=True, timeout=15)
        self.assertNotEqual(invalid.returncode, 0)
        self.assertFalse((ROOT / "relative.db").exists())

    def test_installed_package_works_outside_repository(self):
        command = [sys.executable, "-X", "utf8", "-m", "agent_review_loop"]
        created = subprocess.run(command + ["create", "--db", str(self.db), "--title", "目录无关", "--instructions", "合成任务", "--acceptance", "可读取"], cwd=self.temp.name, capture_output=True, encoding="utf-8", timeout=15)
        self.assertEqual(created.returncode, 0, created.stderr)
        read = subprocess.run(command + ["get", "--db", str(self.db), "1"], cwd=self.temp.name, capture_output=True, encoding="utf-8", timeout=15)
        self.assertEqual(read.returncode, 0, read.stderr)
        self.assertEqual(json.loads(read.stdout)["title"], "目录无关")


if __name__ == "__main__":
    unittest.main()
