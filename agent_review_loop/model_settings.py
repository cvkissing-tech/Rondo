"""Rondo-only native model choices; Agent credentials and global config stay native."""
import json
import os
from pathlib import Path
import tempfile
import subprocess
import re

from .store import StoreError


def model_selection(agent):
    path = Path(os.environ.get('RONDO_AGENTS_CONFIG') or Path.home() / '.rondo/agents.json')
    data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    choice = data.get('native_models', {}).get(agent, {})
    if (not isinstance(choice, dict) or set(choice) - {'model', 'effort'}
            or not isinstance(choice.get('model', ''), str) or len(choice.get('model', '')) > 200
            or any(c in choice.get('model', '') for c in '\0\r\n')
            or (choice.get('effort') is not None and (not isinstance(choice['effort'], str)
                or not 0 < len(choice['effort']) <= 80 or any(c in choice['effort'] for c in '\0\r\n')))):
        raise StoreError('INVALID_MODEL_CONFIG', 'Rondo 模型配置无效，请在 Agent 设置中重新保存')
    return dict(choice)


def codex_models(client):
    result = client.request('model/list', {'includeHidden': False, 'limit': 100})
    return [{'id': m['model'], 'name': m.get('displayName') or m['model'],
             'efforts': [e['reasoningEffort'] for e in m.get('supportedReasoningEfforts', [])],
             'default_effort': m.get('defaultReasoningEffort')}
            for m in result.get('data', []) if isinstance(m.get('model'), str)]


def validate_choice(models, choice):
    if not choice.get('model'):
        return
    selected = next((m for m in models if m['id'] == choice['model']), None)
    if selected is None or (choice.get('effort') and choice['effort'] not in selected.get('efforts', [])):
        raise StoreError('MODEL_UNAVAILABLE', '所选模型或思考强度当前不可用，请在 Agent 设置中重新选择；未调用模型')


def list_agent_models(agent):
    if agent == 'workbuddy':
        from .execution import workbuddy_connection, ROOT
        result = workbuddy_connection(ROOT / '.agent-review-loop')
        if not result.get('connected'):
            raise StoreError('WORKBUDDY_NOT_CONNECTED', result.get('error', '请先连接 WorkBuddy'))
        return {'agent': agent, 'models': result['models']}
    if re.fullmatch(r'acp:[a-z0-9][a-z0-9_-]{0,39}', agent):
        from .agents import node_executable, ROOT
        with tempfile.TemporaryDirectory(prefix='rondo-models-') as folder:
            result = subprocess.run([node_executable(), str(ROOT / 'integrations/acp/runtime.mjs'), '--models', agent[4:]],
                cwd=folder, capture_output=True, timeout=30,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        if result.returncode:
            raise StoreError('MODEL_QUERY_FAILED', '无法读取 Agent 模型；请检查安装和登录状态。不自动登录、下载或发起生成。')
        return json.loads(result.stdout)
    if agent != 'codex':
        raise StoreError('INVALID_ARGUMENT', '此入口支持 Codex 和 WorkBuddy；ACP 模型由各 Agent 管理')
    from .agents import codex_executable
    from .codex_rpc import CodexRpc
    executable = codex_executable()
    if not executable:
        raise StoreError('CODEX_NOT_FOUND', '未找到本机 Codex 程序')
    with tempfile.TemporaryDirectory(prefix='rondo-models-') as folder:
        with CodexRpc([executable, 'app-server'], Path(folder), Path(folder) / 'stderr.log') as client:
            client.initialize()
            config = client.request('config/read', {'includeLayers': False}).get('config', {})
            return {'agent': agent, 'models': codex_models(client), 'default_model': config.get('model'),
                    'default_effort': config.get('model_reasoning_effort')}
