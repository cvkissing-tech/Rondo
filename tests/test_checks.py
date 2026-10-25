import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest

from agent_review_loop.checks import load_check_config, run_checks, validate_config
from agent_review_loop.snapshots import SnapshotError, bind_check_evidence, create_review_package, verify_package


class CheckTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='检查证据 ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        for args in (['init', '-q'], ['config', 'user.name', 'Fixture'],
                     ['config', 'user.email', 'fixture@example.invalid']):
            subprocess.run(['git', *args], cwd=self.repo, check=True, capture_output=True)
        (self.repo / 'code.py').write_bytes(b'print(1)\n')
        subprocess.run(['git', 'add', '.'], cwd=self.repo, check=True, capture_output=True)
        subprocess.run(['git', 'commit', '-qm', 'fixture'], cwd=self.repo, check=True, capture_output=True)
        self.package = self.root / 'package'
        self.original = create_review_package(self.repo, 'HEAD', {
            'task_id': 1, 'title': 'fixture', 'instructions': 'offline', 'acceptance': 'actual checks'}, self.package)
        self.output = self.root / 'check-output'

    def run_code(self, code, timeout=5, cancel_check=None):
        return run_checks(self.package, self.output, {
            'argv': [sys.executable, '-c', code], 'timeout_seconds': timeout}, cancel_check=cancel_check)

    def test_passed_evidence_binds_snapshot_and_detects_log_tampering(self):
        result = self.run_code('import code; print("真实检查",flush=True)')
        self.assertEqual(result['status'], 'passed')
        self.assertEqual(result['exit_code'], 0)
        self.assertTrue(result['process_tree_closed'])
        self.assertEqual(result['input_snapshot_id'], self.original['snapshot_id'])
        manifest = bind_check_evidence(self.package, self.output)
        self.assertNotEqual(manifest['snapshot_id'], self.original['snapshot_id'])
        self.assertEqual(verify_package(self.package)['checks']['status'], 'passed')
        (self.package / 'checks/stdout.log').write_bytes(b'forged')
        with self.assertRaises(SnapshotError):
            verify_package(self.package)

    def test_nonzero_and_stderr_are_real_evidence(self):
        result = self.run_code('import sys; print("failure",file=sys.stderr); sys.exit(7)')
        self.assertEqual((result['status'], result['exit_code']), ('failed', 7))
        self.assertIn(b'failure', (self.output / 'stderr.log').read_bytes())
        manifest = bind_check_evidence(self.package, self.output)
        self.assertEqual(manifest['checks']['status'], 'failed')

    def test_changed_copy_never_rewrites_user_repository(self):
        result = self.run_code('from pathlib import Path; Path("code.py").write_text("changed")')
        self.assertEqual(result['status'], 'changed')
        self.assertFalse(result['code_unchanged'])
        self.assertEqual((self.repo / 'code.py').read_bytes(), b'print(1)\n')
        self.assertEqual(verify_package(self.package)['snapshot_id'], self.original['snapshot_id'])

    def test_timeout_stops_actual_process_tree(self):
        result = self.run_code('import time; print("started",flush=True); time.sleep(30)', timeout=.2)
        self.assertEqual(result['status'], 'timed_out')
        self.assertTrue(result['process_tree_closed'])

    def test_deadline_cannot_be_bypassed_when_cancellation_lookup_is_slow(self):
        result = self.run_code('print(42)', timeout=.1, cancel_check=lambda: time.sleep(.15) or False)
        self.assertEqual(result['status'], 'timed_out')

    def test_cancel_waits_for_actual_started_check(self):
        cancel = threading.Event()
        result = {}
        worker = threading.Thread(target=lambda: result.update(self.run_code(
            'import time; print("started",flush=True); time.sleep(30)', cancel_check=cancel.is_set)))
        worker.start()
        try:
            deadline = time.monotonic() + 8
            while not (self.output / 'stdout.log').exists() or not (self.output / 'stdout.log').stat().st_size:
                if time.monotonic() > deadline:
                    self.fail('Check never started')
                time.sleep(.02)
            cancel.set()
        finally:
            cancel.set()
            worker.join(10)
        self.assertFalse(worker.is_alive())
        self.assertEqual(result['status'], 'cancelled')
        self.assertTrue(result['process_tree_closed'])

    def test_excess_output_is_bounded_and_not_passed(self):
        result = self.run_code('import sys; sys.stdout.buffer.write(b"x"*2097152); sys.stdout.flush()')
        self.assertEqual(result['status'], 'output_limit')
        self.assertLessEqual((self.output / 'stdout.log').stat().st_size, 1048576)

    def test_excess_stderr_is_also_bounded(self):
        result = self.run_code('import sys; sys.stderr.buffer.write(b"e"*2097152); sys.stderr.flush()')
        self.assertEqual(result['status'], 'output_limit')
        self.assertLessEqual((self.output / 'stderr.log').stat().st_size, 1048576)

    def test_invalid_config_and_missing_program(self):
        for config in ({'argv': ['python'], 'timeout_seconds': 5},
                       {'argv': [sys.executable], 'timeout_seconds': True},
                       {'argv': [sys.executable], 'timeout_seconds': 181}):
            with self.assertRaises(SnapshotError):
                validate_config(config)
        path = self.root / 'config.json'
        path.write_text(json.dumps({'argv': [str(self.root / 'missing.exe')], 'timeout_seconds': 5}))
        result = run_checks(self.package, self.output, load_check_config(path))
        self.assertEqual(result['status'], 'start_failed')
        self.assertIsNone(result['exit_code'])

    def test_wrong_input_binding_is_rejected_before_package_change(self):
        self.run_code('print(42)')
        path = self.output / 'result.json'
        result = json.loads(path.read_text(encoding='utf-8'))
        result['input_snapshot_id'] = '0' * 64
        path.write_text(json.dumps(result), encoding='utf-8')
        with self.assertRaises(SnapshotError):
            bind_check_evidence(self.package, self.output)
        self.assertEqual(verify_package(self.package)['snapshot_id'], self.original['snapshot_id'])


if __name__ == '__main__':
    unittest.main()
