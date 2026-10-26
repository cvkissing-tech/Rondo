"""One task entry point; reuse native Git worktrees and the existing task store."""

import json
from datetime import datetime
from pathlib import Path

from .snapshots import _git, canonical, current_tree, digest, prepare_workspace, repository_root
from .store import StoreError, TaskStore, _text


class TaskLauncher:
    def __init__(self, store: TaskStore, root=None):
        self.store = store
        self.root = (Path(root).resolve() if root else
                     Path.home() / '.agent-review-loop/tasks' / digest(str(store.path).encode())[:16])

    def start(self, repo, title, instructions, acceptance, request_id, base_ref='HEAD'):
        for value, name, limit in ((repo, 'repo', 4096), (title, 'title', 160),
                                   (instructions, 'instructions', 8000), (acceptance, 'acceptance', 4000),
                                   (request_id, 'request_id', 128), (base_ref, 'base_ref', 200)):
            _text(value, name, limit)
        path = Path(repo)
        if not path.is_absolute() or not path.is_dir():
            raise StoreError('INVALID_ARGUMENT', 'repo must be an existing absolute Git working directory')
        repo = str(path.resolve())
        fingerprint = digest(canonical([repo, title, instructions, acceptance, base_ref]))
        # ponytail: serialize local task setup with SQLite; a job queue is unnecessary for one user.
        with self.store._connection(write=True) as db:
            previous = db.execute('SELECT * FROM task_launches WHERE request_id=?', (request_id,)).fetchone()
            if previous:
                if previous['fingerprint'] != fingerprint:
                    raise StoreError('IDEMPOTENCY_CONFLICT', 'request_id already belongs to a different task start')
                task_id = previous['task_id']
            else:
                directory = self.root / digest(canonical([str(self.store.path), request_id]))[:32]
                if directory.exists():
                    raise StoreError('TASK_START_INCOMPLETE', f'Inspect preserved task directory before retrying: {directory}')
                workspace = prepare_workspace(Path(repo), directory, base_ref)
                task_id = self.store._create_task(db, title, instructions, acceptance)['task_id']
                context = {**workspace, 'task_id': task_id, 'request_id': request_id,
                           'handoff_file': str(directory / 'task.json')}
                (directory / 'task.json').write_bytes(canonical({**context,
                    'title': title, 'instructions': instructions, 'acceptance': acceptance}) + b'\n')
                db.execute('INSERT INTO task_launches(request_id,fingerprint,task_id,context_json) VALUES(?,?,?,?)',
                           (request_id, fingerprint, task_id, canonical(context).decode('utf-8')))
        return self.context(task_id)

    def context(self, task_id):
        task = self.store.get_task(task_id)
        with self.store._connection() as db:
            launch = db.execute('SELECT context_json FROM task_launches WHERE task_id=?', (task_id,)).fetchone()
            review = db.execute('SELECT id FROM review_jobs WHERE task_id=? ORDER BY created_at DESC LIMIT 1', (task_id,)).fetchone()
            plan = db.execute('SELECT id FROM plan_jobs WHERE task_id=? ORDER BY created_at DESC LIMIT 1', (task_id,)).fetchone()
            created = db.execute('SELECT created_at FROM tasks WHERE id=?', (task_id,)).fetchone()[0]
            records = db.execute('''SELECT id, 'plan' AS kind, state AS status, created_at, updated_at, error_code
                FROM plan_jobs WHERE task_id=? UNION ALL
                SELECT id, 'review' AS kind, state AS status, created_at, updated_at, error_code
                FROM review_jobs WHERE task_id=? ORDER BY created_at DESC, id DESC LIMIT 11''', (task_id, task_id)).fetchall()
        if launch is None:
            raise StoreError('TASK_NOT_PREPARED', 'This task has no managed workspace; use start_task for new tasks')
        context = json.loads(launch['context_json'])
        if not Path(context['workspace']).is_dir():
            raise StoreError('WORKSPACE_MISSING', 'The task workspace is missing; it will not be recreated over existing work')
        return {**context, 'task': task, 'latest_review_job_id': review['id'] if review else None,
                'latest_plan_job_id': plan['id'] if plan else None,
                'activity': [{'id': 'workspace', 'kind': 'workspace', 'status': 'succeeded',
                              'created_at': datetime.fromisoformat(created).timestamp(),
                              'updated_at': datetime.fromisoformat(created).timestamp()},
                             *[dict(row) for row in reversed(records[:10])]],
                'activity_truncated': len(records) > 10,
                'next_action': 'Implement the task in workspace only. Read project instructions, run relevant checks, then stop editing and call start_task_review.',
                'review': {'tool': 'start_task_review', 'arguments': {'task_id': task_id},
                           'request_id_rule': 'Choose a stable review request_id; this does not start a model call.'}}

    def changes(self, task_id):
        context = self.context(task_id)
        repo = repository_root(Path(context['workspace']))
        tree = current_tree(repo)
        patch = _git(repo, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', context['base_commit'], tree, '--')
        limit = 200_000
        return {'task_id': task_id, 'base_commit': context['base_commit'], 'target_tree': tree,
                'patch': patch[:limit].decode('utf-8', errors='replace'), 'truncated': len(patch) > limit}
