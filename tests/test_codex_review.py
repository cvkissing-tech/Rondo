import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from agent_review_loop.codex_review import run_codex_review


class FakeRpc:
    """Adapter contract fixture; transport and Windows lifecycle have separate real-process tests."""
    text = None
    status = 'completed'
    enabled_mcp = False
    close_error = False
    calls = []

    def __init__(self, *args, **kwargs):
        self.events = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        if self.close_error:
            raise RuntimeError('synthetic cleanup error')

    def initialize(self):
        return {}

    def request(self, method, params, **kwargs):
        type(self).calls.append(method)
        if method == 'config/read':
            return {'config': {'mcp_servers': {'fixture': {'enabled': self.enabled_mcp}}}}
        if method == 'account/read':
            return {'requiresOpenaiAuth': True, 'account': {'type': 'chatgpt'}}
        if method == 'thread/start':
            return {'thread': {'id': 'thread-1'}, 'cwd': params['cwd'], 'model': 'synthetic-model',
                    'modelProvider': 'fixture', 'sandbox': {'type': 'readOnly', 'networkAccess': False}}
        if method == 'turn/start':
            snapshot = params['outputSchema']['properties']['snapshot_id']['enum'][0]
            text = self.text if self.text is not None else json.dumps({
                'snapshot_id': snapshot, 'verdict': 'approved', 'summary': 'Fixture', 'findings': [],
            })
            self.events = [
                {'method': 'item/completed', 'params': {'threadId': 'thread-1', 'item': {'type': 'agentMessage', 'text': text}}},
                {'method': 'turn/completed', 'params': {'threadId': 'thread-1', 'turn': {'id': 'turn-1', 'status': self.status}}},
            ]
            return {'turn': {'id': 'turn-1'}}
        if method == 'turn/interrupt':
            return {}
        raise AssertionError(method)

    def notification(self, **kwargs):
        return self.events.pop(0)


class CodexReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='审查调用 ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.package = self.root / 'package'
        (self.package / 'after').mkdir(parents=True)
        (self.package / 'before').mkdir()
        (self.package / 'after/main.py').write_text('print(1)\n', encoding='utf-8')
        self.manifest = {'snapshot_id': 'a' * 64, 'task': {'instructions': 'fixture'}, 'checks': {'status': 'not_run'},
                         'files': {'before': {}, 'after': {'main.py': {'binary': False}}}}
        self.addCleanup(patch.stopall)
        patch('agent_review_loop.codex_review.verify_package', return_value=self.manifest).start()
        patch('agent_review_loop.codex_review.CodexRpc', FakeRpc).start()
        self.save = patch('agent_review_loop.codex_review.save_review', return_value={'review_id': 'b' * 64}).start()
        FakeRpc.text, FakeRpc.status, FakeRpc.enabled_mcp, FakeRpc.calls, FakeRpc.close_error = None, 'completed', False, [], False

    def run_review(self):
        return run_codex_review(self.package, self.root / 'run', Path(sys.executable))

    def test_only_completed_structured_review_is_saved(self):
        result = self.run_review()
        self.assertEqual(result['status'], 'review_saved')
        self.assertEqual(result['turns_started'], 1)
        self.assertEqual(FakeRpc.calls.count('turn/start'), 1)
        self.save.assert_called_once()

    def test_interrupted_turn_is_not_saved_or_retried(self):
        FakeRpc.status = 'interrupted'
        result = self.run_review()
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(FakeRpc.calls.count('turn/start'), 1)
        self.save.assert_not_called()

    def test_malformed_output_is_kept_but_not_approved(self):
        FakeRpc.text = 'not JSON'
        result = self.run_review()
        self.assertEqual(result['status'], 'failed')
        self.assertEqual((self.root / 'run/response.txt').read_text(), 'not JSON')
        self.save.assert_not_called()

    def test_enabled_mcp_blocks_generation(self):
        FakeRpc.enabled_mcp = True
        self.assertEqual(self.run_review()['turns_started'], 0)
        self.assertNotIn('turn/start', FakeRpc.calls)

    def test_cleanup_failure_is_never_a_success(self):
        FakeRpc.close_error = True
        self.assertEqual(self.run_review()['status'], 'failed')


if __name__ == '__main__':
    unittest.main()
