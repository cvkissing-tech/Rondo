"""Project public WorkBuddy messages/tools into the existing native event view; never reasoning or claim tokens."""
import json
from pathlib import Path
import re


def public_text(value, limit=6000):
    text = str(value)
    text = re.sub(r'(?i)(["\']?(?:claim_token|api_key|access_token|refresh_token)["\']?\s*[:=]\s*)(["\']?)[^\s,}\n"\']+\2', r'\1"[redacted]"', text)
    return text[-limit:]


def project_update(state, update):
    kind = update.get('sessionUpdate')
    events = state.setdefault('events', [])
    text = public_text(update.get('text') or '')
    if kind == 'agent_message_chunk':
        if not text: return False
        if events and events[-1]['kind'] == 'agentMessage' and events[-1]['status'] == 'running':
            events[-1]['text'] = public_text(events[-1]['text'] + text)
        else:
            events.append({'id': 'message-' + str(state.get('sequence', 0)), 'kind': 'agentMessage',
                           'status': 'running', 'text': text, 'output': ''})
    elif kind in ('tool_call', 'tool_call_update'):
        for entry in events:
            if entry['kind'] == 'agentMessage': entry['status'] = 'completed'
        identity = str(update.get('toolCallId') or 'tool-' + str(state.get('sequence', 0)))
        existing = next((entry for entry in events if entry['id'] == identity), None)
        entry = existing or {'id': identity, 'kind': 'commandExecution', 'text': 'WorkBuddy 工具', 'output': '', 'status': 'running'}
        if update.get('title'): entry['text'] = public_text(update['title'])
        if update.get('status'): entry['status'] = str(update['status'])[:40]
        if text: entry['output'] = public_text(text, 8000)
        if existing is None: events.append(entry)
    else:
        return False
    state['sequence'] = state.get('sequence', 0) + 1
    state['events'] = events[-60:]
    return True


def recorded_history(path, session_id, workspace):
    """Explicit recovery from a verified local native history, not an Agent dispatch."""
    path = Path(path)
    if path.stat().st_size > 16 * 1024 * 1024: raise ValueError('History exceeds recovery limit')
    state = {'environment': 'workbuddy', 'session_id': session_id, 'persistent': True, 'events': [], 'recovered_history': True}
    for line in path.read_text(encoding='utf-8').splitlines():
        row = json.loads(line)
        if row.get('sessionId') != session_id or not row.get('cwd') or Path(row['cwd']).resolve() != Path(workspace).resolve(): continue
        kind = row.get('type')
        if kind == 'message' and row.get('role') == 'assistant':
            text = '\n'.join(item.get('text', '') for item in row.get('content', []) if item.get('type') == 'output_text')
            # A persisted message is complete; avoid merging distinct messages.
            for entry in state['events']:
                if entry['kind'] == 'agentMessage': entry['status'] = 'completed'
            project_update(state, {'sessionUpdate': 'agent_message_chunk', 'text': text})
            if row.get('providerData', {}).get('model'): state['model'] = row['providerData']['model']
        elif kind in ('function_call', 'function_call_result'):
            project_update(state, {'sessionUpdate': 'tool_call' if kind == 'function_call' else 'tool_call_update',
                                  'toolCallId': row.get('callId'), 'title': row.get('name'), 'status': row.get('status') or 'running'})
    for entry in state['events']:
        if entry['kind'] == 'agentMessage' and entry['status'] == 'running': entry['status'] = 'recorded'
    return state
