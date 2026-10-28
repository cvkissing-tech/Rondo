import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from agent_review_loop.execution import native_run
from agent_review_loop.workbuddy_progress import project_update, recorded_history, public_text


class WorkBuddyProgressTests(unittest.TestCase):
    def test_progress_merges_tools_and_bounds_public_text_without_reasoning(self):
        state = {}
        self.assertFalse(project_update(state, {'sessionUpdate': 'agent_thought_chunk', 'text': 'private'}))
        project_update(state, {'sessionUpdate': 'agent_message_chunk', 'text': 'writing '})
        project_update(state, {'sessionUpdate': 'agent_message_chunk', 'text': 'code'})
        self.assertEqual(state['events'][0]['text'], 'writing code')
        project_update(state, {'sessionUpdate': 'tool_call', 'toolCallId': 'a', 'title': 'Write file'})
        project_update(state, {'sessionUpdate': 'tool_call_update', 'toolCallId': 'a', 'status': 'completed', 'text': '{"claim_token":"secret"}'})
        self.assertEqual(len(state['events']), 2)
        self.assertEqual(state['events'][1]['status'], 'completed')
        self.assertNotIn('secret', state['events'][1]['output'])
        for i in range(80): project_update(state, {'sessionUpdate': 'tool_call', 'toolCallId': str(i), 'title': 'x' * 9000})
        self.assertEqual(len(state['events']), 60)
        self.assertEqual(len(state['events'][-1]['text']), 6000)

    def test_history_is_scoped_to_bound_session_and_workspace(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); path = root/'history.jsonl'
            base = {'sessionId': 'sid', 'cwd': str(root)}
            rows = [
                {**base, 'type': 'reasoning', 'text': 'private'},
                {**base, 'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': 'user context'}]},
                {**base, 'type': 'message', 'role': 'assistant', 'content': [{'type': 'output_text', 'text': 'wrote code'}], 'providerData': {'model': 'observed-model'}},
                {**base, 'sessionId': 'other', 'type': 'message', 'role': 'assistant', 'content': [{'type': 'output_text', 'text': 'other task'}]},
                {**base, 'type': 'function_call', 'name': 'Write', 'callId': 't'},
                {**base, 'type': 'function_call_result', 'name': 'Write', 'callId': 't', 'status': 'completed', 'output': 'secret output'},
            ]
            path.write_text('\n'.join(json.dumps(row) for row in rows), encoding='utf-8')
            result = recorded_history(path, 'sid', root)
            self.assertEqual(result['model'], 'observed-model')
            self.assertEqual(len(result['events']), 2)
            text = json.dumps(result)
            for hidden in ('private', 'user context', 'other task', 'secret output'): self.assertNotIn(hidden, text)

    def test_timeout_has_a_distinct_receipt_after_confirmed_cancel(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); helper = root/'helper.py'
            helper.write_text('import sys,json\nsys.stdin.readline()\nsys.stdin.readline()\nprint(json.dumps({"event":"cancelled"}),flush=True)\n', encoding='utf-8')
            with patch('agent_review_loop.execution.DRIVER', helper):
                receipt = native_run({'command': 'run'}, root/'run', sys.executable, timeout=.02)
            self.assertEqual(receipt['event'], 'cancelled')
            self.assertEqual(receipt['stop_reason'], 'timeout')

    def test_permission_answer_is_returned_to_same_helper_without_new_dispatch(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); helper = root/'helper.py'
            helper.write_text('import sys,json\nsys.stdin.readline()\n'
                              'print(json.dumps({"event":"permission_request","request_id":"native-1","params":{}}),flush=True)\n'
                              'answer=json.loads(sys.stdin.readline())\n'
                              'assert answer=={"command":"answer_permission","request_id":"native-1","option_id":"allow"}\n'
                              'print(json.dumps({"event":"turn_ended"}),flush=True)\n', encoding='utf-8')
            with patch('agent_review_loop.execution.DRIVER', helper):
                receipt = native_run({'command':'run'}, root/'run', sys.executable,
                                     on_event=lambda e: 'allow' if e['event']=='permission_request' else None)
            self.assertEqual(receipt['event'], 'turn_ended')

    def test_unanswered_permission_cancels_native_turn_before_closing_helper(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); helper = root/'helper.py'
            helper.write_text('import sys,json\nsys.stdin.readline()\n'
                              'print(json.dumps({"event":"permission_request","request_id":"native-1","params":{}}),flush=True)\n'
                              'assert json.loads(sys.stdin.readline())=={"command":"cancel"}\n'
                              'print(json.dumps({"event":"cancelled"}),flush=True)\n', encoding='utf-8')
            def event(value):
                if value['event']=='permission_request': raise TimeoutError('No user answer')
            with patch('agent_review_loop.execution.DRIVER', helper):
                receipt = native_run({'command':'run'}, root/'run', sys.executable, on_event=event)
            self.assertEqual(receipt['stop_reason'], 'input_timeout')
