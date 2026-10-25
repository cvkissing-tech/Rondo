"""Prepare local connector JSON and a backup. Does not change WorkBuddy configuration."""
import json
from pathlib import Path
import shutil
import sys
from uuid import uuid4


def main():
    root = Path(__file__).resolve().parents[1]
    original = Path.home() / '.workbuddy/mcp.json'
    data = json.loads(original.read_text(encoding='utf-8')) if original.exists() else {'mcpServers': {}}
    binary = shutil.which('codex')
    if not binary:
        raise SystemExit('Native Codex CLI not found')
    entry = {'type': 'stdio', 'command': sys.executable,
             'args': ['-X', 'utf8', '-m', 'agent_review_loop', 'serve', '--db',
                      str(root / '.agent-review-loop/workbuddy.sqlite3'), '--review-root',
                      str(root.parent / 'agent-review-loop-runs'), '--codex-executable', binary],
             'cwd': str(root), 'timeout': 30000}
    existing = data.setdefault('mcpServers', {}).get('agent-review-loop')
    if existing is not None and existing != entry:
        raise SystemExit('Existing agent-review-loop entry differs; inspect before replacing')
    output = root / '.agent-review-loop/workbuddy-connection' / uuid4().hex
    output.mkdir(parents=True)
    if original.exists():
        (output / 'mcp.before.json').write_bytes(original.read_bytes())
    data['mcpServers']['agent-review-loop'] = entry
    merged = output / 'mcp.merged.json'
    merged.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'config': str(merged), 'backup': str(output / 'mcp.before.json'),
                      'entry': 'agent-review-loop', 'installed': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()
