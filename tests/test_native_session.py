import json
from pathlib import Path
import tempfile
import threading
import time
import unittest

from agent_review_loop.codex_rpc import RpcError, ReviewCancelled
from agent_review_loop.native_session import interactive_request, project_event, read_state, write_state


class NativeSessionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_approval_waits_for_explicit_matching_response(self):
        state, result = {'events': []}, []
        worker = threading.Thread(target=lambda: result.append(interactive_request(
            self.root, state, {'method': 'item/commandExecution/requestApproval', 'params': {'command': 'fixture'}}, lambda: False)))
        worker.start()
        deadline = time.monotonic() + 3
        while not read_state(self.root).get('pending') and time.monotonic() < deadline:
            time.sleep(.01)
        pending = read_state(self.root)['pending']
        self.assertTrue(worker.is_alive())
        self.assertEqual(result, [])
        (self.root / f"answer-{pending['id']}.json").write_text(json.dumps('decline'))
        worker.join(3)
        self.assertEqual(result, [{'decision': 'decline'}])
        self.assertNotIn('pending', read_state(self.root))

    def test_unsupported_interaction_and_cancel_never_grant(self):
        with self.assertRaises(RpcError):
            interactive_request(self.root, {}, {'method': 'item/tool/call'}, lambda: False)
        with self.assertRaises(ReviewCancelled):
            interactive_request(self.root, {}, {'method': 'item/fileChange/requestApproval'}, lambda: True)
        self.assertNotIn('pending', read_state(self.root))

    def test_projection_replaces_running_tools_and_bounds_history(self):
        state = {}
        for n in range(65):
            item = {'id': str(n), 'type': 'commandExecution', 'command': 'fixture', 'aggregatedOutput': 'done'}
            project_event(state, {'method': 'item/started', 'params': {'item': item}})
            project_event(state, {'method': 'item/completed', 'params': {'item': item}})
        self.assertEqual(len(state['events']), 60)
        self.assertEqual(state['events'][-1]['status'], 'completed')
        self.assertEqual(state['events'][-1]['output'], 'done')

    def test_concurrent_status_readers_do_not_break_writer(self):
        legacy = self.root / 'session.json'
        legacy.write_text('{}')
        stop, errors = threading.Event(), []
        def read():
            while not stop.is_set():
                try: read_state(self.root)
                except Exception as error: errors.append(error); return
        readers = [threading.Thread(target=read) for _ in range(3)]
        for reader in readers: reader.start()
        try:
            # A held legacy JSON read handle reproduces the old Windows replace failure.
            with legacy.open('rb'):
                for n in range(100): write_state(self.root, {'counter': n})
            self.assertEqual(read_state(self.root), {'counter': 99})
        finally:
            stop.set()
            for reader in readers: reader.join(5)
        self.assertEqual(errors, [])

    def test_corrupt_optional_projection_does_not_hide_primary_job_access(self):
        (self.root/'session.sqlite3').write_bytes(b'corrupt projection')
        self.assertEqual(read_state(self.root), {})
