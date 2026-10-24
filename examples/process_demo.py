"""Observe three process outcomes without accounts, network or model calls."""

import sys
import tempfile
from pathlib import Path

from agent_review_loop.runner import run_process


def main():
    print("Offline demonstration: no AI models or accounts are used.")
    scenarios = [
        ("success", "import sys; print(sys.stdin.read())", 10),
        ("failure", "import sys; print('intentional error', file=sys.stderr); sys.exit(7)", 10),
        ("timeout", "import time; print('started', flush=True); time.sleep(60)", 1),
    ]
    with tempfile.TemporaryDirectory(prefix="agent-review-demo ") as folder:
        workspace = Path(folder)
        for name, script, timeout in scenarios:
            result = run_process(
                [sys.executable, "-X", "utf8", "-c", script],
                workspace,
                "Task received: inspect the changes.",
                workspace / name,
                timeout,
            )
            print(f"\n{name}: status={result.status}, exit_code={result.exit_code}")
            for label, path in (("stdout", result.stdout_path), ("stderr", result.stderr_path)):
                content = path.read_text(encoding="utf-8").strip()
                print(f"  {label}: {content or '(empty)'}")
    print("\nTemporary demonstration files have been cleaned up.")


if __name__ == "__main__":
    main()
