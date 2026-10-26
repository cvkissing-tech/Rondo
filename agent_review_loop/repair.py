"""Bounded review handoff; path contract ported from pi-pr-repair-loop (see NOTICE)."""
import json
from pathlib import Path

from .reviews import review_status
from .snapshots import canonical, safe_relative, verify_package
from .store import StoreError


def path_matches_contract(relative_path, patterns):
    # Port of upstream pathMatchesContract; only exact paths and directory prefixes.
    target = str(relative_path).strip().replace('\\', '/').removeprefix('./')
    for raw in patterns:
        pattern = str(raw).strip().replace('\\', '/').removeprefix('./')
        if not pattern:
            continue
        if pattern.endswith('/**'):
            prefix = pattern[:-3].rstrip('/')
            if target == prefix or target.startswith(prefix + '/'):
                return True
        elif pattern.endswith('/'):
            if target.startswith(pattern):
                return True
        elif target == pattern:
            return True
    return False


def unauthorized_changed_files(changed_files, allowed, forbidden=()):
    return [name for name in changed_files if path_matches_contract(name, forbidden)
            or not allowed or not path_matches_contract(name, allowed)]


def repair_context(db, task_id, source_job_id, repo):
    """Called under the job-reservation transaction; no nested database connection."""
    source = db.execute('SELECT * FROM review_jobs WHERE id=? AND task_id=?', (source_job_id, task_id)).fetchone()
    latest = db.execute('SELECT id FROM review_jobs WHERE task_id=? ORDER BY created_at DESC LIMIT 1', (task_id,)).fetchone()
    if not source or source['state'] != 'succeeded' or not latest or latest['id'] != source_job_id:
        raise StoreError('REPAIR_SOURCE_INVALID', 'Repair requires the latest successful review of this task')
    if Path(source['repo']).resolve() != Path(repo).resolve():
        raise StoreError('REPAIR_SOURCE_INVALID', 'Review and repair workspace differ')
    saved = json.loads(source['result_json'])
    checked = review_status(Path(source['directory']) / 'package', saved['review_id'], Path(repo))
    if checked['freshness'] != 'current':
        raise StoreError('REPAIR_SOURCE_STALE', 'Code changed after review; inspect it before starting a repair')
    review = checked['review']
    if review['verdict'] != 'changes_requested' or not review['findings']:
        raise StoreError('REPAIR_NOT_NEEDED', 'This review does not request code changes')
    if db.execute('SELECT count(*) FROM review_jobs WHERE task_id=?', (task_id,)).fetchone()[0] >= 2:
        raise StoreError('REVIEW_BUDGET_EXHAUSTED', 'No review attempt remains for this repair')
    allowed = sorted({item['path'] for item in review['findings']})
    for name in allowed:
        safe_relative(name)
    manifest = verify_package(Path(source['directory']) / 'package')
    result = {'source_review_job_id': source_job_id, 'review_id': saved['review_id'],
              'source_tree': manifest['target_tree'],
              'summary': review['summary'], 'findings': review['findings'], 'allowed_files': allowed}
    if len(canonical(result)) > 48 * 1024:
        raise StoreError('REPAIR_CONTEXT_TOO_LARGE', 'Repair findings exceed the bounded context; handle them manually')
    return result
