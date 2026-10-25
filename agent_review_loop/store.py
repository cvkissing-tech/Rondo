"""Shared task state. SQLite transactions, not process-local locks, own writes.

Behavior references and adaptations are recorded in the open-source reuse spec.
This is a local, single-trusted-user store, not an authenticated team service.
"""

import hashlib
import hmac
import json
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


APPLICATION_ID = 0x41524C31  # ARL1: refuse unrelated SQLite files.
SCHEMA_VERSION = 2
SCHEMA = (
    """CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        instructions TEXT NOT NULL,
        acceptance TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'ready' CHECK (state IN ('ready', 'submitted')),
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""",
    """CREATE TABLE attempts (
        id TEXT PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        owner TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at REAL NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('active', 'expired', 'completed'))
    )""",
    """CREATE UNIQUE INDEX one_active_attempt
        ON attempts(task_id) WHERE state = 'active'""",
    """CREATE TABLE submissions (
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        attempt_id TEXT NOT NULL REFERENCES attempts(id),
        request_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        response TEXT NOT NULL,
        PRIMARY KEY (task_id, attempt_id, request_id)
    )""",
)

REVIEW_SCHEMA = (
    """CREATE TABLE review_jobs (
        id TEXT PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        request_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('preparing','running','cancelling','succeeded','failed','cancelled','interrupted')),
        repo TEXT NOT NULL,
        base_ref TEXT NOT NULL,
        directory TEXT NOT NULL,
        backend TEXT NOT NULL,
        cancel_requested INTEGER NOT NULL DEFAULT 0,
        snapshot_id TEXT,
        result_json TEXT,
        error_code TEXT,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL,
        UNIQUE(task_id, request_id)
    )""",
    """CREATE UNIQUE INDEX one_active_review_job ON review_jobs((1))
       WHERE state IN ('preparing','running','cancelling')""",
)


class StoreError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def _text(value, name, maximum):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise StoreError("INVALID_ARGUMENT", f"{name} must be nonblank text, at most {maximum} characters")
    return value


def _integer(value, name, minimum=1, maximum=2**63 - 1):
    if type(value) is not int or not minimum <= value <= maximum:
        raise StoreError("INVALID_ARGUMENT", f"{name} must be an integer between {minimum} and {maximum}")
    return value


def _digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _timestamp(now):
    return datetime.fromtimestamp(now, timezone.utc).isoformat()


class TaskStore:
    def __init__(self, path: Path, *, clock=time.time):
        self.path = Path(path).resolve()
        self.clock = clock
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection(write=True) as db:
            application_id = db.execute("PRAGMA application_id").fetchone()[0]
            version = db.execute("PRAGMA user_version").fetchone()[0]
            tables = db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            if application_id == 0 and version == 0 and not tables:
                for statement in SCHEMA + REVIEW_SCHEMA:
                    db.execute(statement)
                db.execute(f"PRAGMA application_id = {APPLICATION_ID}")
                db.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
            elif application_id != APPLICATION_ID:
                raise StoreError("FOREIGN_DATABASE", "This file is not an Agent Review Loop database")
            elif version == 1:
                for statement in REVIEW_SCHEMA:
                    db.execute(statement)
                db.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
            elif version != SCHEMA_VERSION:
                raise StoreError("SCHEMA_VERSION", "Database version is not supported by this build")

    @contextmanager
    def _connection(self, *, write=False):
        db = None
        try:
            db = sqlite3.connect(self.path, timeout=5, isolation_level=None)
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA foreign_keys = ON")
            # The write lock is shared by ALL processes using this database.
            if write:
                db.execute("BEGIN IMMEDIATE")
            else:
                db.execute("BEGIN")  # Keep multi-query reads on one snapshot.
            yield db
            db.commit()
        except sqlite3.Error as error:
            if db is not None:
                db.rollback()
            code = getattr(error, "sqlite_errorcode", 0) & 0xFF
            if code in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED):
                raise StoreError("STORE_BUSY", "Database is busy; inspect task state before retrying") from error
            raise StoreError("STORAGE_ERROR", "Database operation failed") from error
        except BaseException:
            if db is not None:
                db.rollback()
            raise
        finally:
            if db is not None:
                db.close()

    @staticmethod
    def _task(db, task_id):
        _integer(task_id, "task_id")
        row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise StoreError("TASK_NOT_FOUND", "Task does not exist")
        return row

    def create_task(self, title, instructions, acceptance):
        _text(title, "title", 160)
        _text(instructions, "instructions", 8000)
        _text(acceptance, "acceptance", 4000)
        timestamp = _timestamp(self.clock())
        with self._connection(write=True) as db:
            cursor = db.execute(
                "INSERT INTO tasks (title, instructions, acceptance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (title, instructions, acceptance, timestamp, timestamp),
            )
            return {"task_id": cursor.lastrowid, "status": "ready", "version": 1}

    @staticmethod
    def _projection(row, attempt, now):
        active = attempt is not None and attempt["expires_at"] > now
        return {
            "task_id": row["id"], "title": row["title"],
            "status": "claimed" if active else row["state"],
            "version": row["version"],
            "owner": attempt["owner"] if active else None,
            "lease_expires_at": attempt["expires_at"] if active else None,
        }

    def get_task(self, task_id):
        with self._connection() as db:
            row = self._task(db, task_id)
            attempt = db.execute("SELECT owner, expires_at FROM attempts WHERE task_id=? AND state='active'", (task_id,)).fetchone()
            result = self._projection(row, attempt, self.clock())
            submission = db.execute("SELECT response FROM submissions WHERE task_id=? LIMIT 1", (task_id,)).fetchone()
            result.update(
                instructions=row["instructions"], acceptance=row["acceptance"],
                result=json.loads(submission["response"]) if submission else None,
            )
            return result

    def list_tasks(self, limit=10, after_id=0):
        _integer(limit, "limit", 1, 20)
        _integer(after_id, "after_id", 0)
        now = self.clock()
        with self._connection() as db:
            rows = db.execute("SELECT id, title, state, version FROM tasks WHERE id > ? ORDER BY id LIMIT ?", (after_id, limit + 1)).fetchall()
            items = []
            for row in rows[:limit]:
                attempt = db.execute("SELECT owner, expires_at FROM attempts WHERE task_id=? AND state='active'", (row["id"],)).fetchone()
                items.append(self._projection(row, attempt, now))
            has_more = len(rows) > limit
            return {"items": items, "has_more": has_more, "next_after_id": items[-1]["task_id"] if has_more else None}

    def claim_task(self, task_id, owner, expected_version, lease_seconds=900):
        _text(owner, "owner", 80)
        _integer(expected_version, "expected_version")
        _integer(lease_seconds, "lease_seconds", 30, 3600)
        with self._connection(write=True) as db:
            row = self._task(db, task_id)
            now = self.clock()  # Read after acquiring the lock, not before waiting.
            if row["state"] == "submitted":
                raise StoreError("TASK_SUBMITTED", "This task already has a submitted result")
            active = db.execute("SELECT expires_at FROM attempts WHERE task_id=? AND state='active'", (task_id,)).fetchone()
            if active and active["expires_at"] > now:
                raise StoreError("TASK_CLAIMED", "Another attempt holds this task; read its state before proceeding")
            if row["version"] != expected_version:
                raise StoreError("VERSION_CONFLICT", "Task changed; read the current version")
            db.execute("UPDATE attempts SET state='expired' WHERE task_id=? AND state='active'", (task_id,))
            attempt_id, token = uuid.uuid4().hex, secrets.token_urlsafe(32)
            expires_at = now + lease_seconds
            db.execute(
                "INSERT INTO attempts (id, task_id, owner, token_hash, expires_at, state) VALUES (?, ?, ?, ?, ?, 'active')",
                (attempt_id, task_id, owner, _digest(token), expires_at),
            )
            db.execute("UPDATE tasks SET version=version+1, updated_at=? WHERE id=?", (_timestamp(now), task_id))
            return {
                "task_id": task_id, "status": "claimed", "version": row["version"] + 1,
                "attempt_id": attempt_id, "claim_token": token, "lease_expires_at": expires_at,
            }

    @staticmethod
    def _attempt(db, task_id, attempt_id, claim_token):
        _text(attempt_id, "attempt_id", 64)
        _text(claim_token, "claim_token", 128)
        row = db.execute("SELECT * FROM attempts WHERE id=? AND task_id=?", (attempt_id, task_id)).fetchone()
        if row is None or not hmac.compare_digest(row["token_hash"], _digest(claim_token)):
            raise StoreError("INVALID_CLAIM", "Attempt or claim token is invalid")
        return row

    @staticmethod
    def _require_active(attempt, now):
        if attempt["state"] != "active":
            raise StoreError("ATTEMPT_INACTIVE", "This attempt is no longer active")
        if attempt["expires_at"] <= now:
            raise StoreError("LEASE_EXPIRED", "Claim expired; read the task and claim a new attempt")

    def renew_claim(self, task_id, attempt_id, claim_token, lease_seconds=900):
        _integer(task_id, "task_id")
        _integer(lease_seconds, "lease_seconds", 30, 3600)
        with self._connection(write=True) as db:
            attempt = self._attempt(db, task_id, attempt_id, claim_token)
            now = self.clock()
            self._require_active(attempt, now)
            expires_at = max(attempt["expires_at"], now + lease_seconds)
            db.execute("UPDATE attempts SET expires_at=? WHERE id=?", (expires_at, attempt_id))
            return {"task_id": task_id, "attempt_id": attempt_id, "lease_expires_at": expires_at}

    def submit_result(self, task_id, attempt_id, claim_token, expected_version, summary, request_id):
        _integer(task_id, "task_id")
        _integer(expected_version, "expected_version")
        _text(summary, "summary", 4000)
        _text(request_id, "request_id", 128)
        fingerprint = _digest(json.dumps([expected_version, summary], ensure_ascii=False))
        with self._connection(write=True) as db:
            attempt = self._attempt(db, task_id, attempt_id, claim_token)
            previous = db.execute(
                "SELECT fingerprint, response FROM submissions WHERE task_id=? AND attempt_id=? AND request_id=?",
                (task_id, attempt_id, request_id),
            ).fetchone()
            if previous:
                if previous["fingerprint"] != fingerprint:
                    raise StoreError("IDEMPOTENCY_CONFLICT", "This request_id already belongs to different result content")
                return json.loads(previous["response"])
            now = self.clock()
            self._require_active(attempt, now)
            row = self._task(db, task_id)
            if row["version"] != expected_version:
                raise StoreError("VERSION_CONFLICT", "Task changed; result was not submitted")
            receipt = {
                "task_id": task_id, "attempt_id": attempt_id, "status": "submitted",
                "version": row["version"] + 1, "summary": summary,
            }
            # All three writes commit together; a lost reply can safely be retried.
            db.execute("UPDATE tasks SET state='submitted', version=version+1, updated_at=? WHERE id=?", (_timestamp(now), task_id))
            db.execute("UPDATE attempts SET state='completed' WHERE id=?", (attempt_id,))
            db.execute(
                "INSERT INTO submissions (task_id, attempt_id, request_id, fingerprint, response) VALUES (?, ?, ?, ?, ?)",
                (task_id, attempt_id, request_id, fingerprint, json.dumps(receipt, ensure_ascii=False)),
            )
            return receipt
