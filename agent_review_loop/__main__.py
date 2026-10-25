"""Small CLI. Configuration generation never edits client settings."""

import argparse
import json
import sys
from pathlib import Path

from .store import StoreError, TaskStore


def _absolute_path(value):
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise argparse.ArgumentTypeError("--db must be an absolute path shared by all clients")
    return path.resolve()


def main():
    # Make redirected JSON predictable on Windows, including Chinese paths.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Local MCP task handoff bridge; no model calls.")
    commands = parser.add_subparsers(dest="command", required=True)
    for name, help_text in (
        ("serve", "Serve MCP over stdio; stdout is reserved for the protocol"),
        ("config", "Print client configuration without editing settings or opening the database"),
        ("create", "Create a task"), ("get", "Read a task"), ("list", "List compact task summaries"),
    ):
        command = commands.add_parser(name, help=help_text)
        command.add_argument("--db", required=True, type=_absolute_path)
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
    args = parser.parse_args()
    if args.command == "config":
        argv = ["-X", "utf8", "-m", "agent_review_loop", "serve", "--db", str(args.db)]
        if args.format == "codex":
            print("[mcp_servers.agent_review_loop]")
            print("command = " + json.dumps(sys.executable, ensure_ascii=False))
            print("args = " + json.dumps(argv, ensure_ascii=False))
        else:
            print(json.dumps({"mcpServers": {"agent-review-loop": {"type": "stdio", "command": sys.executable, "args": argv, "cwd": str(Path(__file__).resolve().parents[1])}}}, ensure_ascii=False, indent=2))
        return 0
    try:
        store = TaskStore(args.db)
        if args.command == "serve":
            from .server import create_server
            create_server(store).run()
            return 0
        if args.command == "create":
            result = store.create_task(args.title, args.instructions, args.acceptance)
        elif args.command == "get":
            result = store.get_task(args.task_id)
        else:
            result = store.list_tasks(args.limit, args.after_id)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except StoreError as error:
        print(json.dumps({"code": error.code, "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    except OSError as error:
        print(f"Cannot access local storage: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
