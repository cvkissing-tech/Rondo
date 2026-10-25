"""Behavior checks: durable handoffs, stale attempts, and independent processes."""

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from agent_review_loop.store import StoreError, TaskStore


class TaskStoreTests(unittest.TestCase):
    def test_schema_one_migration_preserves_existing_rows(self):
        import sqlite3
        from contextlib import closing
        from agent_review_loop.store import SCHEMA, APPLICATION_ID, SCHEMA_VERSION
        old = Path(self.temp.name) / 'schema-one.db'
        with closing(sqlite3.connect(old)) as db:
            for statement in SCHEMA:
                db.execute(statement)
            db.execute(f'PRAGMA application_id={APPLICATION_ID}')
            db.execute('PRAGMA user_version=1')
            db.execute("INSERT INTO tasks(title,instructions,acceptance,created_at,updated_at) VALUES ('keep','instructions','acceptance','then','then')")
            db.commit()
            before = db.execute('SELECT * FROM tasks').fetchall()
        migrated = TaskStore(old)
        self.assertEqual(migrated.get_task(1)['title'], 'keep')
        with closing(sqlite3.connect(old)) as db:
            self.assertEqual(db.execute('SELECT * FROM tasks').fetchall(), before)
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0], SCHEMA_VERSION)
            self.assertEqual(db.execute('SELECT count(*) FROM review_jobs').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT count(*) FROM task_launches').fetchone()[0], 0)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="任务 协作 ")
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "tasks.sqlite3"
        self.now = 1000.0
        self.store = TaskStore(self.path, clock=lambda: self.now)

    def task(self, title="修复边界条件"):
        return self.store.create_task(title, "只修改示例函数", "输入为空时返回空列表")

    def assert_code(self, code, operation):
        with self.assertRaises(StoreError) as caught:
            operation()
        self.assertEqual(caught.exception.code, code)

    def test_claim_submit_and_restart_replay(self):
        task = self.task()
        claim = self.store.claim_task(task["task_id"], "worker", task["version"])
        self.assert_code("TASK_CLAIMED", lambda: self.store.claim_task(task["task_id"], "other", 1))
        args = (task["task_id"], claim["attempt_id"], claim["claim_token"], claim["version"], "已完成合成任务", "submit-1")
        receipt = self.store.submit_result(*args)
        self.assertEqual(receipt["status"], "submitted")
        restarted = TaskStore(self.path, clock=lambda: self.now)
        self.assertEqual(restarted.submit_result(*args), receipt)
        detail = restarted.get_task(task["task_id"])
        self.assertEqual(detail["result"]["summary"], "已完成合成任务")
        self.assertNotIn(claim["claim_token"], json.dumps(detail))
        self.assertNotIn(claim["claim_token"], json.dumps(restarted.list_tasks()))
        self.assert_code("IDEMPOTENCY_CONFLICT", lambda: restarted.submit_result(*args[:4], "换了结果", args[5]))
        self.assert_code("INVALID_CLAIM", lambda: restarted.submit_result(args[0], args[1], "wrong-token", *args[3:]))

    def test_expiry_reclaim_and_renewal(self):
        task = self.task()
        first = self.store.claim_task(task["task_id"], "first", 1, lease_seconds=30)
        self.now += 31
        detail = self.store.get_task(task["task_id"])
        self.assertEqual(detail["status"], "ready")
        self.assert_code("LEASE_EXPIRED", lambda: self.store.submit_result(task["task_id"], first["attempt_id"], first["claim_token"], first["version"], "late", "late"))
        second = self.store.claim_task(task["task_id"], "second", detail["version"], lease_seconds=30)
        self.assertNotEqual(first["attempt_id"], second["attempt_id"])
        self.assert_code("ATTEMPT_INACTIVE", lambda: self.store.submit_result(task["task_id"], first["attempt_id"], first["claim_token"], first["version"], "old", "old"))
        self.now += 20
        self.store.renew_claim(task["task_id"], second["attempt_id"], second["claim_token"], 60)
        self.now += 20
        self.assertEqual(self.store.get_task(task["task_id"])["status"], "claimed")
        self.assert_code("VERSION_CONFLICT", lambda: self.store.submit_result(task["task_id"], second["attempt_id"], second["claim_token"], 1, "stale", "stale"))

    def test_list_is_bounded_and_omits_long_bodies(self):
        for index in range(4):
            self.store.create_task(f"task-{index}", "x" * 8000, "y" * 4000)
        first = self.store.list_tasks(limit=2)
        self.assertEqual(len(first["items"]), 2)
        self.assertTrue(first["has_more"])
        second = self.store.list_tasks(limit=2, after_id=first["next_after_id"])
        self.assertFalse(second["has_more"])
        self.assertEqual(len({t["task_id"] for t in first["items"] + second["items"]}), 4)
        self.assertNotIn("instructions", first["items"][0])
        self.assertLess(len(json.dumps(first).encode()), 4096)

    def test_invalid_requests_and_foreign_database_are_rejected(self):
        self.assert_code("INVALID_ARGUMENT", lambda: self.task("  "))
        self.assert_code("INVALID_ARGUMENT", lambda: self.store.list_tasks(limit=1000))
        self.assert_code("INVALID_ARGUMENT", lambda: self.store.get_task(True))
        self.assert_code("TASK_NOT_FOUND", lambda: self.store.get_task(999))
        other = Path(self.temp.name) / "foreign.db"
        with closing(sqlite3.connect(other)) as db:
            db.execute("CREATE TABLE private_data (value TEXT)")
            db.execute("INSERT INTO private_data VALUES ('keep')")
            db.commit()
        self.assert_code("FOREIGN_DATABASE", lambda: TaskStore(other))
        with closing(sqlite3.connect(other)) as db:
            self.assertEqual(db.execute("SELECT value FROM private_data").fetchone()[0], "keep")
        not_sqlite = Path(self.temp.name) / "notes.db"
        not_sqlite.write_bytes(b"this is a document, not a database")
        self.assert_code("STORAGE_ERROR", lambda: TaskStore(not_sqlite))
        self.assertEqual(not_sqlite.read_bytes(), b"this is a document, not a database")

    def test_future_database_version_is_not_silently_downgraded(self):
        with closing(sqlite3.connect(self.path)) as db:
            db.execute("PRAGMA user_version = 99")
        self.assert_code("SCHEMA_VERSION", lambda: TaskStore(self.path))
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 99)

    def test_renewal_cannot_shorten_claim_or_use_another_token(self):
        task = self.task()
        claim = self.store.claim_task(task["task_id"], "worker", 1, lease_seconds=120)
        self.now += 10
        renewed = self.store.renew_claim(task["task_id"], claim["attempt_id"], claim["claim_token"], 30)
        self.assertEqual(renewed["lease_expires_at"], claim["lease_expires_at"])
        self.assert_code("INVALID_CLAIM", lambda: self.store.renew_claim(task["task_id"], claim["attempt_id"], "wrong-token"))
        self.assertEqual(self.store.get_task(task["task_id"])["lease_expires_at"], claim["lease_expires_at"])

    def test_two_independent_processes_have_one_claim_winner(self):
        # All processes initialize independently, then wait at a filesystem barrier.
        task = self.task()
        barrier = Path(self.temp.name) / "go"
        script = """
import json, pathlib, sys, time
from agent_review_loop.store import TaskStore, StoreError
store = TaskStore(pathlib.Path(sys.argv[1]))
pathlib.Path(sys.argv[3]).touch()
deadline = time.monotonic() + 15
while not pathlib.Path(sys.argv[2]).exists():
    if time.monotonic() > deadline: raise TimeoutError('barrier')
    time.sleep(0.01)
try:
    result = store.claim_task(int(sys.argv[4]), sys.argv[5], 1)
    print(json.dumps({'outcome': 'claimed', 'attempt_id': result['attempt_id']}))
except StoreError as error:
    print(json.dumps({'outcome': error.code}))
"""
        workers = []
        for index in range(2):
            ready = Path(self.temp.name) / f"ready-{index}"
            process = subprocess.Popen(
                [sys.executable, "-X", "utf8", "-c", script, str(self.path), str(barrier), str(ready), str(task["task_id"]), f"worker-{index}"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8",
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            workers.append((process, ready))
            self.addCleanup(lambda p=process: p.kill() if p.poll() is None else None)
        import time
        deadline = time.monotonic() + 15
        while not all(ready.exists() for _, ready in workers):
            if time.monotonic() > deadline:
                self.fail("workers did not reach the barrier")
            time.sleep(0.01)
        barrier.touch()
        outcomes = []
        for process, _ in workers:
            stdout, stderr = process.communicate(timeout=15)
            self.assertEqual(process.returncode, 0, stderr)
            outcomes.append(json.loads(stdout)["outcome"])
        self.assertCountEqual(outcomes, ["claimed", "TASK_CLAIMED"])
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM attempts WHERE state='active'").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
