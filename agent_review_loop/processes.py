"""Own a process tree for stdio agents. Windows children cannot run before Job assignment."""

import os
import io
from pathlib import Path
import signal
import subprocess
import time


if os.name == 'nt':
    import _winapi
    import ctypes as c
    from ctypes import wintypes as w
    import msvcrt

    kernel = c.WinDLL('kernel32', use_last_error=True)

    class BasicLimits(c.Structure):
        _fields_ = [('process_time', c.c_int64), ('job_time', c.c_int64), ('flags', w.DWORD),
                    ('min_working_set', c.c_size_t), ('max_working_set', c.c_size_t),
                    ('active_limit', w.DWORD), ('affinity', c.c_size_t),
                    ('priority', w.DWORD), ('scheduling', w.DWORD)]

    class ExtendedLimits(c.Structure):
        _fields_ = [('basic', BasicLimits), ('io', c.c_uint64 * 6),
                    ('process_memory', c.c_size_t), ('job_memory', c.c_size_t),
                    ('peak_process_memory', c.c_size_t), ('peak_job_memory', c.c_size_t)]

    class Accounting(c.Structure):
        _fields_ = [('times', c.c_int64 * 4), ('faults', w.DWORD), ('total', w.DWORD),
                    ('active', w.DWORD), ('terminated', w.DWORD)]

    for name, args, result in (
        ('CreateJobObjectW', [c.c_void_p, w.LPCWSTR], w.HANDLE),
        ('SetInformationJobObject', [w.HANDLE, c.c_int, c.c_void_p, w.DWORD], w.BOOL),
        ('AssignProcessToJobObject', [w.HANDLE, w.HANDLE], w.BOOL),
        ('ResumeThread', [w.HANDLE], w.DWORD),
        ('TerminateJobObject', [w.HANDLE, w.UINT], w.BOOL),
        ('QueryInformationJobObject', [w.HANDLE, c.c_int, c.c_void_p, w.DWORD, c.c_void_p], w.BOOL),
    ):
        function = getattr(kernel, name)
        function.argtypes, function.restype = args, result

    def _checked(result):
        if not result:
            raise c.WinError(c.get_last_error())
        return result


class ProcessTree:
    def __init__(self, argv, cwd, stderr_path, *, env=None):
        if (not isinstance(argv, list) or not argv or not all(isinstance(v, str) and '\0' not in v for v in argv)
                or not Path(argv[0]).is_absolute()):
            raise ValueError('Use an absolute executable and an argv list')
        self._stderr = Path(stderr_path).open('xb')
        self._closed = False
        self._job = self._handle = None
        try:
            if os.name != 'nt':
                self._process = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.PIPE,
                                                 stdout=subprocess.PIPE, stderr=self._stderr,
                                                 start_new_session=True, bufsize=0)
                self.pid = self._process.pid
                self.stdin, self.stdout = self._process.stdin, self._process.stdout
            else:
                self._start_windows(argv, cwd, env)
        except BaseException:
            self._stderr.close()
            raise

    def _start_windows(self, argv, cwd, env):
        in_read, in_write = os.pipe()
        out_read, out_write = os.pipe()
        handles = [msvcrt.get_osfhandle(fd) for fd in (in_read, out_write, self._stderr.fileno())]
        thread = None
        try:
            self._job = _checked(kernel.CreateJobObjectW(None, None))
            limits = ExtendedLimits()
            limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, no breakaway flags.
            _checked(kernel.SetInformationJobObject(self._job, 9, c.byref(limits), c.sizeof(limits)))
            startup = subprocess.STARTUPINFO()
            startup.dwFlags = subprocess.STARTF_USESTDHANDLES
            startup.hStdInput, startup.hStdOutput, startup.hStdError = handles
            startup.lpAttributeList = {'handle_list': handles}
            for handle in handles:
                os.set_handle_inheritable(handle, True)
            self._handle, thread, self.pid, _ = _winapi.CreateProcess(
                argv[0], subprocess.list2cmdline(argv), None, None, True,
                0x4 | subprocess.CREATE_NO_WINDOW, env, str(cwd), startup,
            )  # CREATE_SUSPENDED: absolutely no child code executes yet.
            _checked(kernel.AssignProcessToJobObject(self._job, self._handle))
            if kernel.ResumeThread(thread) == 0xFFFFFFFF:
                raise c.WinError(c.get_last_error())
            self.stdin = os.fdopen(in_write, 'wb', buffering=0)
            self.stdout = io.BufferedReader(os.fdopen(out_read, 'rb', buffering=0))
        except BaseException:
            if self._handle is not None:
                _winapi.TerminateProcess(self._handle, 1)
                _winapi.WaitForSingleObject(self._handle, 5000)
                _winapi.CloseHandle(self._handle)
            if self._job is not None:
                _winapi.CloseHandle(self._job)
            os.close(in_write)
            os.close(out_read)
            raise
        finally:
            if thread is not None:
                _winapi.CloseHandle(thread)
            for handle in handles:
                os.set_handle_inheritable(handle, False)
            os.close(in_read)
            os.close(out_write)

    def poll(self):
        if os.name != 'nt':
            return self._process.poll()
        if _winapi.WaitForSingleObject(self._handle, 0) == 258:
            return None
        return _winapi.GetExitCodeProcess(self._handle)

    def wait(self, timeout=5):
        deadline = time.monotonic() + timeout
        while self.poll() is None:
            if time.monotonic() >= deadline:
                raise TimeoutError('Process did not exit before the deadline')
            time.sleep(.02)
        return self.poll()

    def close(self):
        if self._closed:
            return
        try:
            if os.name == 'nt':
                _checked(kernel.TerminateJobObject(self._job, 1))
                deadline = time.monotonic() + 5
                while True:
                    info = Accounting()
                    _checked(kernel.QueryInformationJobObject(self._job, 1, c.byref(info), c.sizeof(info), None))
                    if info.active == 0:
                        break
                    if time.monotonic() >= deadline:
                        raise TimeoutError('Job still has live processes after termination')
                    time.sleep(.02)
                self.wait(timeout=5)  # Wait for process teardown, including inherited file handles.
            else:
                try:
                    os.killpg(self.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                self._process.wait(timeout=5)
        finally:
            if os.name == 'nt':
                _winapi.CloseHandle(self._job)
                _winapi.CloseHandle(self._handle)
            self.stdin.close()
            self.stdout.close()
            self._stderr.close()
            self._closed = True

    def __enter__(self):
        return self

    def __exit__(self, *unused):
        self.close()
