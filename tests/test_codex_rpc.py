import os
from pathlib import Path
import sys
import tempfile
import time
import threading
import unittest

from agent_review_loop.codex_rpc import CodexRpc, RpcError, ReviewCancelled


class CodexRpcTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='RPC 合成 ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def client(self, script, **kwargs):
        client = CodexRpc([sys.executable, '-X', 'utf8', '-u', '-c', script], self.root, self.root / 'stderr.log', **kwargs)
        self.addCleanup(client.close)
        return client

    def test_fragmented_responses_and_notification_before_result(self):
        script = '''import json,sys,os
for line in sys.stdin:
 v=json.loads(line)
 if 'id' not in v: continue
 print(json.dumps({'method':'notice','params':{'kind':'before-response'}}),flush=True)
 payload=(json.dumps({'id':v['id'],'result':{'echo':v['params']}})+'\\n').encode()
 os.write(sys.stdout.fileno(),payload[:3]); os.write(sys.stdout.fileno(),payload[3:])
'''
        client = self.client(script)
        self.assertEqual(client.request('echo', {'value': '中文'}), {'echo': {'value': '中文'}})
        self.assertEqual(client.notification()['params']['kind'], 'before-response')

    def test_errors_and_eof_are_not_success(self):
        client = self.client('import sys,json; v=json.loads(sys.stdin.readline()); print(json.dumps({"id":v["id"],"error":{"code":-1,"message":"synthetic"}}),flush=True)')
        with self.assertRaises(RpcError):
            client.request('fail', {})
        with self.assertRaises(RpcError):
            client.notification()

    def test_malformed_stream_is_rejected(self):
        client = self.client('import sys; sys.stdin.readline(); print("not-json",flush=True)')
        with self.assertRaises(RpcError):
            client.request('fail', {})

    def test_unhandled_server_request_cannot_run_client_tools(self):
        client = self.client('import sys,json; sys.stdin.readline(); print(json.dumps({"id":7,"method":"item/tool/call","params":{}}),flush=True); sys.stdin.readline()')
        with self.assertRaises(RpcError):
            client.request('test', {})

    def test_blocked_writer_obeys_deadline_and_closes(self):
        client = self.client('import time; time.sleep(60)')
        started = time.monotonic()
        with self.assertRaises(TimeoutError):
            client.request('large', {'payload': 'x' * 1000000}, timeout=.1)
        client.close()
        self.assertLess(time.monotonic() - started, 5)

    def test_cancellation_interrupts_wait_after_server_actually_started(self):
        cancelled = threading.Event()
        marker = self.root / 'started'
        script = f'import sys,time; from pathlib import Path; sys.stdin.readline(); Path({str(marker)!r}).touch(); time.sleep(60)'
        client = self.client(script, cancel_check=cancelled.is_set)
        errors = []
        def request():
            try:
                client.request('wait', {}, timeout=10)
            except Exception as error:
                errors.append(error)
        worker = threading.Thread(target=request)
        worker.start()
        deadline = time.monotonic() + 5
        while not marker.exists() and time.monotonic() < deadline:
            time.sleep(.01)
        self.assertTrue(marker.exists())
        cancelled.set()
        worker.join(timeout=2)
        self.assertFalse(worker.is_alive())
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], ReviewCancelled)
        client.close()


if __name__ == '__main__':
    unittest.main()
