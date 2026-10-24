"""Execute a local process and retain its output, without invoking a shell."""

import json
import math
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


@dataclass(frozen=True)
class RunResult:
    status: Literal["completed", "failed", "timed_out"]
    exit_code: int | None
    stdout_path: Path
    stderr_path: Path


def run_process(
    argv: list[str],
    cwd: Path,
    prompt: str,
    output_dir: Path,
    timeout_seconds: float,
) -> RunResult:
    """Record process completion, failure or timeout in a new output directory.

    Completion only means exit code zero; agent and task success need their
    own checks. Output is streamed to files rather than accumulated in memory.
    """
    if not isinstance(argv, list) or not argv or not all(isinstance(arg, str) for arg in argv):
        raise ValueError("argv must be a nonempty list of strings")
    if not argv[0] or not isinstance(prompt, str):
        raise ValueError("the executable must be nonempty and prompt must be text")
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be finite and positive")
    cwd = Path(cwd).resolve()
    if not cwd.is_dir():
        raise NotADirectoryError(cwd)
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=False)
    stdout_path = output_dir / "stdout.log"
    stderr_path = output_dir / "stderr.log"
    status = "failed"
    exit_code = None

    with stdout_path.open("wb") as stdout, stderr_path.open("wb") as stderr:
        try:
            process = subprocess.Popen(
                argv,
                cwd=cwd,
                stdin=subprocess.PIPE,
                stdout=stdout,
                stderr=stderr,
                shell=False,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
        except OSError as error:
            stderr.write(f"{type(error).__name__}: {error}\n".encode("utf-8"))
        else:
            try:
                process.communicate(input=prompt.encode("utf-8"), timeout=timeout_seconds)
                status = "completed" if process.returncode == 0 else "failed"
            except subprocess.TimeoutExpired:
                # ponytail: direct child only; verify process-tree cleanup before real agents.
                process.kill()
                process.communicate()
                status = "timed_out"
            except BaseException:
                if process.poll() is None:
                    process.kill()
                process.wait()
                raise
            exit_code = process.returncode

    result = RunResult(status, exit_code, stdout_path, stderr_path)
    record = {
        "status": result.status,
        "exit_code": result.exit_code,
        "stdout_path": str(result.stdout_path),
        "stderr_path": str(result.stderr_path),
    }
    (output_dir / "result.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return result
