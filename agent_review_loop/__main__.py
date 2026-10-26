"""Small CLI. Configuration generation never edits client settings."""

import argparse
import json
import sys
import shutil
from pathlib import Path

from .store import StoreError, TaskStore
from .snapshots import SnapshotError, create_review_package, prepare_workspace, read_json
from .reviews import review_status, save_review


def _absolute_path(value):
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise argparse.ArgumentTypeError("Use an absolute path shared by all clients")
    return path.resolve()


def main():
    # Make redirected JSON predictable on Windows, including Chinese paths.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Local agent handoffs and fixed-code reviews; explicit review commands consume quota.")
    commands = parser.add_subparsers(dest="command", required=True)
    for name, help_text in (
        ("serve", "Serve MCP over stdio; stdout is reserved for the protocol"),
        ("config", "Print client configuration without editing settings or opening the database"),
        ("create", "Create a task"), ("get", "Read a task"), ("list", "List compact task summaries"),
    ):
        command = commands.add_parser(name, help=help_text)
        command.add_argument("--db", required=True, type=_absolute_path)
        if name in ('serve', 'config'):
            command.add_argument('--review-root', type=_absolute_path)
            command.add_argument('--codex-executable', type=_absolute_path)
            command.add_argument('--check-config', type=_absolute_path,
                                 help='Local trusted JSON argv/timeout; read once at server startup')
            command.add_argument('--task-root', type=_absolute_path, help='Directory for prepared task workspaces')
        if name == "config":
            command.add_argument("--format", choices=("mcp", "codex"), default="mcp")
        elif name == "create":
            command.add_argument("--title", required=True)
            command.add_argument("--instructions", required=True)
            command.add_argument("--acceptance", required=True)
        elif name == "get":
            command.add_argument("task_id", type=int)
        elif name == "list":
            command.add_argument("--limit", type=int, default=10)
            command.add_argument("--after-id", type=int, default=0)
    workspace = commands.add_parser('workspace', help='Create an isolated worktree from a fixed base')
    workspace.add_argument('--repo', required=True, type=_absolute_path)
    workspace.add_argument('--base', default='HEAD')
    workspace.add_argument('--output', required=True, type=_absolute_path)
    start = commands.add_parser('start', help='Prepare a task, isolated Git workspace and execution context in one call; no model call')
    start.add_argument('--db', required=True, type=_absolute_path)
    start.add_argument('--repo', required=True, type=_absolute_path)
    start.add_argument('--title', required=True)
    start.add_argument('--instructions', required=True)
    start.add_argument('--acceptance', required=True)
    start.add_argument('--request-id', required=True)
    start.add_argument('--base', default='HEAD')
    start.add_argument('--new-project', action='store_true', help='Initialize an empty folder with a local first version')
    start.add_argument('--task-root', type=_absolute_path)
    context = commands.add_parser('context', help='Resume a task with saved workspace, requirements and next action')
    context.add_argument('--db', required=True, type=_absolute_path)
    context.add_argument('task_id', type=int)
    package = commands.add_parser('package', help='Capture code and existing task requirements for review')
    package.add_argument('--db', required=True, type=_absolute_path)
    package.add_argument('--task-id', required=True, type=int)
    package.add_argument('--repo', required=True, type=_absolute_path)
    package.add_argument('--base', required=True)
    package.add_argument('--output', required=True, type=_absolute_path)
    record = commands.add_parser('record-review', help='Validate and retain a structured review')
    record.add_argument('--package', required=True, type=_absolute_path)
    record.add_argument('--file', required=True, type=_absolute_path)
    status = commands.add_parser('review-status', help='Read a review and optionally compare current code')
    status.add_argument('--package', required=True, type=_absolute_path)
    status.add_argument('--review-id', required=True)
    status.add_argument('--repo', type=_absolute_path)
    review = commands.add_parser('review-codex', help='Run ONE real review using the configured Codex account; consumes quota')
    review.add_argument('--package', required=True, type=_absolute_path)
    review.add_argument('--output', required=True, type=_absolute_path)
    buddy = commands.add_parser('workbuddy-authorize', help='Prepare official OAuth URL and local state; no secret required')
    buddy.add_argument('--client-id', required=True)
    buddy.add_argument('--redirect-uri', required=True)
    buddy.add_argument('--output', required=True, type=_absolute_path)
    args = parser.parse_args()
    if args.command == "config":
        argv = ["-X", "utf8", "-m", "agent_review_loop", "serve", "--db", str(args.db)]
        if args.review_root is not None:
            argv.extend(['--review-root', str(args.review_root)])
        if args.codex_executable is not None:
            argv.extend(['--codex-executable', str(args.codex_executable)])
        if args.check_config is not None:
            argv.extend(['--check-config', str(args.check_config)])
        if args.task_root is not None:
            argv.extend(['--task-root', str(args.task_root)])
        if args.format == "codex":
            print("[mcp_servers.agent_review_loop]")
            print("command = " + json.dumps(sys.executable, ensure_ascii=False))
            print("args = " + json.dumps(argv, ensure_ascii=False))
        else:
            print(json.dumps({"mcpServers": {"agent-review-loop": {"type": "stdio", "command": sys.executable, "args": argv, "cwd": str(Path(__file__).resolve().parents[1])}}}, ensure_ascii=False, indent=2))
        return 0
    try:
        if args.command == 'workbuddy-authorize':
            from .workbuddy import WorkBuddyError, authorization_url
            try:
                authorization = authorization_url(args.client_id, args.redirect_uri)
                args.output.mkdir(parents=True, exist_ok=False)
                (args.output / 'oauth-request.json').write_text(json.dumps({
                    **authorization, 'client_id': args.client_id, 'redirect_uri': args.redirect_uri,
                }, ensure_ascii=False, indent=2), encoding='utf-8')
            except WorkBuddyError as error:
                raise SnapshotError('WORKBUDDY_AUTH', str(error)) from error
            print(json.dumps({'authorization_url': authorization['url'], 'state_file': str(args.output / 'oauth-request.json'),
                              'credentials_required': False, 'connected': False}, ensure_ascii=False, indent=2))
            return 0
        if args.command in ('workspace', 'package', 'record-review', 'review-status', 'review-codex'):
            if args.command == 'workspace':
                result = prepare_workspace(args.repo, args.output, args.base)
            elif args.command == 'package':
                task = TaskStore(args.db).get_task(args.task_id)
                manifest = create_review_package(args.repo, args.base, task, args.output)
                result = {key: manifest[key] for key in ('snapshot_id', 'base_commit', 'target_tree', 'checks')}
                result.update(package_path=str(args.output), files={side: len(files) for side, files in manifest['files'].items()})
            elif args.command == 'record-review':
                result = save_review(args.package, read_json(args.file))
            elif args.command == 'review-codex':
                from .codex_review import run_codex_review
                binary = shutil.which('codex')
                if binary is None:
                    raise SnapshotError('CODEX_NOT_FOUND', 'Install and authenticate the native Codex CLI first')
                result = run_codex_review(args.package, args.output, Path(binary))
            else:
                result = review_status(args.package, args.review_id, args.repo)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 1 if args.command == 'review-codex' and result['status'] != 'review_saved' else 0
        store = TaskStore(args.db)
        if args.command == "serve":
            from .server import create_server
            from .review_jobs import ReviewJobs
            from .checks import load_check_config
            checks = load_check_config(args.check_config) if args.check_config else None
            from .task_launch import TaskLauncher
            create_server(store, ReviewJobs(store, args.review_root, executable=args.codex_executable,
                                           check_config=checks), TaskLauncher(store, args.task_root)).run()
            return 0
        if args.command in ('start', 'context'):
            from .task_launch import TaskLauncher
            tasks = TaskLauncher(store, args.task_root if args.command == 'start' else None)
            result = (tasks.start(str(args.repo), args.title, args.instructions, args.acceptance, args.request_id, args.base, args.new_project)
                      if args.command == 'start' else tasks.context(args.task_id))
        elif args.command == "create":
            result = store.create_task(args.title, args.instructions, args.acceptance)
        elif args.command == "get":
            result = store.get_task(args.task_id)
        else:
            result = store.list_tasks(args.limit, args.after_id)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (StoreError, SnapshotError) as error:
        print(json.dumps({"code": error.code, "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    except OSError as error:
        print(f"Cannot access local storage: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
