import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import sys

from agent_review_loop.reviews import review_status, save_review
from agent_review_loop.snapshots import SnapshotError, create_review_package
from agent_review_loop.store import TaskStore


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='审查 中文 ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        for args in [('init', '-q'), ('config', 'user.name', 'Fixture'),
                     ('config', 'user.email', 'fixture@example.invalid'), ('config', 'core.autocrlf', 'false')]:
            self.git(*args)
        (self.repo / 'main.py').write_bytes(b'print(1)\nprint(2)\n')
        (self.repo / 'deleted.txt').write_bytes(b'old\n')
        (self.repo / 'binary.dat').write_bytes(b'\0\xff')
        self.git('add', '.')
        self.git('commit', '-qm', 'baseline')
        (self.repo / 'deleted.txt').unlink()
        self.package = self.root / 'package'
        manifest = create_review_package(self.repo, 'HEAD', {
            'task_id': 1, 'title': 'review', 'instructions': 'inspect source', 'acceptance': 'fixed version',
        }, self.package)
        self.review = {'snapshot_id': manifest['snapshot_id'], 'verdict': 'approved',
                       'summary': 'Synthetic protocol fixture, not a real quality review', 'findings': []}

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.repo, stderr=subprocess.PIPE,
                                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)

    def assert_code(self, code, operation):
        with self.assertRaises(SnapshotError) as caught:
            operation()
        self.assertEqual(caught.exception.code, code)

    def finding(self):
        return {'id': 'F1', 'path': 'main.py', 'side': 'after', 'line': 2, 'priority': 2,
                'trigger': 'synthetic trigger', 'impact': 'synthetic impact',
                'evidence': 'Fixture only; no real defect claimed', 'evidence_kind': 'static'}

    def test_history_idempotency_and_freshness_after_restart(self):
        first = save_review(self.package, self.review)
        self.assertEqual(save_review(self.package, self.review), first)
        self.assertEqual(len(list((self.package / 'reviews').glob('*.json'))), 1)
        unchecked = review_status(self.package, first['review_id'])
        self.assertEqual(unchecked['freshness'], 'unchecked')
        self.assertFalse(unchecked['review_approved'])
        current = review_status(Path(str(self.package)), first['review_id'], Path(str(self.repo)))
        self.assertTrue(current['review_approved'])
        self.assertEqual(current['checks']['status'], 'not_run')
        (self.repo / 'new.txt').write_bytes(b'new content\n')
        stale = review_status(self.package, first['review_id'], self.repo)
        self.assertEqual(stale['freshness'], 'stale')
        self.assertFalse(stale['review_approved'])
        self.assertEqual(stale['review'], self.review)

    def test_review_snapshot_must_match(self):
        self.assert_code('SNAPSHOT_MISMATCH', lambda: save_review(self.package, {**self.review, 'snapshot_id': '0' * 64}))
        self.assertFalse((self.package / 'reviews').exists())

    def test_invalid_locations_and_types_are_rejected(self):
        review = {**self.review, 'verdict': 'changes_requested', 'findings': [self.finding()]}
        for changes in ({'path': '../outside'}, {'path': 'missing.py'}, {'line': True},
                        {'line': 3}, {'line': 0}, {'side': 'unknown'}, {'priority': True},
                        {'priority': 9}, {'trigger': ''}, {'evidence_kind': 'proven-by-model'}):
            with self.subTest(changes=changes):
                changed = {**review, 'findings': [{**self.finding(), **changes}]}
                self.assert_code('INVALID_REVIEW', lambda: save_review(self.package, changed))
        self.assert_code('INVALID_REVIEW', lambda: save_review(self.package, {**review, 'findings': [self.finding()] * 2}))
        self.assert_code('INVALID_REVIEW', lambda: save_review(self.package, {**self.review, 'findings': [self.finding()]}))
        self.assert_code('INVALID_REVIEW', lambda: save_review(self.package, {**review, 'findings': []}))

    def test_deleted_and_binary_files_can_be_located_without_invented_lines(self):
        removed = {**self.finding(), 'path': 'deleted.txt', 'side': 'before', 'line': 1}
        binary = {**self.finding(), 'id': 'F2', 'path': 'binary.dat', 'line': None}
        review = {**self.review, 'verdict': 'changes_requested', 'findings': [removed, binary]}
        receipt = save_review(self.package, review)
        status = review_status(self.package, receipt['review_id'], self.repo)
        self.assertEqual(status['freshness'], 'current')
        self.assertFalse(status['review_approved'])
        bad = copy.deepcopy(review)
        bad['findings'][1]['line'] = 1
        self.assert_code('INVALID_REVIEW', lambda: save_review(self.package, bad))

    def test_tampered_package_or_history_cannot_be_used(self):
        receipt = save_review(self.package, self.review)
        record = self.package / 'reviews' / (receipt['review_id'] + '.json')
        original = record.read_bytes()
        record.write_text(json.dumps({**self.review, 'summary': 'changed'}), encoding='utf-8')
        self.assert_code('INVALID_RECORD', lambda: review_status(self.package, receipt['review_id'], self.repo))
        record.write_bytes(original)
        (self.package / 'after/main.py').write_bytes(b'changed\n')
        self.assert_code('PACKAGE_CHANGED', lambda: review_status(self.package, receipt['review_id'], self.repo))
        self.assert_code('INVALID_ARGUMENT', lambda: review_status(self.package, '../escape'))

    def test_other_repository_cannot_claim_freshness(self):
        receipt = save_review(self.package, self.review)
        unrelated = self.root / 'other'
        unrelated.mkdir()
        subprocess.run(['git', 'init', '-q', str(unrelated)], check=True, capture_output=True)
        self.assert_code('REPOSITORY_MISMATCH', lambda: review_status(self.package, receipt['review_id'], unrelated))

    def test_malformed_model_outputs_are_data_errors(self):
        for value in ([], {}, {**self.review, 'summary': '\ud800'},
                      {**self.review, 'extra': 'unrequested data'}, {**self.review, 'findings': None}):
            with self.subTest(value=repr(value)):
                self.assert_code('INVALID_REVIEW', lambda: save_review(self.package, value))

    def test_cli_reads_task_and_verifies_review_from_another_directory(self):
        database = self.root / 'tasks.db'
        task = TaskStore(database).create_task('CLI 中文任务', '要求', '验收')

        def cli(*args, success=True):
            result = subprocess.run([sys.executable, '-X', 'utf8', '-m', 'agent_review_loop', *map(str, args)],
                                    cwd=self.root, capture_output=True, text=True, encoding='utf-8', timeout=30,
                                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            self.assertEqual(result.returncode, 0 if success else 1, result.stderr)
            return json.loads(result.stdout if success else result.stderr)

        workspace = cli('workspace', '--repo', self.repo, '--base', 'HEAD', '--output', self.root / 'cli-run')
        output = self.root / 'cli-package'
        package = cli('package', '--db', database, '--task-id', task['task_id'], '--repo', workspace['workspace'],
                      '--base', workspace['base_commit'], '--output', output)
        self.assertEqual(package['checks']['status'], 'not_run')
        manifest = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['task']['title'], 'CLI 中文任务')
        path = self.root / 'review.json'
        path.write_text(json.dumps({**self.review, 'snapshot_id': package['snapshot_id']}), encoding='utf-8')
        receipt = cli('record-review', '--package', output, '--file', path)
        status = cli('review-status', '--package', output, '--review-id', receipt['review_id'], '--repo', workspace['workspace'])
        self.assertTrue(status['review_approved'])
        self.assertFalse(cli('review-status', '--package', output, '--review-id', receipt['review_id'])['review_approved'])
        path.write_text(json.dumps({**self.review, 'snapshot_id': '0' * 64}), encoding='utf-8')
        error = cli('record-review', '--package', output, '--file', path, success=False)
        self.assertEqual(error['code'], 'SNAPSHOT_MISMATCH')


if __name__ == '__main__':
    unittest.main()
