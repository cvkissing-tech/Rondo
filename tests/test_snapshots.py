import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from agent_review_loop.snapshots import (
    SnapshotError, create_review_package, prepare_workspace, verify_package,
)


TASK = {'task_id': 1, 'title': '修复示例', 'instructions': '保留二进制和新文件', 'acceptance': '审查版本一致'}


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='快照 空格 ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.git('init', '-q')
        self.git('config', 'user.name', 'Offline Fixture')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.git('config', 'core.autocrlf', 'false')
        (self.repo / 'main.py').write_bytes(b'print(1)\n')
        (self.repo / 'deleted.txt').write_bytes(b'old\n')
        (self.repo / '.gitignore').write_bytes(b'ignored/\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'fixture baseline')
        self.base = self.git('rev-parse', 'HEAD').decode().strip()
        self.output = self.root / 'package'

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.repo, stderr=subprocess.PIPE,
                                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)

    def package(self):
        return create_review_package(self.repo, self.base, TASK, self.output)

    def assert_code(self, code, operation):
        with self.assertRaises(SnapshotError) as caught:
            operation()
        self.assertEqual(caught.exception.code, code)

    def test_content_capture_preserves_index_head_and_source(self):
        (self.repo / 'main.py').write_bytes(b'print(2)\n')
        self.git('add', 'main.py')
        (self.repo / 'main.py').write_bytes(b'print(3)\n')  # staged differs from working copy
        (self.repo / 'deleted.txt').unlink()
        (self.repo / '新增 file.txt').write_text('中文\n', encoding='utf-8')
        (self.repo / 'image.bin').write_bytes(b'\x00\xff\x01')
        (self.repo / 'ignored').mkdir()
        (self.repo / 'ignored/private.txt').write_text('not included', encoding='utf-8')
        (self.repo / '.gitignore').write_bytes(b'ignored/\nmain.py\n')  # tracked files still count
        index = self.repo / '.git/index'
        before = index.read_bytes()
        result = self.package()
        self.assertEqual(index.read_bytes(), before)
        self.assertEqual(self.git('rev-parse', 'HEAD').decode().strip(), self.base)
        self.assertEqual((self.output / 'before/main.py').read_bytes(), b'print(1)\n')
        self.assertEqual((self.output / 'after/main.py').read_bytes(), b'print(3)\n')
        self.assertNotIn('deleted.txt', result['files']['after'])
        self.assertIn('deleted.txt', result['files']['before'])
        self.assertEqual((self.output / 'after/image.bin').read_bytes(), b'\x00\xff\x01')
        self.assertTrue(result['files']['after']['image.bin']['binary'])
        self.assertNotIn('ignored/private.txt', result['files']['after'])
        self.assertIn('GIT binary patch', (self.output / 'changes.patch').read_text(encoding='utf-8'))
        self.assertEqual(verify_package(self.output)['snapshot_id'], result['snapshot_id'])
        self.assertEqual(result['checks']['status'], 'not_run')
        (self.repo / 'main.py').write_bytes(b'print(4)\n')
        self.assertEqual((self.output / 'after/main.py').read_bytes(), b'print(3)\n')

    def test_package_rejects_changed_missing_and_extra_files(self):
        self.package()
        target = self.output / 'after/main.py'
        original = target.read_bytes()
        target.write_bytes(b'tampered\n')
        self.assert_code('PACKAGE_CHANGED', lambda: verify_package(self.output))
        target.unlink()
        self.assert_code('PACKAGE_CHANGED', lambda: verify_package(self.output))
        target.write_bytes(original)
        extra = self.output / 'after/extra.txt'
        extra.touch()
        self.assert_code('PACKAGE_CHANGED', lambda: verify_package(self.output))
        extra.unlink()
        (self.output / 'changes.patch').write_bytes(b'changed')
        self.assert_code('PACKAGE_CHANGED', lambda: verify_package(self.output))

    def test_manifest_identity_and_existing_output_are_checked(self):
        result = self.package()
        self.assert_code('OUTPUT_EXISTS', self.package)
        result['task']['instructions'] = 'different task'
        (self.output / 'manifest.json').write_text(json.dumps(result), encoding='utf-8')
        self.assert_code('PACKAGE_CHANGED', lambda: verify_package(self.output))

    def test_output_cannot_be_inside_source_or_use_subdirectory_as_repo(self):
        self.assert_code('INVALID_OUTPUT', lambda: create_review_package(self.repo, self.base, TASK, self.repo / 'nested'))
        sub = self.repo / 'sub'
        sub.mkdir()
        self.assert_code('INVALID_REPOSITORY', lambda: create_review_package(sub, self.base, TASK, self.output))
        self.assertFalse(self.output.exists())

    def test_rejects_submodules_and_filters_without_creating_complete_package(self):
        self.git('update-index', '--add', '--cacheinfo', f'160000,{self.base},submodule')
        self.git('commit', '-qm', 'gitlink fixture')
        self.assert_code('UNSUPPORTED_ENTRY', self.package)
        self.assertFalse((self.output / 'manifest.json').exists())
        self.git('reset', '--hard', self.base)
        (self.repo / '.gitattributes').write_bytes(b'*.py filter=unapproved\n')
        self.assert_code('UNSUPPORTED_FILTER', self.package)

    def test_unstable_capture_and_limits_are_rejected(self):
        with patch('agent_review_loop.snapshots.capture_tree', side_effect=['a' * 40, 'b' * 40]):
            self.assert_code('SOURCE_CHANGED', self.package)
        with patch('agent_review_loop.snapshots.MAX_FILES', 1):
            self.assert_code('PACKAGE_LIMIT', self.package)
        with patch('agent_review_loop.snapshots.MAX_BYTES', 1):
            self.assert_code('PACKAGE_LIMIT', self.package)

    def test_oversized_untracked_file_is_rejected_before_git_add(self):
        from agent_review_loop import snapshots
        (self.repo / 'large.bin').write_bytes(b'x' * 100)
        with patch.object(snapshots, 'MAX_BYTES', 50), patch.object(snapshots, '_git', wraps=snapshots._git) as calls:
            self.assert_code('PACKAGE_LIMIT', self.package)
        self.assertFalse(any('add' in call.args[1:] for call in calls.call_args_list))

    def test_git_timeout_is_a_named_failure(self):
        with patch('agent_review_loop.snapshots.subprocess.run', side_effect=subprocess.TimeoutExpired('git', 60)):
            self.assert_code('GIT_TIMEOUT', self.package)

    def test_links_sparse_checkout_and_nonportable_paths_are_explicitly_rejected(self):
        blob = self.git('rev-parse', 'HEAD:main.py').decode().strip()
        self.git('update-index', '--add', '--cacheinfo', f'120000,{blob},linked-file')
        self.git('commit', '-qm', 'symlink tree fixture without creating a link')
        self.assert_code('UNSUPPORTED_ENTRY', self.package)
        self.git('reset', '--hard', self.base)
        self.git('config', 'core.sparseCheckout', 'true')
        self.assert_code('UNSUPPORTED_ENTRY', self.package)
        self.git('config', 'core.sparseCheckout', 'false')
        # Windows normalizes a trailing period on creation. Test the parser directly.
        from agent_review_loop.snapshots import safe_relative
        for name in ('../escape', '/absolute', 'NUL.txt', 'bad-path.', 'dir\\file', 'C:/file'):
            self.assert_code('UNSUPPORTED_PATH', lambda name=name: safe_relative(name))

    def test_private_index_ignores_ambient_git_redirection(self):
        unrelated = self.root / 'unrelated-index'
        unrelated.write_bytes(b'keep this file')
        with patch.dict(os.environ, {'GIT_INDEX_FILE': str(unrelated), 'GIT_WORK_TREE': str(self.root)}):
            self.package()
        self.assertEqual(unrelated.read_bytes(), b'keep this file')

    def test_export_ignore_does_not_remove_review_source(self):
        (self.repo / '.gitattributes').write_bytes(b'main.py export-ignore\n')
        self.package()
        self.assertEqual((self.output / 'after/main.py').read_bytes(), b'print(1)\n')

    def test_workspace_uses_base_without_touching_dirty_source(self):
        (self.repo / 'main.py').write_bytes(b'local user changes\n')
        before = (self.repo / '.git/index').read_bytes()
        result = prepare_workspace(self.repo, self.root / 'run', self.base)
        workspace = Path(result['workspace'])
        self.assertEqual((workspace / 'main.py').read_bytes(), b'print(1)\n')
        self.assertEqual((self.repo / 'main.py').read_bytes(), b'local user changes\n')
        self.assertEqual((self.repo / '.git/index').read_bytes(), before)
        self.assertEqual(self.git('rev-parse', 'HEAD').decode().strip(), self.base)
        self.assertEqual(result['base_commit'], self.base)
        self.assert_code('OUTPUT_EXISTS', lambda: prepare_workspace(self.repo, self.root / 'run', self.base))


if __name__ == '__main__':
    unittest.main()
