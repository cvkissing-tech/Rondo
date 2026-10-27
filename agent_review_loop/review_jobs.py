"""Durable, single-flight reviews. OS locks identify owners; SQLite owns transitions."""

import errno
import json
import os
from pathlib import Path
import re
import shutil
import threading
import time
from uuid import uuid4

from .codex_review import run_codex_review
from .native_session import read_state
from .agents import task_agents, require_agent, node_executable, codex_executable
from .checks import run_checks, validate_config
from .reviews import review_status
from .snapshots import SnapshotError, bind_check_evidence, canonical, create_review_package, digest
from .store import StoreError, TaskStore, _integer, _text


ACTIVE = ('preparing', 'running', 'cancelling')


class _OwnerLock:
    """Noninheritable OS lock. A released lock proves the worker no longer owns it."""
    def __init__(self, file):
        self.file = file

    @classmethod
    def acquire(cls, path):
        file = Path(path).open('a+b')
        try:
            if file.seek(0, os.SEEK_END) == 0:
                file.write(b'\0')
                file.flush()
            file.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return cls(file)
        except OSError as error:
            file.close()
            if error.errno in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
                return None
            raise

    def close(self):
        self.file.close()  # Closing releases the OS lock, including after process termination.


class ReviewJobs:
    table = 'review_jobs'
    error_prefix = 'REVIEW'
    attempt_limit = 2

    def __init__(self, store: TaskStore, root=None, *, runner=run_codex_review, executable=None, backend='codex', check_config=None):
        self.store = store
        self.root = Path(root).resolve() if root else Path.home() / '.agent-review-loop/runs' / digest(str(store.path).encode())[:16]
        self.runner, self.executable, self.backend = runner, executable, backend
        self.native_routing = runner is run_codex_review
        self.check_config = validate_config(check_config) if check_config is not None else None
        self._guard = threading.Lock()
        self._workers = {}
        self._closing = False

    def _row(self, db, job_id):
        if not isinstance(job_id, str) or not re.fullmatch('[a-f0-9]{32}', job_id):
            raise StoreError('INVALID_ARGUMENT', 'Expected a review job ID')
        row = db.execute(f'SELECT * FROM {self.table} WHERE id=?', (job_id,)).fetchone()
        if row is None:
            raise StoreError(f'{self.error_prefix}_NOT_FOUND', 'Job does not exist')
        return row

    @staticmethod
    def _public(row):
        result = {key: row[key] for key in ('task_id', 'backend', 'snapshot_id', 'created_at', 'updated_at', 'error_code')} | {
            'job_id': row['id'], 'status': row['state'], 'cancel_requested': bool(row['cancel_requested']),
        }
        if row['result_json']:
            saved = json.loads(row['result_json'])
            checks = saved.get('checks')
            if checks is not None:
                result['checks'] = checks
                if checks['status'] != 'not_run':
                    result['check_evidence_path'] = str(Path(row['directory']) / 'package/checks')
            result.update({key: saved[key] for key in ('thread_id', 'session_id', 'agent_session_id', 'model', 'effort', 'persistent', 'environment',
                                                      'mcp_servers', 'skills_count') if key in saved})
            if isinstance(saved.get('error'), str):
                result['error_message'] = saved['error'][:2000]
        native = read_state(Path(row['directory']) / 'runtime')
        result.update({key: native[key] for key in ('thread_id', 'session_id', 'agent_session_id', 'model', 'effort', 'persistent', 'environment',
                                                   'mcp_servers', 'skills_count', 'events', 'pending') if key in native})
        return result

    def answer(self, job_id, request_id, answer):
        if not isinstance(request_id, str) or not re.fullmatch('[a-f0-9]{32}', request_id):
            raise StoreError('INVALID_ARGUMENT', 'Invalid native request ID')
        with self.store._connection(write=True) as db:
            row = self._reconcile(db, self._row(db, job_id))
            directory = Path(row['directory']) / 'runtime'
            pending = read_state(directory).get('pending', {})
            if row['state'] not in ACTIVE or pending.get('id') != request_id:
                raise StoreError('REQUEST_EXPIRED', '请求已结束，请刷新会话')
            if pending['method'] == 'item/tool/requestUserInput':
                questions = pending['params'].get('questions', [])
                valid = (isinstance(answer, dict) and set(answer) == {q['id'] for q in questions}
                         and all(isinstance(v, str) and 0 < len(v) <= 4000 for v in answer.values()))
            elif pending['method'] == 'acp/permission':
                valid = answer in [option['optionId'] for option in pending['params'].get('options', [])]
            else:
                valid = answer in ('accept', 'decline')
            if not valid:
                raise StoreError('INVALID_ARGUMENT', 'Invalid native response')
            try:
                temporary = directory / f'answer-{request_id}-{uuid4().hex}.tmp'
                temporary.write_bytes(canonical(answer))
                os.link(temporary, directory / f'answer-{request_id}.json')
            except FileExistsError:
                raise StoreError('ALREADY_ANSWERED', '该请求已经答复')
            finally:
                temporary.unlink(missing_ok=True)
        return {'answered': True}

    def _reconcile(self, db, row, table=None):
        table = table or self.table
        if table not in ('review_jobs', 'plan_jobs', 'execution_jobs'):
            raise ValueError('Unknown job table')
        if row['state'] in ACTIVE:
            lock = _OwnerLock.acquire(Path(row['directory']) / 'owner.lock')
            if lock is not None:
                try:
                    db.execute(f"UPDATE {table} SET state='interrupted', error_code='OWNER_LOST', updated_at=? WHERE id=?",
                               (time.time(), row['id']))
                finally:
                    lock.close()
                row = db.execute(f'SELECT * FROM {table} WHERE id=?', (row['id'],)).fetchone()
        return row

    def start_review(self, task_id, repo, base_ref, request_id, *, input_data=None):
        task = self.store.get_task(task_id)
        if self.table == 'review_jobs':
            with self.store._connection() as db:
                execution = db.execute("SELECT result_json FROM execution_jobs WHERE task_id=? AND json_extract(result_json,'$.mode')='implementation' ORDER BY created_at DESC LIMIT 1", (task_id,)).fetchone()
            adopted = json.loads(execution['result_json'] or '{}').get('adopted_plan') if execution else None
            if adopted:
                task['adopted_plan'] = adopted
        if input_data is not None:
            task['_request'] = input_data
        _text(repo, 'repo', 4096)
        _text(base_ref, 'base_ref', 200)
        _text(request_id, 'request_id', 128)
        path = Path(repo)
        if not path.is_absolute() or not path.is_dir():
            raise StoreError('INVALID_ARGUMENT', 'repo must be an existing absolute directory')
        repo = str(path.resolve())
        parameters = [repo, base_ref, {key: task[key] for key in ('title', 'instructions', 'acceptance')}]
        if 'adopted_plan' in task:
            parameters.append({'adopted_plan': task['adopted_plan']})
        if input_data is not None:
            parameters.append(input_data)
        if self.check_config is not None:
            parameters.append({'check_config': self.check_config})
        fingerprint = digest(canonical(parameters))
        with self._guard:
            if self._closing:
                raise StoreError('SERVER_CLOSING', 'Review service is closing')
            with self.store._connection(write=True) as db:
                previous = db.execute(f'SELECT * FROM {self.table} WHERE task_id=? AND request_id=?', (task_id, request_id)).fetchone()
                if previous:
                    if previous['fingerprint'] != fingerprint:
                        raise StoreError('IDEMPOTENCY_CONFLICT', 'request_id already belongs to different review parameters')
                    return self._public(self._reconcile(db, previous))
                for table in ('review_jobs', 'plan_jobs', 'execution_jobs'):
                    for row in db.execute(f"SELECT * FROM {table} WHERE state IN ('preparing','running','cancelling')").fetchall():
                        if self._reconcile(db, row, table)['state'] in ACTIVE:
                            raise StoreError(f'{self.error_prefix}_BUSY', 'One Codex job is active; read its state before starting another')
                if self.attempt_limit is not None and db.execute(f'SELECT count(*) FROM {self.table} WHERE task_id=?', (task_id,)).fetchone()[0] >= self.attempt_limit:
                    raise StoreError(f'{self.error_prefix}_BUDGET_EXHAUSTED', 'This task has used its two attempts for this operation; no automatic reset')
                backend = self.selected_agent(task_id) if self.native_routing else self.backend
                if self.native_routing:
                    if backend.startswith('acp:'):
                        require_agent(backend)
                    configured = self.reviews.executable if self.table == 'execution_jobs' else self.executable
                    executable = codex_executable(configured) if backend == 'codex' else node_executable()
                else:
                    executable = self.executable or shutil.which('codex')
                if executable is None or not Path(executable).is_file():
                    raise StoreError('CODEX_NOT_FOUND', 'Rondo未找到Codex命令行程序。请在Agent设置检查本机接入；若指定过路径，请确认该文件仍存在。')
                job_id = uuid4().hex
                directory = self.root / job_id
                directory.mkdir(parents=True, exist_ok=False)
                lock = _OwnerLock.acquire(directory / 'owner.lock')
                if lock is None:
                    raise StoreError(f'{self.error_prefix}_OWNER_LOCK', 'Could not own the new job; no worker was started')
                now = time.time()
                try:
                    metadata = self._prepare_start(db, task, repo, request_id)
                    db.execute(f'''INSERT INTO {self.table}
                        (id,task_id,request_id,fingerprint,state,repo,base_ref,directory,backend,created_at,updated_at,result_json)
                        VALUES (?,?,?,?,'preparing',?,?,?,?,?,?,?)''',
                               (job_id, task_id, request_id, fingerprint, repo, base_ref, str(directory), backend, now, now,
                                json.dumps(metadata) if metadata else None))
                except BaseException:
                    lock.close()
                    raise
                result = self._public(self._row(db, job_id))
            thread = threading.Thread(target=self._work, args=(job_id, task, Path(repo), base_ref, directory, Path(executable), lock), daemon=True)
            self._workers[job_id] = thread
            try:
                thread.start()
            except BaseException:
                self._workers.pop(job_id)
                lock.close()
                self._finish(job_id, 'failed', None, 'WORKER_START_FAILED')
                raise
            return result

    def _prepare_start(self, db, task, repo, request_id):
        """Reserve subclass-specific state in the SAME transaction as the new job."""
        return None

    def selected_agent(self, task_id):
        role = {'plan_jobs': 'planner', 'review_jobs': 'reviewer', 'execution_jobs': 'executor'}[self.table]
        return task_agents(self.store, task_id)[role]

    def _cancelled(self, job_id):
        if self._closing:
            return True
        with self.store._connection() as db:
            row = self._row(db, job_id)
            return bool(row['cancel_requested']) or row['state'] not in ACTIVE

    def _finish(self, job_id, state, result=None, error=None):
        with self.store._connection(write=True) as db:
            row = self._row(db, job_id)
            if row['cancel_requested'] and state == 'succeeded':
                state = 'cancelled'
            db.execute(f'UPDATE {self.table} SET state=?, result_json=?, error_code=?, updated_at=? WHERE id=?',
                       (state, json.dumps(result) if result else None, error, time.time(), job_id))

    def _work(self, job_id, task, repo, base_ref, directory, executable, lock):
        try:
            if self._cancelled(job_id):
                self._finish(job_id, 'cancelled')
                return
            package = directory / 'package'
            manifest = create_review_package(repo, base_ref, task, package)
            if self.check_config is not None:
                check = run_checks(package, directory / 'check-run', self.check_config,
                                   cancel_check=lambda: self._cancelled(job_id))
                manifest = bind_check_evidence(package, directory / 'check-run')
                if check['status'] != 'passed':
                    with self.store._connection(write=True) as db:
                        db.execute(f'UPDATE {self.table} SET snapshot_id=? WHERE id=?', (manifest['snapshot_id'], job_id))
                    cancelled = check['status'] == 'cancelled' and check['process_tree_closed']
                    self._finish(job_id, 'cancelled' if cancelled else 'failed', {'checks': manifest['checks']},
                                 None if cancelled else 'CHECK_FAILED')
                    return
            with self.store._connection(write=True) as db:
                db.execute(f"UPDATE {self.table} SET snapshot_id=?, state=CASE WHEN cancel_requested=1 THEN 'cancelling' ELSE 'running' END, updated_at=? WHERE id=?",
                           (manifest['snapshot_id'], time.time(), job_id))
            if self._cancelled(job_id):
                self._finish(job_id, 'cancelled')
                return
            options = {'agent': self.selected_agent(task['task_id'])} if self.native_routing else {}
            result = self.runner(package, directory / 'runtime', executable, cancel_check=lambda: self._cancelled(job_id), **options)
            result['checks'] = manifest['checks']
            if result.get('process_tree_closed') is not True:
                self._finish(job_id, 'failed', result, 'CLEANUP_UNVERIFIED')
            elif result['status'] == 'review_saved' and result.get('snapshot_id') == manifest['snapshot_id']:
                self._finish(job_id, 'succeeded', result)
            elif result['status'] == 'cancelled':
                self._finish(job_id, 'cancelled', result)
            else:
                self._finish(job_id, 'failed', result, 'REVIEW_FAILED')
        except Exception as error:
            (directory / 'error.txt').write_text(f'{type(error).__name__}: {error}', encoding='utf-8')
            self._finish(job_id, 'failed', error=getattr(error, 'code', 'REVIEW_FAILED'))
        finally:
            lock.close()
            with self._guard:
                self._workers.pop(job_id, None)

    def status(self, job_id):
        with self.store._connection(write=True) as db:
            return self._public(self._reconcile(db, self._row(db, job_id)))

    def cancel(self, job_id):
        with self.store._connection(write=True) as db:
            row = self._reconcile(db, self._row(db, job_id))
            if row['state'] in ACTIVE:
                db.execute(f"UPDATE {self.table} SET cancel_requested=1, state='cancelling', updated_at=? WHERE id=?", (time.time(), job_id))
            return self._public(self._row(db, job_id))

    def read_review(self, job_id, limit=5, after_index=0):
        _integer(limit, 'limit', 1, 10)
        _integer(after_index, 'after_index', 0)
        status = self.status(job_id)
        if status['status'] != 'succeeded':
            raise StoreError('REVIEW_NOT_READY', 'Review has not succeeded; read its current status')
        with self.store._connection() as db:
            row = self._row(db, job_id)
        result = json.loads(row['result_json'])
        checked = review_status(Path(row['directory']) / 'package', result['review_id'], Path(row['repo']))
        findings = checked['review']['findings']
        end = after_index + limit
        return {'job_id': job_id, 'backend': row['backend'],
                **{key: checked[key] for key in ('snapshot_id', 'review_id', 'freshness', 'review_approved', 'checks')},
                'verdict': checked['review']['verdict'], 'summary': checked['review']['summary'],
                'findings': findings[after_index:end], 'total_findings': len(findings),
                'next_after_index': end if end < len(findings) else None,
                'usage': result.get('usage'), 'cost': result.get('cost')}

    def close(self):
        with self._guard:
            self._closing = True
            workers = list(self._workers.items())
        for job_id, _ in workers:
            self.cancel(job_id)
        deadline = time.monotonic() + 20
        for _, thread in workers:
            thread.join(timeout=max(0, deadline - time.monotonic()))
            if thread.is_alive():
                raise RuntimeError('Review worker did not stop; cleanup is unverified')
