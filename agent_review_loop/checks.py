"""Run an explicitly configured check against a disposable fixed-package copy."""

import json
import math
import os
from pathlib import Path
import shutil
import threading
import time

from .processes import ProcessTree
from .snapshots import SnapshotError, canonical, digest, read_json, verify_package


LOG_LIMIT = 1024 * 1024


def validate_config(config):
    if not isinstance(config, dict) or set(config) != {'argv', 'timeout_seconds'}:
        raise SnapshotError('INVALID_CHECK_CONFIG', 'Use argv and timeout_seconds only')
    argv, timeout = config['argv'], config['timeout_seconds']
    if (not isinstance(argv, list) or not 1 <= len(argv) <= 128
            or not all(isinstance(arg, str) and len(arg) <= 4096 and '\0' not in arg for arg in argv)
            or not Path(argv[0]).is_absolute()
            or type(timeout) not in (int, float) or not math.isfinite(timeout) or not 0 < timeout <= 180):
        raise SnapshotError('INVALID_CHECK_CONFIG', 'Use an absolute executable, argv list, and timeout in (0,180]')
    return json.loads(canonical(config))  # Freeze caller-owned lists; never execute a repository-provided command.


def load_check_config(path):
    path = Path(path)
    if not path.is_absolute() or path.stat().st_size > 65536:
        raise SnapshotError('INVALID_CHECK_CONFIG', 'Check configuration must be absolute and at most 64 KiB')
    return validate_config(read_json(path))


def run_checks(package_dir, output_dir, config, *, cancel_check=None):
    config = validate_config(config)
    package, output = Path(package_dir).resolve(), Path(output_dir).resolve()
    manifest = verify_package(package)
    if package == output or package in output.parents or output in package.parents:
        raise SnapshotError('INVALID_ARGUMENT', 'Check output must be separate from the fixed package')
    if manifest['checks']['status'] != 'not_run':
        raise SnapshotError('CHECKS_ALREADY_ATTACHED', 'Create a new package to run checks again')
    output.mkdir(parents=True, exist_ok=False)
    workspace = output / 'workspace'
    shutil.copytree(package, workspace)
    verify_package(workspace)
    temp = output / 'tmp'
    temp.mkdir()
    stdout_path, stderr_path = output / 'stdout.log', output / 'stderr.log'
    stdout_path.touch()
    stderr_path.touch()
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', PYTHONIOENCODING='utf-8',
               TMP=str(temp), TEMP=str(temp), TMPDIR=str(temp))
    result = {'format_version': 1, 'input_snapshot_id': manifest['snapshot_id'], 'config': config,
              'status': 'start_failed', 'exit_code': None, 'code_unchanged': True,
              'process_tree_closed': True}
    started = time.monotonic()
    exceeded, read_failed = threading.Event(), threading.Event()
    process, reader = None, None

    def drain():
        try:
            with stdout_path.open('wb') as log:
                saved = 0
                while True:
                    block = (getattr(process.stdout, 'read1', None) or process.stdout.read)(65536)
                    if not block:
                        return
                    remaining = LOG_LIMIT - saved
                    log.write(block[:remaining])
                    log.flush()
                    saved += min(remaining, len(block))
                    if len(block) > remaining:
                        exceeded.set()
        except (OSError, ValueError):
            read_failed.set()

    try:
        if cancel_check and cancel_check():
            result['status'] = 'cancelled'
        else:
            stderr_path.unlink()  # ProcessTree exclusively creates its own stderr file.
            process = ProcessTree(config['argv'], workspace / 'after', stderr_path, env=env)
            result['process_tree_closed'] = False
            process.stdin.close()
            reader = threading.Thread(target=drain, daemon=True)
            reader.start()
            while True:
                if cancel_check and cancel_check():
                    result['status'] = 'cancelled'
                    break
                if time.monotonic() - started >= config['timeout_seconds']:
                    result['status'] = 'timed_out'
                    break
                if exceeded.is_set() or stderr_path.stat().st_size > LOG_LIMIT:
                    result['status'] = 'output_limit'
                    break
                if read_failed.is_set():
                    result['status'] = 'io_failed'
                    break
                code = process.poll()
                if code is not None:
                    result.update(status='passed' if code == 0 else 'failed', exit_code=code)
                    break
                time.sleep(.02)
    except OSError as error:
        result['status'] = 'io_failed' if process is not None else 'start_failed'
        result['error_type'] = type(error).__name__
    finally:
        if process is not None:
            try:
                process.close()
                result['process_tree_closed'] = True
                result['exit_code'] = process.poll() if os.name != 'nt' else result['exit_code']
            except Exception as error:
                result.update(status='cleanup_failed', error_type=type(error).__name__)
            if reader is not None:
                reader.join(timeout=2)
                if reader.is_alive():
                    result.update(status='cleanup_failed', process_tree_closed=False)
        if not stderr_path.exists():
            stderr_path.touch()
    if result['status'] in ('passed', 'failed') and (exceeded.is_set() or stderr_path.stat().st_size > LOG_LIMIT):
        result['status'] = 'output_limit'
    if result['status'] == 'passed' and read_failed.is_set():
        result['status'] = 'io_failed'
    try:
        verify_package(workspace)
        verify_package(package)
    except SnapshotError:
        result['code_unchanged'] = False
        if result['status'] in ('passed', 'failed'):
            result['status'] = 'changed'
    result['logs'] = {}
    for name in ('stdout.log', 'stderr.log'):
        path = output / name
        truncated = path.stat().st_size > LOG_LIMIT or (name == 'stdout.log' and exceeded.is_set())
        with path.open('r+b') as file:
            file.truncate(min(path.stat().st_size, LOG_LIMIT))
        data = path.read_bytes()
        result['logs'][name] = {'sha256': digest(data), 'bytes': len(data), 'truncated': truncated}
    result['elapsed_seconds'] = round(time.monotonic() - started, 3)
    (output / 'result.json').write_bytes(canonical(result) + b'\n')
    return result
