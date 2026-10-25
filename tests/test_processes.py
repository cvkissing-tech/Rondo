import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

from agent_review_loop.processes import ProcessTree


class ProcessTreeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='进程 空格 ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def start(self, code, *extra):
        process = ProcessTree([sys.executable, '-X', 'utf8', '-c', code, *extra], self.root, self.root / 'stderr.log')
        self.addCleanup(process.close)
        return process

    def test_stdio_and_unicode_arguments_are_literal(self):
        process = self.start('import sys,json,os; print(json.dumps([sys.argv[1],sys.stdin.readline().strip(),os.getcwd()])); print("err",file=sys.stderr)', '中文 & $()')
        process.stdin.write('输入\n'.encode())
        process.stdin.close()
        result = json.loads(process.stdout.readline())
        self.assertEqual(result, ['中文 & $()', '输入', str(self.root)])
        self.assertEqual(process.wait(), 0)
        process.close()
        self.assertIn('err', (self.root / 'stderr.log').read_text())

    @unittest.skipUnless(os.name == 'nt', 'Windows Job membership and native process handles')
    def test_job_kills_descendant_after_parent_exits(self):
        import _winapi
        child_code = 'import time; print("child-ready",flush=True); time.sleep(60)'
        code = 'import subprocess,sys; p=subprocess.Popen([sys.executable,"-u","-c",sys.argv[1]],stdout=subprocess.PIPE); p.stdout.readline(); print(p.pid,flush=True)'
        process = self.start(code, child_code)
        child_pid = int(process.stdout.readline())
        child_handle = _winapi.OpenProcess(0x100000, False, child_pid)  # SYNCHRONIZE, retains birth identity.
        try:
            self.assertEqual(process.wait(), 0)
            self.assertEqual(_winapi.WaitForSingleObject(child_handle, 0), 258)
            process.close()
            self.assertEqual(_winapi.WaitForSingleObject(child_handle, 5000), 0)
        finally:
            _winapi.CloseHandle(child_handle)

    def test_timeout_then_close(self):
        process = self.start('import time; print("ready",flush=True); time.sleep(60)')
        self.assertEqual(process.stdout.readline().strip(), b'ready')
        with self.assertRaises(TimeoutError):
            process.wait(timeout=.05)
        process.close()

    @unittest.skipUnless(os.name == 'nt', 'Windows Job descendant exit handles')
    def test_cancel_terminates_parent_child_and_grandchild(self):
        import _winapi
        grandchild = 'import time; print("ready",flush=True); time.sleep(60)'
        child = ('import subprocess,sys,os,json,time; '
                 'p=subprocess.Popen([sys.executable,"-u","-c",sys.argv[1]],stdout=subprocess.PIPE); '
                 'p.stdout.readline(); print(json.dumps([os.getpid(),p.pid]),flush=True); time.sleep(60)')
        parent = ('import subprocess,sys,time; '
                  'p=subprocess.Popen([sys.executable,"-u","-c",sys.argv[1],sys.argv[2]],stdout=subprocess.PIPE); '
                  'print(p.stdout.readline().decode().strip(),flush=True); time.sleep(60)')
        process = self.start(parent, child, grandchild)
        children = json.loads(process.stdout.readline())
        handles = [_winapi.OpenProcess(0x100000, False, pid) for pid in children]
        try:
            self.assertIsNone(process.poll())
            process.close()
            self.assertTrue(all(_winapi.WaitForSingleObject(handle, 5000) == 0 for handle in handles))
        finally:
            for handle in handles:
                _winapi.CloseHandle(handle)

    @unittest.skipUnless(os.name == 'nt', 'Fail closed before Windows ResumeThread')
    def test_failed_job_assignment_never_executes_child(self):
        marker = self.root / 'must-not-exist'
        with patch('agent_review_loop.processes.kernel.AssignProcessToJobObject', return_value=0):
            with self.assertRaises(OSError):
                self.start(f'from pathlib import Path; Path({str(marker)!r}).touch()')
        self.assertFalse(marker.exists())

    @unittest.skipUnless(os.name == 'nt', 'Windows kill-on-Job-owner-exit')
    def test_owner_process_death_closes_job_and_stops_agent(self):
        import _winapi
        code = '''import os,sys
from pathlib import Path
from agent_review_loop.processes import ProcessTree
p=ProcessTree([sys.executable,'-u','-c','import time; print("ready",flush=True); time.sleep(60)'],Path(sys.argv[1]),Path(sys.argv[1])/'agent.stderr')
p.stdout.readline()
print(p.pid,flush=True)
sys.stdin.readline()
os._exit(0)
'''
        with subprocess.Popen([sys.executable, '-X', 'utf8', '-u', '-c', code, str(self.root)],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              creationflags=subprocess.CREATE_NO_WINDOW) as owner:
            pid = int(owner.stdout.readline())
            handle = _winapi.OpenProcess(0x100000, False, pid)
            try:
                owner.stdin.write(b'exit\n')
                owner.stdin.flush()
                self.assertEqual(owner.wait(timeout=5), 0)
                self.assertEqual(_winapi.WaitForSingleObject(handle, 5000), 0)
            finally:
                _winapi.CloseHandle(handle)


if __name__ == '__main__':
    unittest.main()
