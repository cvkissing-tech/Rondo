"""JSONL adapter around acpx's official runtime; no shell or model retries."""
from contextlib import suppress
import json
from pathlib import Path
import queue
import sqlite3
import threading
import time

from .agents import ROOT
from .codex_rpc import ReviewCancelled
from .native_session import interactive_request, project_event, write_state
from .processes import ProcessTree
from .snapshots import canonical


def structured_result(text, schema):
    decoder = json.JSONDecoder()
    for index in reversed([i for i, char in enumerate(text) if char == '{']):
        try:
            value, end = decoder.raw_decode(text[index:])
            if (isinstance(value, dict) and set(value) == set(schema['properties'])
                    and not text[index+end:].strip().strip('`').strip()):
                return value
        except ValueError:
            pass
    raise ValueError('Agent没有返回符合约定的JSON；原始输出已保存，不自动重试')


def run_acp_json(prompt, schema, cwd, output, executable, *, agent, timeout=180, cancel_check=None,
                 instructions='', session_name='Rondo'):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    (output / 'request.txt').write_text(prompt, encoding='utf-8')
    state = {'environment': 'acp', 'persistent': True, 'agent': agent, 'events': []}
    record = {'status': 'failed', 'turns_started': 0, 'agent': agent, 'environment': 'acp',
              'persistent': True, 'process_tree_closed': False, 'usage': None, 'cost': None}
    messages = queue.Queue(maxsize=256)
    text = ''
    def publish():
        try: write_state(output, state)
        except (OSError, sqlite3.Error) as error: record['projection_error'] = str(error)[:1000]
    def fail(error):
        record.update(status='cancelled' if isinstance(error, ReviewCancelled) else 'failed',
                      error_type=type(error).__name__, error=str(error)[:2000])
    started = time.monotonic()
    try:
        with ProcessTree([str(executable), str(ROOT / 'integrations/acp/runtime.mjs')], cwd, output / 'stderr.log') as child:
            def read():
                try:
                    for line in iter(lambda: child.stdout.readline(2 * 1024 * 1024 + 1), b''):
                        if len(line) > 2 * 1024 * 1024: raise ValueError('ACP event exceeds 2MiB')
                        messages.put(json.loads(line), timeout=2)
                    messages.put(None, timeout=2)
                except Exception as error:
                    with suppress(queue.Full): messages.put({'event':'error','error':str(error)}, timeout=.1)
            reader = threading.Thread(target=read, daemon=True); reader.start()
            payload = {'agent':agent, 'cwd':str(cwd), 'output':str(output), 'timeout':timeout,
                       'session_key':output.parent.name, 'writable':set(schema['properties']) == {'summary'},
                       'prompt':instructions + '\n' + prompt + '\nReturn ONLY a JSON object matching this schema:\n' + canonical(schema).decode()}
            child.stdin.write(canonical(payload) + b'\n'); child.stdin.flush()
            try:
                with (output / 'events.ndjson').open('xb') as events:
                    while True:
                        if cancel_check and cancel_check(): raise ReviewCancelled('Agent已取消')
                        if time.monotonic()-started > timeout: raise TimeoutError('Agent回合超时；未自动重试')
                        try: event=messages.get(timeout=.1)
                        except queue.Empty: continue
                        if event is None: raise RuntimeError('ACP连接关闭但没有返回完成结果')
                        events.write(canonical(event)+b'\n')
                        kind=event['event']
                        if kind == 'error': raise RuntimeError(event.get('error','ACP失败'))
                        if kind == 'session_created':
                            record['session_id']=event['session_id']; state.update(record); state['status']='running'; publish()
                        elif kind == 'dispatched': record['turns_started']=1
                        elif kind == 'permission':
                            decision=interactive_request(output,state,{'method':'acp/permission','params':event['params']},cancel_check)
                            child.stdin.write(canonical({'command':'answer','id':event['id'],'answer':decision})+b'\n');child.stdin.flush()
                        elif kind == 'update':
                            update=event['update']
                            if update['type']=='text_delta' and update.get('stream') != 'thought':
                                text+=update.get('text','')
                                if len(text)>256*1024: raise ValueError('Agent output exceeds 256KiB')
                            elif update['type']=='tool_call':
                                item={'id':update.get('toolCallId'), 'type':'commandExecution', 'command':update.get('title') or update.get('text'),
                                      'status':update.get('status'), 'aggregatedOutput':str(update.get('rawOutput') or '')}
                                project_event(state,{'method':'item/completed','params':{'item':item}});publish()
                        elif kind == 'result':
                            record.update(usage=event.get('usage'), model=event.get('model'), agent_session_id=event.get('agent_session_id'))
                            (output/'response.txt').write_text(text,encoding='utf-8')
                            if event['status'] != 'completed': raise RuntimeError('ACP回合未完成：'+event['status']+' '+json.dumps(event.get('error'),ensure_ascii=False))
                            record.update(status='completed',data=structured_result(text,schema));break
            except Exception as error:
                fail(error)
                with suppress(OSError): child.stdin.write(b'{"command":"cancel"}\n');child.stdin.flush()
        reader.join(2)
        if reader.is_alive(): raise RuntimeError('ACP reader did not exit')
        record['process_tree_closed']=True
    except Exception as error: fail(error)
    state.update({k:v for k,v in record.items() if k != 'data'});state.pop('pending',None);publish()
    (output/'result.json').write_text(json.dumps({k:v for k,v in record.items() if k!='data'},ensure_ascii=False,indent=2),encoding='utf-8')
    return record
