"""Content-addressed review packages, using native Git and a private index.

For a local trusted repository. Stop writers before capture. A package detects
changes; it is neither a signature nor a process/filesystem permission boundary.
"""

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tempfile


MAX_FILES = 5000
MAX_BYTES = 100 * 1024 * 1024
MAX_JSON = 8 * 1024 * 1024
NOT_RUN_CHECKS = {'status': 'not_run', 'reason': 'Check execution has not been attached to this snapshot'}


class SnapshotError(Exception):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    path = Path(path)
    if path.is_symlink() or path.stat().st_size > MAX_JSON:
        raise SnapshotError('INVALID_RECORD', 'JSON record is a link or exceeds 8 MiB')
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (ValueError, UnicodeError, RecursionError) as error:
        raise SnapshotError('INVALID_RECORD', 'Record is not valid UTF-8 JSON') from error


def _git(repo, *args, index=None, input=None, stdout=None, check=True):
    # Inherited GIT_DIR / GIT_INDEX_FILE must not redirect writes elsewhere.
    env = {key: value for key, value in os.environ.items() if not key.upper().startswith('GIT_')}
    env.update(GIT_OPTIONAL_LOCKS='0', GIT_TERMINAL_PROMPT='0', LC_ALL='C')
    if index is not None:
        env['GIT_INDEX_FILE'] = str(index)
    with tempfile.TemporaryDirectory(prefix='arl-hooks-') as hooks:
        try:
            result = subprocess.run(
                ['git', '--literal-pathspecs', '-c', f'core.hooksPath={hooks}',
                 '-c', 'core.fsmonitor=false', '-c', 'submodule.recurse=false', *args],
                cwd=repo, env=env, input=input, stdout=stdout or subprocess.PIPE,
                stderr=subprocess.PIPE, timeout=60, shell=False,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
            )
        except subprocess.TimeoutExpired as error:
            raise SnapshotError('GIT_TIMEOUT', 'Git timed out; incomplete output is not a completed package') from error
    if check and result.returncode:
        raise SnapshotError('GIT_FAILED', result.stderr.decode('utf-8', errors='replace').strip()[:2000])
    return result.stdout or b''


def repository_root(repo):
    repo = Path(repo).resolve()
    if not repo.is_dir():
        raise SnapshotError('INVALID_REPOSITORY', 'Repository directory does not exist')
    root = Path(_git(repo, 'rev-parse', '--show-toplevel').decode('utf-8').strip()).resolve()
    if root != repo:
        raise SnapshotError('INVALID_REPOSITORY', 'Use the Git working tree root, not a subdirectory')
    if _git(repo, 'config', '--bool', 'core.sparseCheckout', check=False).strip() == b'true':
        raise SnapshotError('UNSUPPORTED_ENTRY', 'Sparse checkouts are not supported')
    return repo


def common_directory(repo):
    return str(Path(_git(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir').decode('utf-8').strip()).resolve())


def _commit(repo, ref):
    if not isinstance(ref, str) or not ref or ref.startswith('-'):
        raise SnapshotError('INVALID_ARGUMENT', 'An explicit commit/ref is required')
    return _git(repo, 'rev-parse', '--verify', '--end-of-options', ref + '^{commit}').decode().strip()


def safe_relative(value):
    if not isinstance(value, str) or not value or str(PurePosixPath(value)) != value:
        raise SnapshotError('UNSUPPORTED_PATH', 'Expected a canonical relative file path')
    parts = PurePosixPath(value).parts
    for part in parts:
        reserved = part.split('.')[0].upper()
        if (part in ('.', '..', '/') or part.casefold() == '.git' or part.endswith((' ', '.'))
                or any(ord(char) < 32 or char in '<>:"\\|?*' for char in part)
                or reserved in {'CON', 'PRN', 'AUX', 'NUL'}
                or re.fullmatch(r'(COM|LPT)[1-9]', reserved)):
            raise SnapshotError('UNSUPPORTED_PATH', 'Path cannot be safely represented on Windows')
    return parts


def _is_link(path):
    info = path.lstat()
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, 'st_file_attributes', 0) & 0x400)


def _entries(repo, tree):
    entries, prefixes = {}, {}
    for raw in _git(repo, 'ls-tree', '-r', '-l', '-z', '--full-tree', tree).split(b'\0'):
        if not raw:
            continue
        header, raw_path = raw.split(b'\t', 1)
        mode, kind, oid, size = header.split()
        if mode not in (b'100644', b'100755') or kind != b'blob':
            raise SnapshotError('UNSUPPORTED_ENTRY', 'Submodules and symbolic links are not supported')
        try:
            name = raw_path.decode('utf-8')
        except UnicodeError as error:
            raise SnapshotError('UNSUPPORTED_PATH', 'File paths must be UTF-8') from error
        parts = safe_relative(name)
        for length in range(1, len(parts) + 1):
            prefix = '/'.join(parts[:length])
            previous = prefixes.setdefault(prefix.casefold(), prefix)
            if previous != prefix:
                raise SnapshotError('UNSUPPORTED_PATH', 'Case-colliding paths are not portable')
        entries[name] = {'mode': mode.decode(), 'oid': oid.decode(), 'size': int(size)}
    if len(entries) > MAX_FILES or sum(item['size'] for item in entries.values()) > MAX_BYTES:
        raise SnapshotError('PACKAGE_LIMIT', 'Snapshot exceeds file or byte limit')
    return entries


def _check_filters(repo, names, index=None, cached=False):
    args = ['check-attr', '-z', '--stdin'] + (['--cached'] if cached else []) + ['filter']
    values = _git(repo, *args, index=index, input=b''.join(name.encode('utf-8') + b'\0' for name in names)).split(b'\0')
    if any(value not in (b'unspecified', b'unset') for value in values[2::3]):
        raise SnapshotError('UNSUPPORTED_FILTER', 'Custom Git filters (including LFS) are not supported')


def capture_tree(repo):
    """Capture actual files, including untracked nonignored files, not the user's staged version."""
    _entries(repo, 'HEAD')
    with tempfile.TemporaryDirectory(prefix='arl-index-') as scratch:
        index = Path(scratch) / 'index'
        _git(repo, 'read-tree', 'HEAD', index=index)
        raw_names = _git(repo, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', index=index)
        try:
            names = [name.decode('utf-8') for name in raw_names.split(b'\0') if name]
        except UnicodeError as error:
            raise SnapshotError('UNSUPPORTED_PATH', 'File paths must be UTF-8') from error
        if len(names) > MAX_FILES:
            raise SnapshotError('PACKAGE_LIMIT', 'Working directory exceeds file limit')
        working_bytes = 0
        for name in names:
            parts = safe_relative(name.rstrip('/'))
            target = repo
            for part in parts:
                target = target / part
                if target.exists() or target.is_symlink():
                    if _is_link(target):
                        raise SnapshotError('UNSUPPORTED_ENTRY', 'Symbolic links and reparse points are not supported')
                    if not target.is_file() and not target.is_dir():
                        raise SnapshotError('UNSUPPORTED_ENTRY', 'Only regular files are supported')
            if target.is_dir():
                raise SnapshotError('UNSUPPORTED_ENTRY', 'Nested repositories are not supported')
            if target.is_file():
                working_bytes += target.stat().st_size
                if working_bytes > MAX_BYTES:
                    raise SnapshotError('PACKAGE_LIMIT', 'Working directory exceeds byte limit')
        _check_filters(repo, names, index=index)
        _git(repo, 'add', '-A', '--', '.', index=index)
        tree = _git(repo, 'write-tree', index=index).decode().strip()
    _entries(repo, tree)
    return tree


def current_tree(repo):
    repo = repository_root(repo)
    first, second = capture_tree(repo), capture_tree(repo)
    if first != second:
        raise SnapshotError('SOURCE_CHANGED', 'Files changed during capture; stop writers and retry')
    return first


def _new_output(repo, output_dir):
    output = Path(output_dir).resolve()
    if output == repo or repo in output.parents:
        raise SnapshotError('INVALID_OUTPUT', 'Output must be outside the source working tree')
    try:
        output.mkdir(parents=True, exist_ok=False)
    except FileExistsError as error:
        raise SnapshotError('OUTPUT_EXISTS', 'Use a new output directory; previous evidence is retained') from error
    return output


def prepare_workspace(repo, output_dir, base_ref='HEAD'):
    repo = repository_root(repo)
    base = _commit(repo, base_ref)
    files = _entries(repo, base)
    with tempfile.TemporaryDirectory(prefix='arl-attrs-') as scratch:
        index = Path(scratch) / 'index'
        _git(repo, 'read-tree', base, index=index)
        _check_filters(repo, files, index=index, cached=True)
    output = _new_output(repo, output_dir)
    workspace = output / 'workspace'
    _git(repo, 'worktree', 'add', '--detach', str(workspace), base)
    result = {'repository': str(repo), 'base_commit': base, 'workspace': str(workspace)}
    (output / 'workspace.json').write_bytes(canonical(result) + b'\n')
    return result


def _file_info(data):
    try:
        text = data.decode('utf-8') if b'\0' not in data else None
    except UnicodeError:
        text = None
    return {'sha256': digest(data), 'binary': text is None,
            'lines': None if text is None else text.count('\n') + bool(text and not text.endswith('\n'))}


def _materialize(repo, entries, destination):
    destination.mkdir()
    # Batch reads avoid spawning one Git process per file. Data is spooled to disk.
    with tempfile.TemporaryFile() as spool:
        _git(repo, 'cat-file', '--batch', input=''.join(item['oid'] + '\n' for item in entries.values()).encode(), stdout=spool)
        spool.seek(0)
        for name, item in entries.items():
            header = spool.readline().split()
            if header != [item['oid'].encode(), b'blob', str(item['size']).encode()]:
                raise SnapshotError('GIT_FAILED', 'Unexpected Git batch object')
            data = spool.read(item['size'])
            if len(data) != item['size'] or spool.read(1) != b'\n':
                raise SnapshotError('GIT_FAILED', 'Incomplete Git batch object')
            target = destination.joinpath(*safe_relative(name))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            if os.name != 'nt':
                target.chmod(0o755 if item['mode'] == '100755' else 0o644)
            item.update(_file_info(data))


def create_review_package(repo, base_ref, task, output_dir):
    repo = repository_root(repo)
    base = _commit(repo, base_ref)
    bound_task = {key: task.get(key) for key in ('task_id', 'title', 'instructions', 'acceptance')}
    if type(bound_task['task_id']) is not int or bound_task['task_id'] < 1:
        raise SnapshotError('INVALID_ARGUMENT', 'task_id must be a positive integer')
    for key, maximum in (('title', 160), ('instructions', 8000), ('acceptance', 4000)):
        value = bound_task[key]
        if not isinstance(value, str) or not value.strip() or len(value) > maximum:
            raise SnapshotError('INVALID_ARGUMENT', f'Invalid task {key}')
    tree = current_tree(repo)
    files = {'before': _entries(repo, base), 'after': _entries(repo, tree)}
    if sum(item['size'] for side in files.values() for item in side.values()) > MAX_BYTES:
        raise SnapshotError('PACKAGE_LIMIT', 'Combined base and target exceed byte limit')
    diff = _git(repo, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--binary', '--full-index', base, tree, '--')
    output = _new_output(repo, output_dir)
    for side, entries in files.items():
        _materialize(repo, entries, output / side)
    (output / 'changes.patch').write_bytes(diff)
    guide = ('Review task requirements in manifest.json against the fixed after/ files.\n'
             'Use before/ for deleted lines and changes.patch for differences.\n'
             'Read manifest.checks for check evidence. Files are writable: verify integrity after review.\n'
             'This package has no .git directory; Git-dependent checks need separate setup.\n').encode()
    (output / 'README.txt').write_bytes(guide)
    manifest = {
        'format_version': 1, 'repository': str(repo), 'git_common_dir': common_directory(repo),
        'base_commit': base, 'target_tree': tree, 'task': bound_task, 'files': files,
        'artifacts': {'changes.patch': digest(diff), 'README.txt': digest(guide)},
        'checks': dict(NOT_RUN_CHECKS),
    }
    manifest['snapshot_id'] = digest(canonical(manifest))
    # Completion marker last: interrupted exports can never pass verification.
    (output / 'manifest.json').write_bytes(canonical(manifest) + b'\n')
    return manifest


def _verified_check_summary(directory, input_snapshot_id, *, runtime=False):
    expected_names = {'result.json', 'stdout.log', 'stderr.log'}
    allowed = expected_names | ({'workspace', 'tmp'} if runtime else set())
    if (_is_link(directory) or {p.name for p in directory.iterdir()} != allowed
            or any(_is_link(directory / name) or not (directory / name).is_file() for name in expected_names)):
        raise ValueError('Unexpected check evidence')
    record = read_json(directory / 'result.json')
    if record['format_version'] != 1 or record['input_snapshot_id'] != input_snapshot_id:
        raise ValueError('Check belongs to another input snapshot')
    allowed = {'passed', 'failed', 'changed', 'timed_out', 'cancelled', 'output_limit',
               'start_failed', 'cleanup_failed', 'io_failed'}
    if (record['status'] not in allowed or type(record['process_tree_closed']) is not bool
            or type(record['code_unchanged']) is not bool
            or (record['exit_code'] is not None and type(record['exit_code']) is not int)
            or (record['status'] == 'passed' and (record['exit_code'] != 0
                or not record['process_tree_closed'] or not record['code_unchanged']))):
        raise ValueError('Invalid check outcome')
    for name in ('stdout.log', 'stderr.log'):
        path, metadata = directory / name, record['logs'][name]
        if path.stat().st_size > 1024 * 1024:
            raise ValueError('Check log exceeds limit')
        data = path.read_bytes()
        if (type(metadata['bytes']) is not int or type(metadata['truncated']) is not bool
                or len(data) != metadata['bytes'] or digest(data) != metadata['sha256']
                or (record['status'] == 'passed' and metadata['truncated'])):
            raise ValueError('Check log changed')
    return {key: record[key] for key in ('status', 'exit_code', 'process_tree_closed', 'code_unchanged')} | {
        'record_id': digest(canonical(record)), 'command_id': digest(canonical(record['config']))}


def bind_check_evidence(package_dir, evidence_dir):
    root, evidence = Path(package_dir).resolve(), Path(evidence_dir).resolve()
    manifest = verify_package(root)
    if manifest['checks'] != NOT_RUN_CHECKS:
        raise SnapshotError('CHECKS_ALREADY_ATTACHED', 'Create a new package for another check')
    try:
        summary = _verified_check_summary(evidence, manifest['snapshot_id'], runtime=True)
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise SnapshotError('INVALID_CHECK_EVIDENCE', 'Check evidence is invalid or belongs to another snapshot') from error
    (root / 'checks').mkdir(exist_ok=False)
    for name in ('result.json', 'stdout.log', 'stderr.log'):
        shutil.copyfile(evidence / name, root / 'checks' / name)
    manifest['checks'] = summary
    identity = {key: value for key, value in manifest.items() if key != 'snapshot_id'}
    manifest['snapshot_id'] = digest(canonical(identity))
    (root / 'manifest.json').write_bytes(canonical(manifest) + b'\n')
    return verify_package(root)


def verify_package(package_dir):
    root = Path(package_dir).resolve()
    try:
        manifest = read_json(root / 'manifest.json')
        identity = {key: value for key, value in manifest.items() if key != 'snapshot_id'}
        if manifest['format_version'] != 1 or digest(canonical(identity)) != manifest['snapshot_id']:
            raise ValueError('Manifest identity mismatch')
        allowed = {'manifest.json', 'before', 'after', 'changes.patch', 'README.txt', 'reviews'}
        if manifest['checks']['status'] != 'not_run':
            allowed.add('checks')
            original = dict(identity, checks=dict(NOT_RUN_CHECKS))
            if _verified_check_summary(root / 'checks', digest(canonical(original))) != manifest['checks']:
                raise ValueError('Check summary changed')
        if any(p.name not in allowed or _is_link(p) for p in root.iterdir()):
            raise ValueError('Unexpected package entry')
        for name in ('changes.patch', 'README.txt'):
            if digest((root / name).read_bytes()) != manifest['artifacts'][name]:
                raise ValueError('Artifact changed')
        for side in ('before', 'after'):
            expected = manifest['files'][side]
            actual = set()
            for directory, dirs, names in os.walk(root / side, followlinks=False):
                for name in dirs + names:
                    if _is_link(Path(directory) / name):
                        raise ValueError('Linked entry')
                for name in names:
                    path = Path(directory) / name
                    relative = path.relative_to(root / side).as_posix()
                    safe_relative(relative)
                    actual.add(relative)
                    item = expected.get(relative)
                    if item is None or path.stat().st_size != item['size'] or _file_info(path.read_bytes()) != {
                        key: item[key] for key in ('sha256', 'binary', 'lines')
                    }:
                        raise ValueError('Snapshot file changed')
                    if os.name != 'nt' and bool(path.stat().st_mode & 0o111) != (item['mode'] == '100755'):
                        raise ValueError('Executable mode changed')
            if actual != set(expected) or not (root / side).is_dir():
                raise ValueError('Snapshot file missing')
        return manifest
    except (OSError, ValueError, KeyError, TypeError, AttributeError, SnapshotError) as error:
        raise SnapshotError('PACKAGE_CHANGED', 'Package is incomplete or changed; do not use its review') from error
