"""Exactly one bounded real review of the already-created synthetic package."""
import json
import argparse
from pathlib import Path
import shutil
from uuid import uuid4

from agent_review_loop.codex_review import run_codex_review


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description='Start ONE real model review; consumes the configured Codex quota')
    parser.add_argument('--package', required=True, type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    package = args.package.resolve()
    output = args.output or root / '.agent-review-loop/codex-reviews' / uuid4().hex
    binary = shutil.which('codex')
    if binary is None:
        raise SystemExit('Native Codex executable not found')
    result = run_codex_review(package, output, Path(binary), timeout=180)
    print(json.dumps({**result, 'evidence': str(output)}, ensure_ascii=False, indent=2))
    if result['status'] != 'review_saved':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
