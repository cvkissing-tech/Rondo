"""Real SQLite/native lifecycle with explicit offline model fixtures."""
import time
import unittest
import json
from unittest.mock import patch

from agent_review_loop.repair import path_matches_contract, unauthorized_changed_files
from agent_review_loop.reviews import save_review
from agent_review_loop.snapshots import verify_package
from agent_review_loop.store import StoreError
from tests import test_execution as execution_fixture


class RepairTests(unittest.TestCase):
    wait = execution_fixture.ExecutionTests.wait

    def setUp(self):
        execution_fixture.ExecutionTests.setUp(self)
        self.repair_mode = 'fix'
        self.always_reject = False
        with self.store._connection(write=True) as db:
            db.execute("UPDATE tasks SET instructions='Change output to 3',acceptance='Output is 3' WHERE id=?", (self.task_id,))

        def review(package, output, executable, *, cancel_check):
            self.review_calls += 1
            manifest = verify_package(package)
            rejected = self.review_calls == 1 or self.always_reject
            findings = [{'id': 'output', 'path': 'code.py', 'side': 'after', 'line': 1, 'priority': 1,
                         'trigger': 'Run code.py: output is 2, task requires 3',
                         'impact': 'Acceptance condition fails', 'evidence': 'Offline fixture inspected print(2)',
                         'evidence_kind': 'static'}] if rejected else []
            receipt = save_review(package, {'snapshot_id': manifest['snapshot_id'],
                                           'verdict': 'changes_requested' if rejected else 'approved',
                                           'summary': 'Explicit offline fixture review', 'findings': findings})
            return {'status': 'review_saved', 'process_tree_closed': True, **receipt}

        self.reviews.runner = review

    def native(self, payload, directory, executable, *, cancel_check, on_event):
        result = execution_fixture.ExecutionTests.native(self, payload, directory, executable,
                                      cancel_check=cancel_check, on_event=on_event)
        if payload['title'].startswith('返修'):
            if self.repair_mode != 'no-progress':
                (self.workspace / 'code.py').write_text('print(3)\n')
            if self.repair_mode == 'outside':
                (self.workspace / 'unrelated.txt').write_text('outside finding scope\n')
        return result

    def completed_flow(self, **choices):
        first = self.execution.start_execution(self.task_id, 'z-initial', **choices)
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline:
            with self.store._connection() as db:
                rows = db.execute('SELECT id FROM execution_jobs WHERE task_id=? ORDER BY created_at', (self.task_id,)).fetchall()
            last = self.execution.status(rows[-1]['id'])
            if len(rows) == 2 and (last['status'] == 'failed' or last['phase'] in ('completed', 'needs_attention', 'review_stopped')):
                return first, last
            time.sleep(.03)
        self.fail(str(last))

    def test_automatic_one_repair_preserves_history_and_latest_submission(self):
        first, repair = self.completed_flow()
        self.assertEqual(repair['phase'], 'completed', repair)
        self.assertEqual(repair['mode'], 'repair')
        self.assertEqual((self.calls, self.review_calls), (2, 2))
        self.assertEqual((self.workspace / 'code.py').read_text(), 'print(3)\n')
        self.assertEqual(self.reviews.read_review(repair['review_job_id'])['freshness'], 'current')
        repeated = self.execution.start_repair(repair['source_review_job_id'])
        self.assertEqual(repeated['job_id'], repair['job_id'])
        with self.store._connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM submissions').fetchone()[0], 2)
            latest = self.store.get_task(self.task_id)['result']['attempt_id']
            owner = db.execute('SELECT owner FROM attempts WHERE id=?', (latest,)).fetchone()[0]
        self.assertEqual(owner, 'rondo-workbuddy-' + repair['job_id'])
        self.assertEqual(self.execution.status(first['job_id'])['repair_job_id'], repair['job_id'])
        self.assertEqual(self.execution.start_execution(self.task_id, 'z-initial')['job_id'], first['job_id'])

    def test_execution_and_review_models_remain_separate_through_repair(self):
        review_choice = {'model': 'review-model', 'effort': 'high'}
        with patch.object(self.reviews, 'start_review', wraps=self.reviews.start_review) as start:
            _, repair = self.completed_flow(model_choice={'model': 'execution-model'}, review_model_choice=review_choice)
        self.assertEqual(repair['phase'], 'completed')
        self.assertEqual([call.kwargs['input_data']['model_choice'] for call in start.call_args_list], [review_choice, review_choice])
        with self.store._connection() as db:
            rows = db.execute('SELECT result_json FROM execution_jobs WHERE task_id=? ORDER BY created_at', (self.task_id,)).fetchall()
        for row in rows:
            data = json.loads(row['result_json'])
            self.assertEqual(data['requested_model'], 'execution-model')
            self.assertEqual(data['review_model_choice'], review_choice)

    def test_no_code_progress_stops_before_paid_review(self):
        self.repair_mode = 'no-progress'
        _, repair = self.completed_flow()
        self.assertEqual(repair['error_code'], 'REPAIR_NO_PROGRESS')
        self.assertEqual(self.review_calls, 1)

    def test_outside_file_is_preserved_but_not_automatically_reviewed(self):
        self.repair_mode = 'outside'
        _, repair = self.completed_flow()
        self.assertEqual(repair['error_code'], 'REPAIR_SCOPE_EXCEEDED')
        self.assertTrue((self.workspace / 'unrelated.txt').exists())
        self.assertEqual(self.review_calls, 1)

    def test_second_rejection_stops_at_budget_without_loop(self):
        self.always_reject = True
        _, repair = self.completed_flow()
        self.assertEqual(repair['phase'], 'needs_attention')
        self.assertEqual((self.calls, self.review_calls), (2, 2))
        with self.assertRaises(StoreError):
            self.execution.start_repair(repair['review_job_id'])
        self.assertEqual((self.calls, self.review_calls), (2, 2))

    def test_stale_source_refuses_without_reopening_submission(self):
        # Stop the coordinator, keeping its completed first-review evidence.
        self.execution._continue_after_review = lambda *_: None
        first = self.execution.start_execution(self.task_id, 'initial')
        state = self.wait(first, 'succeeded')
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            state = self.execution.status(first['job_id'])
            if state['review_job_id'] and self.reviews.status(state['review_job_id'])['status'] == 'succeeded':
                break
            time.sleep(.03)
        (self.workspace / 'code.py').write_text('print(99)\n')
        with self.assertRaises(StoreError) as caught:
            self.execution.start_repair(state['review_job_id'])
        self.assertEqual(caught.exception.code, 'REPAIR_SOURCE_STALE')
        self.assertEqual(self.store.get_task(self.task_id)['status'], 'submitted')
        self.assertEqual(self.calls, 1)

    def test_manual_repair_can_choose_a_different_execution_model(self):
        self.execution._continue_after_review = lambda *_: None
        first = self.execution.start_execution(self.task_id, 'initial', model_choice={'model': 'first-model'},
                                               review_model_choice={'model': 'review-model'})
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            state = self.execution.status(first['job_id'])
            if state['review_job_id'] and self.reviews.status(state['review_job_id'])['status'] == 'succeeded':
                break
            time.sleep(.03)
        repair = self.execution.start_repair(state['review_job_id'], {'model': 'repair-model'})
        with self.store._connection() as db:
            row = db.execute('SELECT result_json FROM execution_jobs WHERE id=?', (repair['job_id'],)).fetchone()
        saved = json.loads(row['result_json'])
        self.assertEqual(saved['requested_model'], 'repair-model')
        self.assertEqual(saved['review_model_choice'], {'model': 'review-model'})
        with self.assertRaises(StoreError) as caught:
            self.execution.start_repair(state['review_job_id'], {'model': 'different-model'})
        self.assertEqual(caught.exception.code, 'IDEMPOTENCY_CONFLICT')


class PortedPolicyTests(unittest.TestCase):
    def test_exact_directory_and_forbidden_contract_semantics(self):
        self.assertTrue(path_matches_contract('./src/a.py', ['src/**']))
        self.assertFalse(path_matches_contract('src-other/a.py', ['src/**']))
        self.assertTrue(path_matches_contract('src', ['src/**']))
        self.assertFalse(path_matches_contract('src', ['src/']))
        self.assertEqual(unauthorized_changed_files(['src/a.py', 'tests/a.py'], ['src/**']), ['tests/a.py'])
        self.assertEqual(unauthorized_changed_files(['src/a.py'], ['src/**'], ['src/a.py']), ['src/a.py'])
        self.assertEqual(unauthorized_changed_files(['a.py'], []), ['a.py'])
