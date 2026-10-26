"""Small durable UI projection of native events; raw events stay in the run directory."""
import json
from pathlib import Path
import time
from uuid import uuid4

from .codex_rpc import RpcError, ReviewCancelled
from .snapshots import canonical


def write_state(directory, state):
    path = Path(directory) / 'session.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_bytes(canonical(state))
    temporary.replace(path)


def read_state(directory):
    try:
        return json.loads((Path(directory) / 'session.json').read_text(encoding='utf-8'))
    except FileNotFoundError:
        return {}


def interactive_request(directory, state, request, cancel_check):
    method, params = request['method'], request.get('params', {})
    approvals = ('item/commandExecution/requestApproval', 'item/fileChange/requestApproval')
    if method not in (*approvals, 'item/tool/requestUserInput'):
        # Never fabricate a permission grant, MCP elicitation answer, or client tool result.
        raise RpcError(f'原生会话需要暂未支持的交互：{method}；请在原生会话中处理')
    token = uuid4().hex
    response = Path(directory) / f'answer-{token}.json'
    state['pending'] = {'id': token, 'method': method, 'params': params}
    write_state(directory, state)
    deadline = time.monotonic() + 180
    try:
        while not response.exists():
            if cancel_check and cancel_check():
                raise ReviewCancelled('等待用户输入时已取消')
            if time.monotonic() > deadline:
                raise TimeoutError('等待用户输入超时；会话已保留，没有自动批准或重试')
            time.sleep(.1)
        answer = json.loads(response.read_text(encoding='utf-8'))
        if method in approvals:
            if answer not in ('accept', 'decline'):
                raise RpcError('Invalid approval decision')
            return {'decision': answer}
        questions = params.get('questions', [])
        if (not isinstance(answer, dict) or set(answer) != {q['id'] for q in questions}
                or not all(isinstance(v, str) and 0 < len(v) <= 4000 for v in answer.values())):
            raise RpcError('Invalid question answers')
        return {'answers': {key: {'answers': [value]} for key, value in answer.items()}}
    finally:
        state.pop('pending', None)
        write_state(directory, state)


def project_event(state, event):
    method, params = event['method'], event.get('params', {})
    item = params.get('item', {})
    if method not in ('item/started', 'item/completed'):
        return
    kind = item.get('type')
    if kind not in ('agentMessage', 'commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'webSearch'):
        return
    text = item.get('text') or item.get('command') or item.get('tool') or item.get('query') or kind
    entry = {'id': item.get('id', str(len(state.get('events', [])))), 'kind': kind,
             'status': item.get('status', 'completed' if method == 'item/completed' else 'running'),
             'text': str(text)[:6000], 'output': str(item.get('aggregatedOutput') or '')[-8000:]}
    events = state.setdefault('events', [])
    existing = next((i for i, e in enumerate(events) if e['id'] == entry['id']), None)
    if existing is None:
        events.append(entry)
    else:
        events[existing] = entry
    state['events'] = events[-60:]
