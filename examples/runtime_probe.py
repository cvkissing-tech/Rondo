"""Model-free Windows ACP runtime experiment; evidence stays in the ignored directory."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from uuid import uuid4


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    install = root / '.agent-review-loop/acpx'
    package = json.loads((install / 'node_modules/acpx/package.json').read_text(encoding='utf-8'))
    if package['version'] != '0.21.0':
        raise RuntimeError('Install acpx@0.21.0 in .agent-review-loop/acpx first')
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node >=22.13 required')
    node_version = subprocess.check_output([node, '--version'], text=True).strip()
    if tuple(map(int, node_version.lstrip('v').split('.'))) < (22, 13, 0):
        raise RuntimeError('Node >=22.13 required')
    run = root / '.agent-review-loop/runtime-probes' / uuid4().hex
    workspace = run / '中文 workspace'
    home = run / 'home'
    state = run / 'state'
    for directory in (workspace, home, state, home / 'AppData/Roaming', home / 'AppData/Local'):
        directory.mkdir(parents=True, exist_ok=True)
    env = {key: value for key, value in os.environ.items()
           if key.upper() in {'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'TEMP', 'TMP'}}
    env.update(HOME=str(home), USERPROFILE=str(home),
               APPDATA=str(home / 'AppData/Roaming'), LOCALAPPDATA=str(home / 'AppData/Local'))
    agents = {f'mock_{role}': {'argv': [node, str(root / 'examples/fixtures/acp_mock.mjs'),
                                      str(install), str(state), role]}
              for role in ('executor', 'reviewer')}
    config = {'defaultAgent': 'mock_executor', 'defaultPermissions': 'deny-all',
              'nonInteractivePermissions': 'deny', 'authPolicy': 'skip',
              'ttl': 1, 'mcpServers': [], 'agents': agents}
    (workspace / '.acpxrc.json').write_text(json.dumps(config), encoding='utf-8')
    base = [node, str(install / 'node_modules/acpx/dist/cli.js'), '--cwd', str(workspace),
            '--format', 'json', '--deny-all', '--no-fs', '--no-terminal',
            '--timeout', '15', '--ttl', '1']
    options = dict(cwd=workspace, env=env, text=True, encoding='utf-8',
                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    commands: list[dict] = []
    cases: dict[str, bool] = {}

    def record(label: str, proc, stdout: str, stderr: str) -> list[dict]:
        (run / f'{label}.stdout.ndjson').write_text(stdout, encoding='utf-8')
        (run / f'{label}.stderr.txt').write_text(stderr, encoding='utf-8')
        commands.append({'label': label, 'returncode': proc.returncode})
        return [json.loads(line) for line in stdout.splitlines() if line.strip()]

    def call(label: str, role: str, args: list[str], payload: dict | None = None,
             success: bool = True) -> list[dict]:
        proc = subprocess.run(base + [f'mock_{role}', *args],
                              input=json.dumps(payload, ensure_ascii=False) if payload else None,
                              capture_output=True, timeout=25, **options)
        events = record(label, proc, proc.stdout, proc.stderr)
        if success and proc.returncode:
            raise RuntimeError(f'{label} failed ({proc.returncode}); see {run}')
        return events

    def prompt(label: str, role: str, payload: dict) -> list[dict]:
        return call(label, role, ['-s', 'probe', '--file', '-'], payload)

    def artifact(events: list[dict]) -> dict:
        # Filled from the runtime's real structured output, never terminal text guesses.
        chunks = [e['params']['update']['content']['text'] for e in events
                  if e.get('params', {}).get('update', {}).get('sessionUpdate') == 'agent_message_chunk']
        assert any(e.get('result', {}).get('stopReason') == 'end_turn' for e in events), events
        return json.loads(''.join(chunks))

    failure = None
    try:
        for role in ('executor', 'reviewer'):
            call(f'new-{role}', role, ['sessions', 'new', '--name', 'probe'])
        first = artifact(prompt('execute', 'executor', {'action': 'echo', 'text': '实现产物 & $() 中文'}))
        reviewed = artifact(prompt('review', 'reviewer', {'action': 'review', 'artifact': first}))
        assert first['cwd'] == str(workspace) and first['echo'] == '实现产物 & $() 中文'
        assert reviewed['reviewed_artifact'] == first and reviewed['role'] == 'reviewer'
        cases['automatic_handoff'] = True
        # Force owner expiry so the next request must reload provider session state.
        time.sleep(2)
        second = artifact(prompt('resume', 'executor', {'action': 'echo', 'text': '继续'}))
        assert first['session_id'] == second['session_id'] and second['turn'] == first['turn'] + 1
        cases['persistent_session'] = True
        with subprocess.Popen(base + ['mock_executor', '-s', 'probe', '--file', '-'],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              **options) as running:
            running.stdin.write(json.dumps({'action': 'sleep'}))
            running.stdin.close()
            running.stdin = None
            deadline = time.monotonic() + 12
            while time.monotonic() < deadline:
                audit = [json.loads(line) for line in (state / 'mock-events.ndjson').read_text(encoding='utf-8').splitlines()]
                if any(e['event'] == 'prompt_started' and e.get('action') == 'sleep' for e in audit):
                    break
                time.sleep(.1)
            else:
                running.kill()
                raise RuntimeError('Sleep did not start')
            call('cancel-request', 'executor', ['cancel', '-s', 'probe'])
            stdout, stderr = running.communicate(timeout=20)
            cancelled = record('cancelled-turn', running, stdout, stderr)
        assert any(e.get('result', {}).get('stopReason') == 'cancelled' for e in cancelled), cancelled
        after = artifact(prompt('after-cancel', 'executor', {'action': 'echo', 'text': '取消后继续'}))
        assert after['session_id'] == second['session_id'] and after['turn'] == second['turn'] + 1
        cases['cancel_and_continue'] = True
        crash = call('crash', 'executor', ['-s', 'probe', '--file', '-'], {'action': 'crash'}, success=False)
        assert commands[-1]['returncode'] != 0
        assert not any(e.get('result', {}).get('stopReason') == 'end_turn' for e in crash)
        cases['crash_is_failure'] = True
    except Exception as exc:
        failure = f'{type(exc).__name__}: {exc}'
    finally:
        time.sleep(2)  # Give the configured idle TTL a chance to release queue ownership.
        for role in ('executor', 'reviewer'):
            try:
                call(f'close-{role}', role, ['sessions', 'close', 'probe'])
            except Exception as exc:
                failure = failure or f'Cleanup failed: {exc}'
        summary = {'acpx': package['version'], 'node': node_version, 'model_calls': 0, 'cases': cases,
                   'commands': commands, 'failure': failure, 'evidence': str(run)}
        (run / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    if failure:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
