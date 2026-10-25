"""Actual unittest failures gate a labelled fixture reviewer. No model calls."""

import asyncio
import json
from pathlib import Path
import subprocess
import sys
import time
from uuid import uuid4

from mcp import Client, StdioServerParameters


async def main():
    project = Path(__file__).resolve().parents[1]
    root = project / '.agent-review-loop/checked-demos' / uuid4().hex
    repo = root / '合成 repo'
    repo.mkdir(parents=True)
    for args in (['init', '-q'], ['config', 'user.name', 'Fixture'],
                 ['config', 'user.email', 'fixture@example.invalid'], ['config', 'core.autocrlf', 'false']):
        subprocess.run(['git', *args], cwd=repo, check=True, capture_output=True)
    (repo / 'calculator.py').write_bytes(b'def add(a, b):\n    return a - b\n')
    (repo / 'test_calculator.py').write_bytes(
        b'import unittest\nfrom calculator import add\n\nclass AddTests(unittest.TestCase):\n'
        b'    def test_sum(self):\n        self.assertEqual(add(2,3),5)\n')
    subprocess.run(['git', 'add', '.'], cwd=repo, check=True, capture_output=True)
    subprocess.run(['git', 'commit', '-qm', 'synthetic failing baseline'], cwd=repo, check=True, capture_output=True)
    config = root / 'checks.json'
    config.write_text(json.dumps({'argv': [sys.executable, '-m', 'unittest', 'discover', '-s', '.', '-p', 'test_*.py'],
                                  'timeout_seconds': 10}), encoding='utf-8')
    parameters = StdioServerParameters(command=sys.executable, cwd=project, args=[
        '-X', 'utf8', str(project / 'tests/fixtures/review_service.py'), '--db', str(root / 'tasks.db'),
        '--root', str(root / 'runs'), '--control', str(root / 'control'), '--check-config', str(config)])

    def event(name, **data):
        print(json.dumps({'event': name, **data}, ensure_ascii=False))

    async def tool(client, name, args):
        result = await client.call_tool(name, args)
        assert not result.is_error, result.content
        return result.structured_content

    async def wait(client, job, wanted):
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            status = await tool(client, 'get_review_status', {'job_id': job})
            if status['status'] == wanted:
                return status
            if status['status'] in ('failed', 'interrupted', 'cancelled'):
                raise AssertionError(status)
            await asyncio.sleep(.05)
        raise TimeoutError(wanted)

    async with Client(parameters) as client:
        task = await tool(client, 'create_task', {'title': '修复合成加法', 'instructions': 'approve',
                                                'acceptance': '真实unittest通过，模型调用0'})
        args = {'task_id': task['task_id'], 'repo': str(repo), 'base_ref': 'HEAD', 'request_id': 'before-fix'}
        job = await tool(client, 'start_review', args)
        failed = await wait(client, job['job_id'], 'failed')
        assert failed['checks']['status'] == 'failed'
        assert not (root / 'control/calls.ndjson').exists()
        event('failed_check_blocked_reviewer', exit_code=failed['checks']['exit_code'], reviewer_calls=0)
        (repo / 'calculator.py').write_bytes(b'def add(a, b):\n    return a + b\n')
        fixed = await tool(client, 'start_review', {**args, 'request_id': 'after-fix'})
        await wait(client, fixed['job_id'], 'succeeded')
        review = await tool(client, 'read_review', {'job_id': fixed['job_id']})
        assert review['checks']['status'] == 'passed' and review['freshness'] == 'current'
        assert len((root / 'control/calls.ndjson').read_text().splitlines()) == 1
        event('passed_check_then_fixture_review', checks='passed', backend=review['backend'], freshness='current')
        log = root / 'runs' / fixed['job_id'] / 'package/checks/stdout.log'
        log.write_bytes(b'forged passing output')
        invalid = await client.call_tool('read_review', {'job_id': fixed['job_id']})
        assert invalid.is_error and 'PACKAGE_CHANGED' in invalid.content[0].text
        event('tampering_detected', code='PACKAGE_CHANGED')
    event('complete', model_calls=0, real_workbuddy_verified=False, evidence=str(root))


if __name__ == '__main__':
    asyncio.run(main())
