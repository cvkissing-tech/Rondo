import concurrent.futures
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from contextlib import closing

from agent_review_loop.store import StoreError, TaskStore
from agent_review_loop.task_launch import TaskLauncher


class TaskLaunchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='开始任务 ')
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
        self.launcher = TaskLauncher(self.store, self.root / 'tasks')
        self.args = (str(self.repo), '实际任务', '修改code.py', '代码输出2', 'request-1')

    def test_start_replay_and_resume_use_one_isolated_workspace(self):
        (self.repo / 'code.py').write_bytes(b'user local change\n')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.launcher.start(*self.args), range(2)))
        self.assertEqual(results[0], results[1])
        context = results[0]
        workspace = Path(context['workspace'])
        self.assertEqual((workspace / 'code.py').read_bytes(), b'print(1)\n')
        (workspace / 'code.py').write_bytes(b'print(2)\n')
        self.assertEqual((self.repo / 'code.py').read_bytes(), b'user local change\n')
        resumed = TaskLauncher(TaskStore(self.store.path)).context(context['task_id'])
        self.assertEqual(resumed['workspace'], str(workspace))
        self.assertEqual(resumed['review']['tool'], 'start_task_review')
        self.assertEqual(len(self.store.list_tasks()['items']), 1)
        self.assertTrue(Path(context['handoff_file']).is_file())
        with self.assertRaises(StoreError) as error:
            self.launcher.start(str(self.repo), 'different', *self.args[2:])
        self.assertEqual(error.exception.code, 'IDEMPOTENCY_CONFLICT')

    def test_cli_start_and_context_work_with_same_task(self):
        command = [sys.executable, '-X', 'utf8', '-m', 'agent_review_loop']
        start = subprocess.run(command + ['start', '--db', str(self.store.path), '--repo', str(self.repo),
            '--task-root', str(self.root / 'tasks'), '--title', 'CLI task', '--instructions', 'implement',
            '--acceptance', 'passed', '--request-id', 'cli-1'], capture_output=True, encoding='utf-8', timeout=20)
        self.assertEqual(start.returncode, 0, start.stderr)
        context = json.loads(start.stdout)
        resumed = subprocess.run(command + ['context', '--db', str(self.store.path), str(context['task_id'])],
                                 capture_output=True, encoding='utf-8', timeout=10)
        self.assertEqual(resumed.returncode, 0, resumed.stderr)
        self.assertEqual(json.loads(resumed.stdout)['base_commit'], context['base_commit'])

    def test_schema_two_migrates_without_losing_tasks(self):
        task = self.store.create_task('keep', 'instructions', 'acceptance')
        with closing(sqlite3.connect(self.store.path)) as db:
            db.execute('DROP TABLE task_launches')
            db.execute('PRAGMA user_version=2')
            db.commit()
        migrated = TaskStore(self.store.path)
        self.assertEqual(migrated.get_task(task['task_id'])['title'], 'keep')
        self.assertEqual(TaskLauncher(migrated, self.root / 'tasks').start(*self.args)['task']['title'], '实际任务')


if __name__ == '__main__':
    unittest.main()
