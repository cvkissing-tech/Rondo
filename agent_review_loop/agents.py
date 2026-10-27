"""Small role binding; ACP registry/runtime are supplied by pinned acpx, not reimplemented."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import queue
import threading
import sys
from datetime import datetime, timezone

from .store import StoreError

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AGENTS = {'planner': 'codex', 'executor': 'workbuddy', 'reviewer': 'codex'}


def codex_executable(configured=None):
    """Find an installed CLI even when Explorer does not inherit Codex's PATH."""
    explicit = configured or os.environ.get('ARL_CODEX_EXECUTABLE')
    if explicit:
        return str(Path(explicit).resolve()) if Path(explicit).is_file() else None
    command = shutil.which('codex')
    if command and Path(command).is_file():
        return command
    if sys.platform == 'win32':
        local = Path(os.environ.get('LOCALAPPDATA') or Path.home() / 'AppData/Local')
        roaming = Path(os.environ.get('APPDATA') or Path.home() / 'AppData/Roaming')
        try:
            bundled = local / 'OpenAI/Codex/bin'
            candidates = [*bundled.glob('*/codex.exe'), bundled / 'codex.exe', roaming / 'npm/codex.cmd']
            installed = [path for path in candidates if path.is_file()]
            if installed:
                return str(max(installed, key=lambda path: path.stat().st_mtime_ns).resolve())
        except OSError:
            pass
    return None


def normalize_agents(value=None):
    if value is None:
        return dict(DEFAULT_AGENTS)
    if not isinstance(value, dict) or set(value) != set(DEFAULT_AGENTS):
        raise StoreError('INVALID_ARGUMENT', 'Agent配置必须包含planner、executor、reviewer')
    for role, name in value.items():
        if not isinstance(name, str) or not (name == 'codex' or name == 'workbuddy' and role == 'executor'
                or re.fullmatch(r'acp:[a-z0-9][a-z0-9_-]{0,39}', name)):
            raise StoreError('INVALID_ARGUMENT', '该Agent不支持所选角色：' + role)
    return dict(value)


def task_agents(store, task_id):
    with store._connection() as db:
        row = db.execute('SELECT context_json FROM task_launches WHERE task_id=?', (task_id,)).fetchone()
    return normalize_agents(json.loads(row[0]).get('agents')) if row else dict(DEFAULT_AGENTS)


def node_executable():
    node = os.environ.get('ARL_NODE') or shutil.which('node')
    if not node or not Path(node).is_file():
        raise StoreError('NODE_NOT_FOUND', '请安装Node.js 22.13+，或设置ARL_NODE')
    return str(Path(node).resolve())


def catalog():
    buddy = Path(os.environ.get('ARL_WORKBUDDY_EXECUTABLE') or
                 Path(os.environ.get('LOCALAPPDATA', '')) / 'Programs/WorkBuddy/WorkBuddy.exe')
    items = [
        {'id': 'codex', 'name': 'Codex · 本机环境', 'roles': list(DEFAULT_AGENTS),
         'available': bool(codex_executable()), 'protocol': 'Codex App Server', 'auth': 'not_checked'},
        {'id': 'workbuddy', 'name': 'WorkBuddy · 本机桌面', 'roles': ['executor'],
         'available': os.name == 'nt' and buddy.is_file(), 'protocol': 'WorkBuddy 5.9.2 native (experimental)', 'auth': 'not_checked'},
    ]
    error = None
    try:
        result = subprocess.run([node_executable(), str(ROOT / 'integrations/acp/runtime.mjs'), '--list'],
                                capture_output=True, timeout=20, check=True,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        items.extend(json.loads(result.stdout)['agents'])
    except Exception as failure:
        error = 'ACP运行时不可用，请先在desktop执行npm ci；' + str(failure)[:300]
    return {'agents': items, 'error': error, 'note': '已安装不等于已登录；检测不会启动模型、下载或授权。'}


def require_agent(agent):
    info = next((item for item in catalog()['agents'] if item['id'] == agent), None)
    if not info or not info['available']:
        raise StoreError('AGENT_UNAVAILABLE', 'Agent尚未安装或适配器不可用：' + agent + '；请在Agent设置中检查依赖。')
    return info


def check_agent(agent):
    """Explicit handshake only. No session, prompt, automatic authentication or model call."""
    from .codex_rpc import CodexRpc
    from .processes import ProcessTree
    info = require_agent(agent)
    checked_at = datetime.now(timezone.utc).isoformat()
    try:
        with tempfile.TemporaryDirectory(prefix='rondo-agent-check-') as folder:
            cwd = Path(folder)
            if agent == 'codex':
                with CodexRpc([codex_executable(), 'app-server'], cwd, cwd / 'stderr.log') as rpc:
                    rpc.initialize()
                report = {'ok': True, 'message': 'Codex App Server 握手通过'}
            elif agent == 'workbuddy':
                from .execution import workbuddy_connection
                report = workbuddy_connection(cwd, False)
                report = {'ok': report['connected'], 'message': report.get('error') or 'WorkBuddy 本机通道可用'}
            else:
                argv = [node_executable(), str(ROOT / 'integrations/acp/runtime.mjs'), '--probe', agent[4:]]
                with ProcessTree(argv, cwd, cwd / 'stderr.log') as child:
                    messages = queue.Queue(maxsize=1)
                    def read():
                        try: messages.put(child.stdout.readline(65537))
                        except (OSError, ValueError): pass
                    reader = threading.Thread(target=read, daemon=True)
                    reader.start()
                    try:
                        line = messages.get(timeout=25)
                        if len(line) > 65536 or not line:
                            raise RuntimeError('ACP 程序未返回握手结果，请检查程序和启动参数')
                        report = json.loads(line)
                    except queue.Empty:
                        raise TimeoutError('握手超过 25 秒，请检查程序是否支持 ACP stdio')
                reader.join(timeout=2)
        return {'agent': agent, 'ok': bool(report.get('ok')), 'stage': 'protocol',
                'message': report.get('message', ''), 'details': report.get('details', []),
                'auth': 'not_checked', 'checked_at': checked_at}
    except Exception as failure:
        return {'agent': agent, 'ok': False, 'stage': 'protocol', 'message': str(failure)[:1200],
                'auth': 'not_checked', 'checked_at': checked_at}
