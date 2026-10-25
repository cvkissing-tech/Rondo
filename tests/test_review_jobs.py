import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from agent_review_loop.review_jobs import ReviewJobs
from agent_review_loop.reviews import save_review
from agent_review_loop.snapshots import canonical, verify_package
from agent_review_loop.store import StoreError, TaskStore


class ReviewJobTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='后台审查 ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        for args in (['init', '-q'], ['config', 'user.name', 'Fixture'],
                     ['config', 'user.email', 'fixture@example.invalid'], ['config', 'core.autocrlf', 'false']):
            subprocess.run(['git', *args], cwd=self.repo, check=True, capture_output=True)
        (self.repo / 'code.py').write_bytes(b'print(1)\n')
        subprocess.run(['git', 'add', '.'], cwd=self.repo, check=True, capture_output=True)
        subprocess.run(['git', 'commit', '-qm', 'baseline'], cwd=self.repo, check=True, capture_output=True)
        self.store = TaskStore(self.root / 'tasks.db')
        self.task = self.store.create_task('fixture', 'synthetic review', 'fixed version')['task_id']
        self.started, self.release = threading.Event(), threading.Event()
        self.calls = 0

        def backend(package, output, executable, *, cancel_check, **unused):
            self.calls += 1
            self.started.set()
            while not self.release.wait(.02):
                if cancel_check():
                    return {'status': 'cancelled', 'process_tree_closed': True}
            manifest = verify_package(package)
            output.mkdir()
            receipt = save_review(package, {'snapshot_id': manifest['snapshot_id'], 'verdict': 'approved',
                                           'summary': 'Synthetic fixture, not model review', 'findings': []})
            return {'status': 'review_saved', 'process_tree_closed': True, 'usage': None, 'cost': None, **receipt}

        self.first = ReviewJobs(self.store, self.root / 'runs', runner=backend, executable=Path(sys.executable), backend='fixture')
        self.second = ReviewJobs(TaskStore(self.store.path), self.root / 'runs', runner=backend, executable=Path(sys.executable), backend='fixture')
        self.addCleanup(self.first.close)
        self.addCleanup(self.second.close)

    def start(self, request='one', task=None):
        return self.first.start_review(task or self.task, str(self.repo), 'HEAD', request)

    def wait(self, job_id, expected):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            result = self.second.status(job_id)
            if result['status'] == expected:
                return result
            if result['status'] in ('failed', 'interrupted'):
                self.fail(str(result))
            time.sleep(.03)
        self.fail(f'Never reached {expected}: {result}')

    def assert_code(self, code, operation):
        with self.assertRaises(StoreError) as caught:
            operation()
        self.assertEqual(caught.exception.code, code)

    def test_fast_idempotent_start_and_cross_manager_busy(self):
        started = time.monotonic()
        first = self.start()
        self.assertLess(time.monotonic() - started, 1)
        repeated = self.second.start_review(self.task, str(self.repo), 'HEAD', 'one')
        self.assertEqual(first['job_id'], repeated['job_id'])
        self.assert_code('IDEMPOTENCY_CONFLICT', lambda: self.second.start_review(self.task, str(self.repo), 'different', 'one'))
        self.assert_code('REVIEW_BUSY', lambda: self.start('second'))
        self.assertTrue(self.started.wait(10))
        self.release.set()
        self.wait(first['job_id'], 'succeeded')
        result = self.second.read_review(first['job_id'])
        self.assertTrue(result['review_approved'])
        self.assertEqual(result['backend'], 'fixture')
        self.assertEqual(self.calls, 1)

    def test_cross_manager_cancel_and_repeat_are_persistent(self):
        job = self.start()
        self.assertTrue(self.started.wait(10))
        self.assertEqual(self.second.cancel(job['job_id'])['status'], 'cancelling')
        self.wait(job['job_id'], 'cancelled')
        self.assertEqual(self.first.cancel(job['job_id'])['status'], 'cancelled')
        self.assertEqual(self.start()['job_id'], job['job_id'])
        self.assertEqual(self.calls, 1)

    def test_budget_and_freshness(self):
        self.release.set()
        one = self.start()
        self.wait(one['job_id'], 'succeeded')
        (self.repo / 'new.txt').write_bytes(b'new\n')
        self.assertEqual(self.second.read_review(one['job_id'])['freshness'], 'stale')
        two = self.start('two')
        self.wait(two['job_id'], 'succeeded')
        self.assert_code('REVIEW_BUDGET_EXHAUSTED', lambda: self.start('three'))

    def test_service_close_requests_actual_stop(self):
        job = self.start()
        self.assertTrue(self.started.wait(10))
        self.first.close()
        self.assertEqual(self.second.status(job['job_id'])['status'], 'cancelled')
        self.assertEqual(self.calls, 1)

    def test_owner_lock_failure_cannot_launch_a_worker(self):
        with patch('agent_review_loop.review_jobs._OwnerLock.acquire', return_value=None):
            self.assert_code('REVIEW_OWNER_LOCK', self.start)
        self.assertEqual(self.calls, 0)


if __name__ == '__main__':
    unittest.main()
