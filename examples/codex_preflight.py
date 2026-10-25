"""Real App Server metadata probe. No generation, login, account refresh or model request."""

import json
from pathlib import Path
import shutil
from uuid import uuid4

from agent_review_loop.codex_rpc import CodexRpc


def main():
    root = Path(__file__).resolve().parents[1]
    output = root / '.agent-review-loop/codex-preflight' / uuid4().hex
    output.mkdir(parents=True)
    binary = shutil.which('codex')
    if not binary or Path(binary).suffix.lower() != '.exe':
        raise SystemExit('Set up a native Codex executable before this Windows probe')
    summary = {'model_calls': 0, 'executable': binary, 'evidence': str(output), 'status': 'failed'}
    try:
        with CodexRpc([binary, 'app-server', '--stdio'], output, output / 'stderr.log') as client:
            initialized = client.initialize()
            summary['server'] = {k: initialized[k] for k in ('userAgent', 'platformFamily', 'platformOs') if k in initialized}
            account = client.request('account/read', {'refreshToken': False})
            summary['account_present'] = account.get('account') is not None
            summary['auth_type'] = (account.get('account') or {}).get('type')
            summary['requires_auth'] = account.get('requiresOpenaiAuth')
            config = client.request('config/read', {'includeLayers': False}).get('config', {})
            summary['instruction_characters'] = {
                key: len(value) for key, value in config.items()
                if isinstance(value, str) and 'instruction' in key
            }
            summary['configured_mcp_servers'] = len(config.get('mcp_servers') or {})
            models = client.request('model/list', {'limit': 20, 'includeHidden': False})
            summary['models'] = [{'id': item.get('id'), 'model': item.get('model'), 'default': item.get('isDefault')}
                                 for item in models.get('data', [])]
            summary['status'] = 'metadata_verified'
        summary['process_tree_closed'] = True
    except Exception as error:
        # Keep the full local diagnostic separately; the summary omits account identities.
        (output / 'error.txt').write_text(f'{type(error).__name__}: {error}', encoding='utf-8')
        summary.update(status='failed', error_type=type(error).__name__)
    (output / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if summary['status'] != 'metadata_verified':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
