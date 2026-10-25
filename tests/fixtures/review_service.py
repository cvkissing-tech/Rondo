"""Test-only MCP entry point. This backend NEVER calls Codex or any model."""
import argparse
import json
import os
from pathlib import Path
import time

from agent_review_loop.review_jobs import ReviewJobs
from agent_review_loop.reviews import save_review
from agent_review_loop.server import create_server
from agent_review_loop.snapshots import canonical, verify_package
from agent_review_loop.store import TaskStore
from agent_review_loop.checks import load_check_config


parser = argparse.ArgumentParser()
parser.add_argument('--db', required=True, type=Path)
parser.add_argument('--root', required=True, type=Path)
parser.add_argument('--control', required=True, type=Path)
parser.add_argument('--check-config', type=Path)
args = parser.parse_args()
args.control.mkdir(parents=True, exist_ok=True)


def fixture(package, output, executable, *, cancel_check):
    manifest = verify_package(package)
    output.mkdir()
    (output / 'started').touch()
    with (args.control / 'calls.ndjson').open('ab') as file:
        file.write(canonical({'snapshot_id': manifest['snapshot_id'], 'pid': os.getpid()}) + b'\n')
    mode = manifest['task']['instructions']
    if mode == 'wait':
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if (args.control / 'crash').exists():
                os._exit(23)  # Deliberately abandon DB state and release owner lock.
            if cancel_check():
                result = {'status': 'cancelled', 'process_tree_closed': True, 'turns_started': 0}
                (output / 'result.json').write_bytes(canonical(result))
                return result
            time.sleep(.02)
        raise TimeoutError('Fixture safety deadline')
    if mode == 'fail':
        return {'status': 'failed', 'process_tree_closed': True, 'turns_started': 0}
    findings = []
    if mode == 'findings':
        findings = [{'id': f'F{i}', 'path': 'code.py', 'side': 'after', 'line': 1, 'priority': 2,
                     'trigger': 'Synthetic fixture', 'impact': 'Not a real defect',
                     'evidence': 'Pagination protocol fixture only', 'evidence_kind': 'not_run'} for i in range(12)]
    receipt = save_review(package, {'snapshot_id': manifest['snapshot_id'], 'verdict': 'changes_requested' if findings else 'approved',
                                   'summary': 'Synthetic fixture, not model review', 'findings': findings})
    result = {'status': 'review_saved', 'process_tree_closed': True, 'turns_started': 0, **receipt}
    (output / 'result.json').write_bytes(canonical(result))
    return result


import sys
store = TaskStore(args.db)
create_server(store, ReviewJobs(store, args.root, runner=fixture, executable=Path(sys.executable), backend='fixture',
                               check_config=load_check_config(args.check_config) if args.check_config else None)).run()
