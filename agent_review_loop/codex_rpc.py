"""Small synchronous App Server stdio client; native server remains the agent harness."""

from collections import deque
import json
import queue
import threading
import time

from .processes import ProcessTree


class RpcError(Exception):
    pass


class ReviewCancelled(RpcError):
    pass


class CodexRpc:
    def __init__(self, argv, cwd, stderr_path, *, env=None, cancel_check=None):
        self.process = ProcessTree(argv, cwd, stderr_path, env=env)
        self._messages = queue.Queue(maxsize=256)
        self._notifications = deque()
        self._counter = 0
        self._closed = False
        self._cancel_check = cancel_check
        self._reader_error = None
        self._writer_error = None
        self._writes = queue.Queue(maxsize=16)
        self._reader = threading.Thread(target=self._read, daemon=True)
        self._writer = threading.Thread(target=self._write, daemon=True)
        self._reader.start()
        self._writer.start()

    def _write(self):
        try:
            while True:
                data = self._writes.get()
                if data is None:
                    return
                remaining = memoryview(data)
                while remaining:
                    written = self.process.stdin.write(remaining)
                    if not written:
                        raise RpcError('App Server input closed')
                    remaining = remaining[written:]
        except Exception as error:
            self._writer_error = error

    def _read(self):
        try:
            while True:
                line = self.process.stdout.readline(8 * 1024 * 1024 + 1)
                if not line:
                    self._messages.put(None, timeout=.2)
                    return
                if len(line) > 8 * 1024 * 1024:
                    raise RpcError('Protocol line exceeds 8 MiB')
                value = json.loads(line)
                if not isinstance(value, dict):
                    raise RpcError('Expected a protocol object')
                self._messages.put(value, timeout=.2)
        except Exception as error:
            self._reader_error = error

    def send(self, value):
        if self._closed:
            raise RpcError('App Server client is closed')
        data = json.dumps(value, ensure_ascii=False).encode('utf-8') + b'\n'
        if len(data) > 8 * 1024 * 1024:
            raise RpcError('Outgoing protocol line exceeds 8 MiB')
        try:
            self._writes.put_nowait(data)
        except queue.Full as error:
            raise RpcError('App Server write queue is full') from error

    def _receive(self, deadline, *, ignore_cancel=False):
        while True:
            if not ignore_cancel and self._cancel_check and self._cancel_check():
                raise ReviewCancelled('Review cancellation requested')
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('App Server request exceeded its deadline')
            if self._reader_error:
                raise RpcError(f'App Server stream failed: {type(self._reader_error).__name__}') from self._reader_error
            if self._writer_error:
                raise RpcError('App Server input failed') from self._writer_error
            try:
                value = self._messages.get(timeout=min(remaining, .1))
            except queue.Empty:
                continue
            if value is None:
                raise RpcError('App Server disconnected before a result')
            if 'method' in value and 'id' in value:
                # This transport cannot grant approvals or execute client-side tools.
                self.send({'id': value['id'], 'error': {'code': -32601, 'message': 'Interactive requests are unsupported by this bounded client'}})
                raise RpcError('App Server needs an interactive capability; execution stopped')
            return value

    def request(self, method, params, *, timeout=20, ignore_cancel=False):
        self._counter += 1
        request_id = self._counter
        self.send({'id': request_id, 'method': method, 'params': params})
        deadline = time.monotonic() + timeout
        while True:
            message = self._receive(deadline, ignore_cancel=ignore_cancel)
            if type(message.get('id')) is int and message['id'] == request_id:
                if 'error' in message:
                    raise RpcError(f'{method}: {message["error"]}')
                if 'result' not in message:
                    raise RpcError('Response has no result')
                return message['result']
            if 'method' not in message:
                raise RpcError('Unexpected response ID')
            if len(self._notifications) >= 1000:
                raise RpcError('Unconsumed notifications exceeded the limit')
            self._notifications.append(message)

    def notification(self, *, timeout=20, ignore_cancel=False):
        if not ignore_cancel and self._cancel_check and self._cancel_check():
            raise ReviewCancelled('Review cancellation requested')
        if self._notifications:
            return self._notifications.popleft()
        value = self._receive(time.monotonic() + timeout, ignore_cancel=ignore_cancel)
        if 'method' not in value:
            raise RpcError('Expected a notification')
        return value

    def initialize(self):
        result = self.request('initialize', {'clientInfo': {'name': 'agent_review_loop', 'version': '0.7.0'},
                                              'capabilities': {'experimentalApi': False}})
        self.send({'method': 'initialized', 'params': {}})
        return result

    def close(self):
        if self._closed:
            return
        try:
            try:
                self._writes.put_nowait(None)
            except queue.Full:
                pass  # Terminating the process unblocks a pending writer.
            self.process.close()
        finally:
            self._closed = True
            self._reader.join(timeout=2)
            self._writer.join(timeout=2)
        if self._reader.is_alive() or self._writer.is_alive():
            raise RpcError('Protocol I/O workers did not exit')

    def __enter__(self):
        return self

    def __exit__(self, *unused):
        self.close()
