"""Real MCP transports, explicit fixture backend, no models or credentials."""
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
    root = project / '.agent-review-loop/async-demos' / uuid4().hex
    repo = root / '合成 repo'
    repo.mkdir(parents=True)
    for argv in (['init', '-q'], ['config', 'user.name', 'Fixture'], ['config', 'user.email', 'fixture@example.invalid'],
                 ['config', 'core.autocrlf', 'false']):
        subprocess.run(['git', *argv], cwd=repo, check=True, capture_output=True)
    (repo / 'code.py').write_bytes(b'print(1)\n')
    subprocess.run(['git', 'add', '.'], cwd=repo, check=True, capture_output=True)
    subprocess.run(['git', 'commit', '-qm', 'fixture'], cwd=repo, check=True, capture_output=True)
    parameters = StdioServerParameters(command=sys.executable, cwd=project, args=[
        '-X', 'utf8', str(project / 'tests/fixtures/review_service.py'), '--db', str(root / 'tasks.db'),
        '--root', str(root / 'runs'), '--control', str(root / 'control')])

    def event(name, **data):
        print(json.dumps({'event': name, **data}, ensure_ascii=False))

    async def tool(client, name, args):
        result = await client.call_tool(name, args)
        assert not result.is_error, result.content
        return result.structured_content

    async def wait(client, job, wanted):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            status = await tool(client, 'get_review_status', {'job_id': job})
            if status['status'] == wanted:
                return status
            if status['status'] == 'failed':
                raise AssertionError(status)
            await asyncio.sleep(.05)
        raise TimeoutError(f'Never reached {wanted}')

    async with Client(parameters) as first, Client(parameters, mode='legacy') as second:
        tools = await first.list_tools()
        event('connected', tools=len(tools.tools), catalog_bytes=len(tools.model_dump_json().encode()), backend='fixture')
        task = await tool(first, 'create_task', {'title': '异步审查演示', 'instructions': 'findings', 'acceptance': '只验证协议，不调用模型'})
        args = {'task_id': task['task_id'], 'repo': str(repo), 'base_ref': 'HEAD', 'request_id': 'demo-review'}
        started = time.monotonic()
        job = await tool(first, 'start_review', args)
        repeated = await tool(second, 'start_review', args)
        assert job['job_id'] == repeated['job_id']
        event('start_returned', elapsed_seconds=round(time.monotonic() - started, 3), same_job=True)
        await wait(second, job['job_id'], 'succeeded')
        review = await tool(second, 'read_review', {'job_id': job['job_id']})
        event('review_read', count=len(review['findings']), total=review['total_findings'], freshness=review['freshness'])
        (repo / 'code.py').write_bytes(b'print(2)\n')
        stale = await tool(first, 'read_review', {'job_id': job['job_id']})
        assert stale['freshness'] == 'stale' and not stale['review_approved']
        event('new_code', old_review='stale')
        task = await tool(first, 'create_task', {'title': '取消演示', 'instructions': 'wait', 'acceptance': '后台实际退出'})
        job = await tool(first, 'start_review', {**args, 'task_id': task['task_id'], 'request_id': 'cancel-demo'})
        marker = root / 'runs' / job['job_id'] / 'runtime/started'
        deadline = time.monotonic() + 10
        while not marker.exists():
            if time.monotonic() > deadline:
                raise TimeoutError('Fixture did not start')
            await asyncio.sleep(.02)
        requested = await tool(second, 'cancel_review', {'job_id': job['job_id']})
        event('cancel_requested', status=requested['status'])
        await wait(first, job['job_id'], 'cancelled')
        event('cancel_finished', status='cancelled')
    event('complete', model_calls=0, real_workbuddy_verified=False, evidence=str(root))


if __name__ == '__main__':
    asyncio.run(main())
