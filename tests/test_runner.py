import json
import sys
import tempfile
import time
import unittest
from pathlib import Path

from agent_review_loop.runner import run_process


class ProcessRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="协作 空格 ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = self.root / "run-1"

    def run_script(self, script, prompt="", timeout=10):
        return run_process(
            [sys.executable, "-X", "utf8", "-c", script],
            self.root,
            prompt,
            self.output,
            timeout,
        )

    def read_record(self):
        return json.loads((self.output / "result.json").read_text(encoding="utf-8"))

    def test_unicode_input_separate_logs_and_working_directory(self):
        prompt = "审查要求 & echo literal; $(literal)"
        result = self.run_script(
            "import json, os, sys; "
            "print(json.dumps({'prompt': sys.stdin.read(), 'cwd': os.getcwd()}, ensure_ascii=False)); "
            "print('诊断信息', file=sys.stderr)",
            prompt,
        )
        self.assertEqual((result.status, result.exit_code), ("completed", 0))
        payload = json.loads(result.stdout_path.read_text(encoding="utf-8"))
        self.assertEqual(payload["prompt"], prompt)
        self.assertEqual(Path(payload["cwd"]), self.root)
        self.assertEqual(result.stderr_path.read_text(encoding="utf-8").strip(), "诊断信息")
        self.assertEqual(
            self.read_record(),
            {
                "status": "completed",
                "exit_code": 0,
                "stdout_path": str(result.stdout_path),
                "stderr_path": str(result.stderr_path),
            },
        )

    def test_nonzero_exit_preserves_output(self):
        result = self.run_script("import sys; print('partial result'); sys.exit(7)")
        self.assertEqual((result.status, result.exit_code), ("failed", 7))
        self.assertIn("partial result", result.stdout_path.read_text(encoding="utf-8"))
        self.assertEqual(self.read_record()["exit_code"], 7)

    def test_missing_executable_is_a_recorded_failure(self):
        result = run_process(
            [str(self.root / "missing-program.exe")],
            self.root, "", self.output, 10,
        )
        self.assertEqual((result.status, result.exit_code), ("failed", None))
        self.assertTrue(result.stderr_path.read_text(encoding="utf-8"))
        self.assertEqual(self.read_record()["status"], "failed")

    def test_timeout_preserves_partial_output_and_waits_for_exit(self):
        started = time.monotonic()
        result = self.run_script(
            "import time; print('started', flush=True); time.sleep(60)",
            timeout=1,
        )
        self.assertEqual(result.status, "timed_out")
        self.assertIsNotNone(result.exit_code)
        self.assertLess(time.monotonic() - started, 10)
        self.assertIn("started", result.stdout_path.read_text(encoding="utf-8"))
        self.assertEqual(self.read_record()["status"], "timed_out")

    def test_existing_output_is_not_overwritten(self):
        self.run_script("print('original')")
        before = {p.name: p.read_bytes() for p in self.output.iterdir()}
        with self.assertRaises(FileExistsError):
            self.run_script("print('replacement')")
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.output.iterdir()})

    def test_invalid_timeout_does_not_create_output(self):
        for value in (0, -1, float("nan"), float("inf")):
            with self.subTest(timeout=value), self.assertRaises(ValueError):
                self.run_script("print('must not run')", timeout=value)
            self.assertFalse(self.output.exists())

    def test_invalid_working_directory_does_not_create_output(self):
        for cwd in (self.root / "missing", self.root / "plain-file"):
            if cwd.name == "plain-file":
                cwd.write_text("data", encoding="utf-8")
            with self.subTest(cwd=cwd), self.assertRaises(NotADirectoryError):
                run_process([sys.executable, "-c", "pass"], cwd, "", self.output, 10)
            self.assertFalse(self.output.exists())

    def test_invalid_arguments_do_not_create_output(self):
        for argv in ([], "echo unsafe", [sys.executable, 42]):
            with self.subTest(argv=argv), self.assertRaises(ValueError):
                run_process(argv, self.root, "", self.output, 10)
            self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
