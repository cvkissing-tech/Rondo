# Shared Task MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.
>
> 本机这两项执行辅助技能未安装；已有设计获用户批准，用户要求立即开发。本轮在当前会话逐项实现与验收，不为执行流程安装额外框架，也不把缺少辅助技能作为阻塞。

**Goal:** 两个独立 MCP 服务进程共享 SQLite，完成合成任务的创建、领取、续期、提交和读取。

**Architecture:** `store.py` 管事务和状态；`server.py` 使用官方 SDK 暴露工具；`__main__.py` 提供服务启动和无账号演示所需的命令入口。领取使用有期限的尝试，提交使用持久幂等记录。执行进程模块不承担本轮 MCP 服务进程管理，也不调用模型。

**Tech Stack:** Python 3.11+、sqlite3、unittest、官方 mcp==2.3.0。SDK 最新稳定包和 v2 接口已通过官方文档及包索引核对。

**Spec:** `docs/superpowers/specs/2026-10-25-open-source-reuse.md`；本计划仅覆盖其“下一项工作”，代码快照与真实审查属于后续阶段。

## Global Constraints

- 首版单人、本地、同一可信用户；stdio，无网络监听与账号修改。
- 数据库路径在客户端配置中明确指定为绝对路径。多个进程用同一路径。
- Agent 标签不充当身份认证；领取凭据只控制当前尝试，不出现在列表里。
- 不运行模型，不自动重试模型请求；不把 SDK 客户端当作真实 Codex/WorkBuddy。
- 在现有目录开发，保留前一轮 README 和复用清单的改动。
- 先离线验证状态，再验证真实 MCP 子进程；客户端安装配置单独记录。

## Files and interfaces

- `agent_review_loop/store.py`: `TaskStore(path, clock=time.time)`；`create_task(title, instructions, acceptance)`、`get_task(task_id)`、`list_tasks(limit=10, after_id=0)`、`claim_task(task_id, owner, expected_version, lease_seconds=900)`、`renew_claim(task_id, attempt_id, claim_token, lease_seconds=900)`、`submit_result(task_id, attempt_id, claim_token, expected_version, summary, request_id)`；返回 JSON 可序列化字典，业务失败抛 `StoreError(code, message)`。
- `agent_review_loop/server.py`: `create_server(store) -> MCPServer`，六个同名工具。业务失败通过 SDK ToolError 返回明确 code/message。
- `agent_review_loop/__main__.py`: `main()`；`serve --db ABSOLUTE_PATH`、`list/get/create` 等 CLI 与 `config --db ABSOLUTE_PATH` 生成可审阅配置。
- `tests/test_store.py`: 持久化、领取占用与过期、重复提交、跨进程竞争、分页、输入与已有数据库保护。
- `tests/test_mcp.py`: 官方 SDK 的 modern/legacy stdio 客户端、真实独立进程、服务重启与错误结果。
- `examples/task_demo.py`: 同时连接两个服务，演示领取冲突、提交与重启重试。
- `docs/learning/02-shared-task-mcp.md`: 核心代码、调用链、实验步骤、观察结果、限制。
- `.github/workflows/check.yml`: Windows/Linux + Python 3.11/3.14 检查；当前仅本机 Windows 实测。

## Task 1: Transactional shared state

- [x] 写持久化与重复领取的失败检查，运行确认缺少 store 模块而失败。

```python
task = store.create_task("合成任务", "返回完成说明", "能够读取结果")
claim = store.claim_task(task["task_id"], "worker", task["version"])
assert claim["version"] == task["version"] + 1
```

- [x] 以 SQLite `BEGIN IMMEDIATE` 串行化写事务；任务版本与尝试生命周期分开；数据库应用标识和版本防止误用其他数据库。
- [x] 提交记录与任务更新在同一事务写入；同幂等键、不同内容报冲突；重启后同内容返回原回执。
- [x] 用可控时钟验证过期旧凭据不能提交，用两个 OS 子进程验证领取恰好一个成功。

Run: `.venv/Scripts/python.exe -m unittest discover -s tests -p test_store.py -v`

## Task 2: Official MCP and command entry

- [x] 用官方 SDK 启动两个 stdio 服务，先写工具发现与任务交接检查，再实现六个工具。
- [x] 严格参数类型和长度，tool error 保留业务错误码；stdout 只承载协议，诊断走 stderr。
- [x] CLI 生成共享数据库的配置，不写入任何现有客户端全局配置；帮助和生成配置不创建数据库。
- [x] 验证 modern 和 legacy 协议、错误参数、相同请求重试、第三个服务进程读取持久结果。

```python
async with Client(parameters) as client:
    result = await client.call_tool("get_task", {"task_id": task_id})
    assert result.structured_content["status"] == "submitted"
```

Run: `.venv/Scripts/python.exe -m unittest discover -s tests -p test_mcp.py -v`

## Task 3: Reproducible learning delivery

- [x] 演示展示两个 SDK 客户端与重启，打印事件和关键状态，不显示领取凭据。
- [x] README 更新真实进度、安装命令、配置生成方式和下一阶段边界；学习文档解释事务、版本、租约和幂等。
- [x] 全套离线检查、演示、依赖一致性与 diff 检查；必要修复后再运行相关检查。
- [x] 增加 CI 配置，区分已在本机执行与尚未远端执行。记录验证日志。
- [x] 检查工作树，提交本轮相关文件；不推送、不创建远端仓库。

Run: `.venv/Scripts/python.exe -m unittest discover -s tests -v`

Run: `.venv/Scripts/python.exe -m examples.task_demo`

## Scope and acceptance

本轮交付可运行的任务协作基础与接入配置。真实 Codex/WorkBuddy 工具调用、Git 快照、审查与返修不因模拟检查通过而标为完成。现有 runner 的进程树取消要求仍在，未补齐前不通过它启动真实 Agent。

## Execution evidence

2026-10-25：已完成本轮实现与检查。最终全套 19 项通过（5.935 秒），双协议 stdio 演示通过，pip check 通过。本机配置 JSON/TOML 已生成与解析，合成验收任务为 ready；真实客户端待验收。见 `docs/learning/2026-10-25-acceptance.md`。本轮在当前会话执行，未安装额外执行框架。
