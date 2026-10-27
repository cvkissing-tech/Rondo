import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from contextlib import closing
from unittest.mock import patch

from agent_review_loop.planning import PlanJobs, load_context, prepare_context, run_codex_plan, save_plan
from agent_review_loop.review_jobs import ReviewJobs
from agent_review_loop.snapshots import canonical
from agent_review_loop.store import TaskStore, StoreError, SCHEMA, REVIEW_SCHEMA, LAUNCH_SCHEMA, APPLICATION_ID
from agent_review_loop.task_launch import TaskLauncher
from tests.test_codex_review import FakeRpc


def fixture_plan(context_id):
    return {'context_id': context_id, 'summary': 'Synthetic plan fixture, not a model result',
            'steps': [{'title': 'Update sample', 'details': 'Change sample.py to print 2.',
                       'files': ['sample.py'], 'verification': ['Run sample.py and check output is 2.']}],
            'assumptions': ['Only the supplied source excerpts were inspected.']}


class PlanRpc(FakeRpc):
    def request(self, method, params, **kwargs):
        if method == 'thread/resume':
            type(self).calls.append(method)
            type(self).requests.append((method, params))
            return {'thread': {'id': params['threadId']}, 'cwd': params['cwd'], 'model': 'synthetic-model'}
        if method != 'turn/start':
            return super().request(method, params, **kwargs)
        type(self).calls.append(method)
        text = self.text if self.text is not None else json.dumps(fixture_plan(params['outputSchema']['properties']['context_id']['enum'][0]))
        self.events = [
            {'method': 'item/completed', 'params': {'threadId': 'thread-1', 'item': {'type': 'agentMessage', 'text': text}}},
            {'method': 'turn/completed', 'params': {'threadId': 'thread-1', 'turn': {'id': 'turn-1', 'status': self.status}}},
        ]
        return {'turn': {'id': 'turn-1'}}


class PlanningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='plan fixture ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        (self.repo / 'sample.py').write_bytes(b'print(1)\n')
        for args in (['init', '-q'], ['config', 'user.name', 'Fixture'],
                     ['config', 'user.email', 'fixture@example.invalid'], ['add', '.'], ['commit', '-qm', 'baseline']):
            subprocess.run(['git', *args], cwd=self.repo, check=True, capture_output=True)
        self.store = TaskStore(self.root / 'tasks.sqlite3')
        self.launcher = TaskLauncher(self.store, self.root / 'tasks')
        self.context = self.launcher.start(str(self.repo), 'Update sample.py', 'Make sample.py print 2', 'Output 2', 'task-1')
        self.workspace = Path(self.context['workspace'])
        self.started, self.release = threading.Event(), threading.Event()
        self.calls = 0
        def runner(inputs, output, executable, *, cancel_check=None):
            self.calls += 1
            self.started.set()
            while not self.release.wait(.01):
                if cancel_check():
                    return {'status': 'cancelled', 'process_tree_closed': True}
            output.mkdir()
            context = load_context(inputs)
            return {'status': 'plan_saved', 'process_tree_closed': True,
                    **save_plan(output, fixture_plan(context['context_id']), context['context_id'])}
        self.first = PlanJobs(self.store, self.root / 'runs', runner=runner, executable=Path(sys.executable), backend='fixture')
        self.second = PlanJobs(TaskStore(self.store.path), self.root / 'runs', runner=runner, executable=Path(sys.executable), backend='fixture')
        self.addCleanup(self.first.close)
        self.addCleanup(self.second.close)
        PlanRpc.text, PlanRpc.status, PlanRpc.enabled_mcp, PlanRpc.calls, PlanRpc.close_error = None, 'completed', False, [], False

    def start(self, request='one', manager=None):
        return (manager or self.first).start_review(self.context['task_id'], str(self.workspace), self.context['base_commit'], request)

    def wait(self, job, expected):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            status = self.second.status(job['job_id'])
            if status['status'] == expected:
                return status
            if status['status'] in ('failed', 'interrupted'):
                self.fail(str(status))
            time.sleep(.02)
        self.fail(str(status))

    def test_persistent_idempotency_freshness_and_content_integrity(self):
        job = self.start()
        self.assertTrue(self.started.wait(5))
        self.assertEqual(self.start(manager=self.second)['job_id'], job['job_id'])
        review = ReviewJobs(self.store, self.root / 'reviews', executable=Path(sys.executable))
        self.addCleanup(review.close)
        with self.assertRaises(StoreError) as caught:
            review.start_review(self.context['task_id'], str(self.workspace), 'HEAD', 'review')
        self.assertEqual(caught.exception.code, 'REVIEW_BUSY')
        self.release.set()
        self.wait(job, 'succeeded')
        result = self.second.read_plan(job['job_id'])
        self.assertEqual(result['freshness'], 'current')
        self.assertEqual(self.calls, 1)
        self.assertEqual(self.launcher.context(self.context['task_id'])['latest_plan_job_id'], job['job_id'])
        self.assertIsNone(self.launcher.context(self.context['task_id'])['latest_review_job_id'])
        (self.workspace / 'sample.py').write_bytes(b'print(3)\n')
        self.assertEqual(self.first.read_plan(job['job_id'])['freshness'], 'stale')
        with self.store._connection() as db:
            directory = Path(db.execute('SELECT directory FROM plan_jobs WHERE id=?', (job['job_id'],)).fetchone()[0])
        file = directory / 'runtime/plan.json'
        plan = json.loads(file.read_text())
        plan['summary'] = 'tampered'
        file.write_bytes(canonical(plan))
        with self.assertRaises(StoreError) as caught:
            self.second.read_plan(job['job_id'])
        self.assertEqual(caught.exception.code, 'PLAN_CHANGED')

    def test_cancel_is_idempotent_and_explicit_turns_are_not_limited_to_two(self):
        job = self.start()
        self.assertTrue(self.started.wait(5))
        self.second.cancel(job['job_id'])
        self.wait(job, 'cancelled')
        self.assertEqual(self.start()['job_id'], job['job_id'])
        self.release.set()
        second = self.start('two')
        self.wait(second, 'succeeded')
        third = self.start('three')
        self.wait(third, 'succeeded')
        self.assertEqual(self.calls, 3)

    def test_discussion_revision_history_and_native_resume(self):
        self.first.runner = run_codex_plan
        self.first.backend = 'codex'
        calls = []
        def inline(prompt, schema, cwd, output, executable, **options):
            output.mkdir()
            calls.append(options)
            fields = schema['properties']
            if 'reply' not in fields:
                data = fixture_plan(fields['context_id']['enum'][0])
            elif len(calls) == 2:
                data = {'reply': '这里使用离线方案，因为无需服务器。', 'plan': None}
            else:
                plan = fixture_plan(fields['plan']['anyOf'][0]['properties']['context_id']['enum'][0])
                plan['summary'] = '先做离线版，增加本地排行榜。'
                data = {'reply': '已移除联网步骤并增加本地排行榜。', 'plan': plan}
            return {'status': 'completed', 'data': data, 'thread_id': 'own-thread', 'process_tree_closed': True}
        with patch('agent_review_loop.planning.run_inline_json', side_effect=inline):
            initial = self.start()
            self.wait(initial, 'succeeded')
            v1 = self.first.read_plan(initial['job_id'])
            question = self.first.start_message(self.context['task_id'], str(self.workspace), self.context['base_commit'], 'question', '为什么选择这个方案？')
            self.wait(question, 'succeeded')
            self.assertEqual(self.first.read_plan(question['job_id'])['plan_id'], v1['plan_id'])
            self.assertEqual(calls[1]['resume_thread_id'], 'own-thread')
            revision = self.first.start_message(self.context['task_id'], str(self.workspace), self.context['base_commit'], 'revision', '先做离线版，增加本地排行榜')
            self.wait(revision, 'succeeded')
            v2 = self.second.read_plan(revision['job_id'])
            self.assertEqual(v2['version'], 2)
            self.assertNotEqual(v2['plan_id'], v1['plan_id'])
            self.assertEqual(self.first.start_message(self.context['task_id'], str(self.workspace), self.context['base_commit'], 'revision', '先做离线版，增加本地排行榜')['job_id'], revision['job_id'])
            self.assertEqual(len(calls), 3)
            with self.assertRaises(StoreError) as caught:
                self.first.start_message(self.context['task_id'], str(self.workspace), self.context['base_commit'], 'revision', '不同的意见')
            self.assertEqual(caught.exception.code, 'IDEMPOTENCY_CONFLICT')
        restored = PlanJobs(TaskStore(self.store.path), self.root / 'runs')
        self.addCleanup(restored.close)
        history = restored.conversation(self.context['task_id'])['items']
        self.assertEqual(len(history), 3)
        self.assertEqual(history[1]['user_message'], '为什么选择这个方案？')
        self.assertEqual(history[1]['reply'], '这里使用离线方案，因为无需服务器。')
        self.assertEqual(history[2]['plan_job_id'], revision['job_id'])
        self.assertEqual(self.second.read_plan(initial['job_id'])['plan_id'], v1['plan_id'])

    def inputs(self):
        payload = prepare_context(self.context['task'], self.workspace, self.context['base_commit'])
        directory = self.root / 'inputs'
        directory.mkdir()
        (directory / 'context.json').write_bytes(canonical(payload))
        return directory

    def test_shared_transport_saves_only_valid_completed_plan(self):
        inputs = self.inputs()
        with patch('agent_review_loop.codex_review.CodexRpc', PlanRpc):
            result = run_codex_plan(inputs, self.root / 'runtime', sys.executable)
        self.assertEqual(result['status'], 'plan_saved')
        self.assertTrue(result['process_tree_closed'])
        self.assertEqual(PlanRpc.calls.count('turn/start'), 1)

    def test_transport_resumes_exact_thread_without_creating_another(self):
        from agent_review_loop.codex_review import run_inline_json
        from agent_review_loop.planning import plan_schema
        with patch('agent_review_loop.codex_review.CodexRpc', PlanRpc):
            result = run_inline_json('fixture', plan_schema('a' * 64), self.workspace, self.root / 'resume',
                                     sys.executable, resume_thread_id='thread-1')
        self.assertEqual(result['status'], 'completed')
        self.assertEqual(result['continuation'], 'native_resume')
        self.assertEqual(PlanRpc.calls.count('thread/resume'), 1)
        self.assertNotIn('thread/start', PlanRpc.calls)
        self.assertEqual(PlanRpc.calls.count('turn/start'), 1)

    def test_occupied_native_session_falls_back_before_any_model_turn(self):
        from agent_review_loop.codex_review import run_inline_json
        from agent_review_loop.codex_rpc import RpcError
        from agent_review_loop.planning import plan_schema
        class BusyResume(PlanRpc):
            def request(self, method, params, **options):
                if method == 'thread/resume':
                    raise RpcError('thread already has an active writer')
                return super().request(method, params, **options)
        with patch('agent_review_loop.codex_review.CodexRpc', BusyResume):
            result = run_inline_json('saved context fixture', plan_schema('a' * 64), self.workspace,
                                     self.root / 'occupied', sys.executable, resume_thread_id='thread-busy')
        self.assertEqual(result['status'], 'completed')
        self.assertEqual(result['continuation'], 'saved_context')
        self.assertEqual(BusyResume.calls.count('turn/start'), 1)
        self.assertEqual(BusyResume.calls.count('thread/start'), 1)

    def test_invalid_plan_is_not_saved_or_retried(self):
        inputs = self.inputs()
        PlanRpc.text = json.dumps({'summary': 'missing required fields'})
        with patch('agent_review_loop.codex_review.CodexRpc', PlanRpc):
            result = run_codex_plan(inputs, self.root / 'runtime', sys.executable)
        self.assertEqual(result['status'], 'failed')
        self.assertFalse((self.root / 'runtime/plan.json').exists())
        self.assertEqual(PlanRpc.calls.count('turn/start'), 1)

    def test_context_boundaries_and_schema_three_migration(self):
        (self.workspace / 'secrets.json').write_bytes(b'{"secret":"never-inline"}')
        (self.workspace / 'large.py').write_bytes(b'x' * 8000)
        payload = prepare_context(self.context['task'], self.workspace, self.context['base_commit'])
        self.assertNotIn('secrets.json', payload['previews'])
        self.assertTrue(payload['previews']['large.py']['truncated'])
        self.assertLess(len(canonical(payload)), 64 * 1024)
        old = self.root / 'old.sqlite3'
        with closing(sqlite3.connect(old)) as db:
            for statement in SCHEMA + REVIEW_SCHEMA + LAUNCH_SCHEMA:
                db.execute(statement)
            db.execute(f'PRAGMA application_id={APPLICATION_ID}')
            db.execute('PRAGMA user_version=3')
            db.execute("INSERT INTO tasks(title,instructions,acceptance,created_at,updated_at) VALUES('keep','i','a','then','then')")
            db.commit()
        migrated = TaskStore(old)
        self.assertEqual(migrated.get_task(1)['title'], 'keep')
        with migrated._connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM plan_jobs').fetchone()[0], 0)


if __name__ == '__main__':
    unittest.main()
