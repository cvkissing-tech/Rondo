"""Offline native execution -> real task submission -> fixed-package review."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from agent_review_loop.execution import ExecutionJobs
from agent_review_loop.review_jobs import ReviewJobs
from agent_review_loop.reviews import save_review
from agent_review_loop.snapshots import current_tree, verify_package
from agent_review_loop.store import StoreError, TaskStore
from agent_review_loop.task_launch import TaskLauncher


class ExecutionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='Rondo execution ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        repo = self.root / 'repo'
        repo.mkdir()
        for args in (['init', '-q'], ['config', 'user.name', 'Fixture'], ['config', 'user.email', 'fixture@example.invalid']):
            subprocess.run(['git', *args], cwd=repo, capture_output=True, check=True)
        (repo / 'code.py').write_text('print(1)\n')
        subprocess.run(['git', 'add', '.'], cwd=repo, capture_output=True, check=True)
        subprocess.run(['git', 'commit', '-qm', 'baseline'], cwd=repo, capture_output=True, check=True)
        self.store = TaskStore(self.root / 'tasks.db')
        self.tasks = TaskLauncher(self.store, self.root / 'tasks')
        self.context = self.tasks.start(str(repo), 'Fixture', 'Change output to 2', 'Output is 2', 'task')
        self.task_id = self.context['task_id']
        self.workspace = Path(self.context['workspace'])
        self.tree = current_tree(self.workspace)
        self.calls = self.review_calls = 0
        self.mode = 'complete'
        self.started = threading.Event()
        self.release = threading.Event()
        plan_id = '1' * 32
        with self.store._connection(write=True) as db:
            db.execute('''INSERT INTO plan_jobs(id,task_id,request_id,fingerprint,state,repo,base_ref,directory,backend,created_at,updated_at)
                       VALUES(?,?,?,?,'succeeded',?,?,?,?,?,?)''',
                       (plan_id, self.task_id, 'fixture', 'fixture', str(self.workspace), self.context['base_commit'], str(self.root), 'fixture', 1, 1))
        self.plans = SimpleNamespace(read_plan=lambda _: {
            'plan_id': 'offline-plan', 'freshness': 'current' if current_tree(self.workspace) == self.tree else 'stale',
            'plan': {'summary': 'Offline fixture plan', 'steps': []}})

        def review(package, output, executable, *, cancel_check):
            self.review_calls += 1
            manifest = verify_package(package)
            receipt = save_review(package, {'snapshot_id': manifest['snapshot_id'], 'verdict': 'approved',
                                           'summary': 'Offline fixture review, no model', 'findings': []})
            return {'status': 'review_saved', 'process_tree_closed': True, **receipt}

        self.reviews = ReviewJobs(self.store, self.root / 'runs', runner=review, executable=sys.executable, backend='fixture')
        self.execution = ExecutionJobs(self.store, self.tasks, self.plans, self.reviews,
                                       runner=self.native, executable=sys.executable)
        self.addCleanup(self.reviews.close)
        self.addCleanup(self.execution.close)

    def native(self, payload, directory, executable, *, cancel_check, on_event):
        self.calls += 1
        self.started.set()
        on_event({'event': 'session_created'})
        on_event({'event': 'dispatched'})
        if self.mode == 'wait':
            while not self.release.wait(.01):
                if cancel_check():
                    return {'event': 'cancelled'}
        if self.mode == 'unknown':
            raise StoreError('DISPATCH_UNKNOWN', 'No confirmed dispatch receipt')
        if self.mode == 'missing':
            return {'event': 'turn_ended'}
        owner = re.search(r'owner 必须是 ([a-z0-9-]+)', payload['prompt'])[1]
        if self.mode == 'wrong':
            owner = 'another-worker'
        claim = self.store.claim_task(self.task_id, owner, self.store.get_task(self.task_id)['version'])
        (self.workspace / 'code.py').write_text('print(2)\n')
        self.store.submit_result(self.task_id, claim['attempt_id'], claim['claim_token'], claim['version'],
                                 'Offline worker changed code.py; not a WorkBuddy live run', 'submit')
        return {'event': 'turn_ended'}

    def wait(self, job, expected):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            state = self.execution.status(job['job_id'])
            if state['status'] == expected:
                return state
            time.sleep(.02)
        self.fail(str(state))

    def test_native_progress_reaches_existing_status_projection(self):
        def runner(payload, directory, executable, *, cancel_check, on_event):
            directory.mkdir(parents=True, exist_ok=True)
            on_event({'event': 'progress', 'update': {'sessionUpdate': 'agent_message_chunk', 'text': 'Writing fixture code'}})
            return self.native(payload, directory, executable, cancel_check=cancel_check, on_event=on_event)
        self.execution.runner = runner
        job = self.execution.start_execution(self.task_id, 'progress')
        state = self.wait(job, 'succeeded')
        self.assertEqual(state['events'][0]['text'], 'Writing fixture code')
        self.assertEqual(state['environment'], 'workbuddy')

    def test_native_projection_failure_does_not_stop_execution(self):
        def runner(payload, directory, executable, *, cancel_check, on_event):
            on_event({'event': 'progress', 'update': {'sessionUpdate': 'agent_message_chunk', 'text': 'Writing fixture code'}})
            return self.native(payload, directory, executable, cancel_check=cancel_check, on_event=on_event)
        self.execution.runner = runner
        with patch('agent_review_loop.execution.write_state', side_effect=OSError('cache busy')):
            job = self.execution.start_execution(self.task_id, 'cache-failure')
            self.wait(job, 'succeeded')

    def test_receipt_submission_and_automatic_fixed_review(self):
        job = self.execution.start_execution(self.task_id, 'once')
        state = self.wait(job, 'succeeded')
        deadline = time.monotonic() + 10
        while not state['review_job_id'] and time.monotonic() < deadline:
            time.sleep(.02)
            state = self.execution.status(job['job_id'])
        self.assertIsNotNone(state['review_job_id'], state)
        while time.monotonic() < deadline and self.reviews.status(state['review_job_id'])['status'] != 'succeeded':
            time.sleep(.02)
        self.assertEqual(self.reviews.read_review(state['review_job_id'])['freshness'], 'current')
        self.assertEqual(self.tasks.context(self.task_id)['latest_execution_job_id'], job['job_id'])
        self.assertEqual(self.execution.start_execution(self.task_id, 'once')['job_id'], job['job_id'])
        self.assertEqual((self.calls, self.review_calls), (1, 1))
        with self.assertRaises(StoreError) as caught:
            self.execution.start_execution(self.task_id, 'new')
        self.assertEqual(caught.exception.code, 'EXECUTION_EXISTS')

    def test_stale_plan_cannot_dispatch(self):
        (self.workspace / 'code.py').write_text('changed\n')
        with self.assertRaises(StoreError) as caught:
            self.execution.start_execution(self.task_id, 'once')
        self.assertEqual(caught.exception.code, 'PLAN_STALE')
        self.assertEqual(self.calls, 0)

    def test_native_end_without_matching_submission_is_not_success(self):
        self.mode = 'missing'
        job = self.execution.start_execution(self.task_id, 'once')
        state = self.wait(job, 'failed')
        self.assertEqual(state['error_code'], 'EXECUTION_REPORT_MISSING')
        self.assertEqual(self.review_calls, 0)

    def test_submission_from_another_worker_is_not_accepted(self):
        self.mode = 'wrong'
        job = self.execution.start_execution(self.task_id, 'once')
        state = self.wait(job, 'failed')
        self.assertEqual(state['error_code'], 'EXECUTION_REPORT_MISSING')
        self.assertEqual(self.review_calls, 0)

    def test_unknown_dispatch_is_durable_and_never_replayed(self):
        self.mode = 'unknown'
        job = self.execution.start_execution(self.task_id, 'once')
        state = self.wait(job, 'failed')
        self.assertEqual(state['phase'], 'dispatch_unknown')
        self.assertIsNotNone(state['session_id'])
        self.execution.start_execution(self.task_id, 'once')
        self.assertEqual(self.calls, 1)
        self.assertEqual(self.review_calls, 0)

    def test_cancel_waits_for_the_owned_native_turn(self):
        self.mode = 'wait'
        job = self.execution.start_execution(self.task_id, 'once')
        self.assertTrue(self.started.wait(5))
        self.execution.cancel(job['job_id'])
        self.wait(job, 'cancelled')
        self.assertEqual(self.review_calls, 0)

    def test_schema_four_upgrade_preserves_task_and_adds_execution(self):
        with self.store._connection(write=True) as db:
            db.execute('DROP TABLE execution_jobs')
            db.execute('PRAGMA user_version=4')
        migrated = TaskStore(self.store.path)
        self.assertEqual(migrated.get_task(self.task_id)['title'], 'Fixture')
        with migrated._connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM execution_jobs').fetchone()[0], 0)


if __name__ == '__main__':
    unittest.main()
