"""Validate review data and keep content-addressed history; never execute model text."""

from pathlib import Path
import re

from .snapshots import (
    SnapshotError, canonical, common_directory, current_tree, digest,
    read_json, repository_root, safe_relative, verify_package,
)


def _text(value, maximum):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        return False
    try:
        value.encode('utf-8')
        return True
    except UnicodeError:
        return False


def _validate(review, manifest):
    def invalid():
        raise SnapshotError('INVALID_REVIEW', 'Review fields, verdict, findings or file locations are invalid')

    if not isinstance(review, dict) or set(review) != {'snapshot_id', 'verdict', 'summary', 'findings'}:
        invalid()
    if review['snapshot_id'] != manifest['snapshot_id']:
        raise SnapshotError('SNAPSHOT_MISMATCH', 'Review belongs to another snapshot')
    verdict, findings = review['verdict'], review['findings']
    if (verdict not in ('approved', 'changes_requested') or not _text(review['summary'], 4000)
            or not isinstance(findings, list) or len(findings) > 20
            or (verdict == 'approved') != (len(findings) == 0)):
        invalid()
    ids = set()
    for item in findings:
        if not isinstance(item, dict) or set(item) != {
            'id', 'path', 'side', 'line', 'priority', 'trigger', 'impact', 'evidence', 'evidence_kind'
        }:
            invalid()
        for key, maximum in (('id', 64), ('trigger', 2000), ('impact', 2000), ('evidence', 4000)):
            if not _text(item[key], maximum):
                invalid()
        if item['id'] in ids:
            invalid()
        ids.add(item['id'])
        if (item['side'] not in ('before', 'after') or type(item['priority']) is not int
                or not 0 <= item['priority'] <= 3
                or item['evidence_kind'] not in ('reproduced', 'static', 'not_run')):
            invalid()
        try:
            safe_relative(item['path'])
        except SnapshotError:
            invalid()
        file = manifest['files'][item['side']].get(item['path'])
        line = item['line']
        if file is None or (line is not None and (
            type(line) is not int or file['binary'] or not 1 <= line <= file['lines']
        )):
            invalid()


def save_review(package_dir, review):
    manifest = verify_package(package_dir)
    _validate(review, manifest)
    content = canonical(review) + b'\n'
    review_id = digest(canonical(review))
    directory = Path(package_dir).resolve() / 'reviews'
    directory.mkdir(exist_ok=True)
    path = directory / (review_id + '.json')
    try:
        with path.open('xb') as file:
            file.write(content)
    except FileExistsError:
        if path.is_symlink() or path.read_bytes() != content:
            raise SnapshotError('INVALID_RECORD', 'Existing review content does not match its identity')
    return {'snapshot_id': manifest['snapshot_id'], 'review_id': review_id}


def review_status(package_dir, review_id, repo=None):
    if not isinstance(review_id, str) or not re.fullmatch('[a-f0-9]{64}', review_id):
        raise SnapshotError('INVALID_ARGUMENT', 'Expected a SHA256 review ID')
    manifest = verify_package(package_dir)
    review = read_json(Path(package_dir) / 'reviews' / (review_id + '.json'))
    if digest(canonical(review)) != review_id:
        raise SnapshotError('INVALID_RECORD', 'Review content does not match its identity')
    _validate(review, manifest)
    freshness = 'unchecked'
    if repo is not None:
        repo = repository_root(repo)
        if Path(common_directory(repo)) != Path(manifest['git_common_dir']):
            raise SnapshotError('REPOSITORY_MISMATCH', 'Freshness must be checked in the original Git repository')
        freshness = 'current' if current_tree(repo) == manifest['target_tree'] else 'stale'
    return {
        'snapshot_id': manifest['snapshot_id'], 'review_id': review_id,
        'freshness': freshness, 'review_approved': freshness == 'current' and review['verdict'] == 'approved',
        'checks': manifest['checks'], 'review': review,
    }
