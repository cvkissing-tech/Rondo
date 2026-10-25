import asyncio
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

from mcp import Client, StdioServerParameters


ROOT = Path(__file__).resolve().parents[1]


class ReviewMCPTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='异步 MCP ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        for args in (['init', '-q'], ['config', 'user.name', 'Fixture'],
                     ['config', 'user.email', 'fixture@example.invalid'], ['config', 'core.autocrlf', 'false']):
            subprocess.run(['git', *args], cwd=self.repo, capture_output=True, check=True)
        (self.repo / 'code.py').write_bytes(b'print(1)\n')
        subprocess.run(['git', 'add', '.'], cwd=self.repo, check=True, capture_output=True)
        subprocess.run(['git', 'commit', '-qm', 'fixture'], cwd=self.repo, check=True, capture_output=True)
        self.db = self.root / 'tasks.db'
        self.runs = self.root / 'runs'
        self.control = self.root / 'control'

    def parameters(self):
        return StdioServerParameters(command=sys.executable, cwd=ROOT,
            args=['-X', 'utf8', str(ROOT / 'tests/fixtures/review_service.py'), '--db', str(self.db),
                  '--root', str(self.runs), '--control', str(self.control)])

    async def tool(self, client, name, args):
        result = await client.call_tool(name, args)
        self.assertFalse(result.is_error, result.content)
        return result.structured_content

    async def task(self, client, mode):
        result = await self.tool(client, 'create_task', {'title': 'SDK fixture', 'instructions': mode, 'acceptance': 'offline only'})
        return result['task_id']

    async def wait_status(self, client, job_id, desired):
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            result = await self.tool(client, 'get_review_status', {'job_id': job_id})
            if result['status'] == desired:
                return result
            if result['status'] == 'failed' and desired != 'failed':
                self.fail(str(result))
            await asyncio.sleep(.03)
        self.fail(f'Did not reach {desired}: {result}')

    async def wait_started(self, job_id):
        marker = self.runs / job_id / 'runtime/started'
        deadline = time.monotonic() + 10
        while not marker.exists():
            if time.monotonic() > deadline:
                self.fail('Fixture never started')
            await asyncio.sleep(.02)

    async def test_real_stdio_two_clients_idempotency_cancel_and_restart(self):
        async with Client(self.parameters()) as first, Client(self.parameters(), mode='legacy') as second:
            task_id = await self.task(first, 'wait')
            args = {'task_id': task_id, 'repo': str(self.repo), 'base_ref': 'HEAD', 'request_id': 'same'}
            started = time.monotonic()
            results = await asyncio.gather(first.call_tool('start_review', args), second.call_tool('start_review', args))
            self.assertLess(time.monotonic() - started, 3)
            self.assertTrue(all(not result.is_error for result in results))
            job_id = results[0].structured_content['job_id']
            self.assertEqual(job_id, results[1].structured_content['job_id'])
            await self.wait_started(job_id)
            busy = await second.call_tool('start_review', {**args, 'request_id': 'new'})
            self.assertTrue(busy.is_error)
            self.assertIn('REVIEW_BUSY', busy.content[0].text)
            cancelled = await self.tool(second, 'cancel_review', {'job_id': job_id})
            self.assertEqual(cancelled['status'], 'cancelling')
            await self.wait_status(first, job_id, 'cancelled')
        async with Client(self.parameters()) as third:
            result = await self.tool(third, 'start_review', args)
            self.assertEqual((result['job_id'], result['status']), (job_id, 'cancelled'))
            self.assertEqual(len((self.control / 'calls.ndjson').read_text().splitlines()), 1)

    async def test_paginated_findings_and_freshness(self):
        async with Client(self.parameters()) as client:
            task_id = await self.task(client, 'findings')
            job = await self.tool(client, 'start_review', {'task_id': task_id, 'repo': str(self.repo), 'base_ref': 'HEAD', 'request_id': 'page'})
            await self.wait_status(client, job['job_id'], 'succeeded')
            first = await self.tool(client, 'read_review', {'job_id': job['job_id']})
            self.assertEqual((len(first['findings']), first['total_findings'], first['next_after_index']), (5, 12, 5))
            self.assertEqual(first['backend'], 'fixture')
            self.assertEqual(first['freshness'], 'current')
            (self.repo / 'code.py').write_bytes(b'print(2)\n')
            second = await self.tool(client, 'read_review', {'job_id': job['job_id'], 'after_index': 5})
            self.assertEqual(second['freshness'], 'stale')
            self.assertFalse(second['review_approved'])
            self.assertEqual(second['findings'][0]['id'], 'F5')

    async def test_abrupt_owner_exit_becomes_interrupted_without_replay(self):
        async with Client(self.parameters()) as observer:
            owner = Client(self.parameters())
            await owner.__aenter__()
            try:
                task_id = await self.task(observer, 'wait')
                args = {'task_id': task_id, 'repo': str(self.repo), 'base_ref': 'HEAD', 'request_id': 'crash'}
                job = await self.tool(owner, 'start_review', args)
                await self.wait_started(job['job_id'])
                (self.control / 'crash').touch()
                await self.wait_status(observer, job['job_id'], 'interrupted')
                same = await self.tool(observer, 'start_review', args)
                self.assertEqual(same['status'], 'interrupted')
                self.assertEqual(len((self.control / 'calls.ndjson').read_text().splitlines()), 1)
            finally:
                # SDK teardown can report a broken stream after this intentional os._exit.
                try:
                    await owner.__aexit__(None, None, None)
                except Exception:
                    pass


if __name__ == '__main__':
    unittest.main()
