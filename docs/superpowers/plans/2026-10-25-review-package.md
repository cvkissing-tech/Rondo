# Review Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 按用户直接开发授权在当前会话逐项实现，不新增执行框架或子 Agent。设计延续上一轮已呈现并获继续开发授权的路线。

**Goal:** 保存可独立读取的代码快照，并验证审查意见绑定和过期行为。

**Architecture:** `snapshots.py` 负责 Git 与包，`reviews.py` 负责审查契约与历史；CLI 组合现有 TaskStore 和两个模块。不更改 MCP/SQLite schema。

**Tech Stack:** Python 3.11+ 标准库、Git 原生命令、现有 unittest。

**Spec:** `docs/superpowers/specs/2026-10-25-review-package-design.md`

## Global Constraints

- 不调用模型、不读取账号、不改用户全局配置、不自动提交或推送目标仓库。
- 保留真实 index 和 HEAD；新输出不可覆盖，不位于源工作目录内。
- 固定文件内容，包括未忽略的新增文件和二进制，最多 5000 文件、100 MiB 合计 blob。
- 子模块、链接/reparse、稀疏与 clean/smudge filter 明确拒绝。
- 双次捕获检测变化；调用方仍须暂停写入。包最后写 manifest，检查状态明确 not_run。
- 审查记录 current/stale/unchecked；未经当前代码核对不能宣称 review_approved。

## Task 1: Git snapshot and package

Files: `agent_review_loop/snapshots.py`, `tests/test_snapshots.py`。

Interfaces: prepare_workspace(repo, output_dir, base_ref='HEAD') -> dict; create_review_package(repo, base_ref, task, output_dir) -> dict; verify_package(package_dir) -> dict。

- [x] 用真实一次性 Git 仓库编写失败用例：新文件、删除、二进制和真实 index 不变。
- [x] 运行 `python -m unittest discover -s tests -p test_snapshots.py -v` 确认未实现时失败。
- [x] 临时 index 使用 `read-tree HEAD` → `add -A -- .` → `write-tree`；两次结果不等时报 SOURCE_CHANGED。以 `cat-file --batch` 导出 before/after，manifest 写 SHA256 和文件集合。

```python
before_index = index_path.read_bytes()
package = create_review_package(repo, base, task, output)
assert index_path.read_bytes() == before_index
assert verify_package(output)['snapshot_id'] == package['snapshot_id']
```

- [x] 验证副本固定、篡改/新增文件拒绝、边界/类型拒绝，Git 工作目录创建保留原分支和未提交内容。

## Task 2: Review contract and history

Files: `agent_review_loop/reviews.py`, `tests/test_reviews.py`。

Interfaces: save_review(package_dir, review) -> dict; review_status(package_dir, review_id, repo=None) -> dict。

- [x] 编写快照不匹配、错误文件/行号、布尔行号、重复意见 ID 的拒绝用例。
- [x] 实现规范 JSON 哈希生成 review_id，exclusive 写入 reviews/<id>.json，相同内容返回同一 ID。
- [x] 状态读取先校验包、审查，再比较同仓库当前 tree；历史文本保持原样。

```python
receipt = save_review(package_dir, approved_review)
assert review_status(package_dir, receipt['review_id'])['freshness'] == 'unchecked'
source_file.write_text('changed\n', encoding='utf-8')
assert review_status(package_dir, receipt['review_id'], repo)['freshness'] == 'stale'
```

## Task 3: CLI, offline demo and learning evidence

Files: `agent_review_loop/__main__.py`, `examples/review_demo.py`, `README.md`, `docs/learning/04-review-package.md`。

- [x] CLI package 通过 TaskStore.get_task 读取要求，不让用户在应用间手动传递领取信息。
- [x] workspace/package/record-review/review-status 的参数解析与错误都可实际运行。
- [x] 演示自动串起合成流程，并展示 review_approved true→false，无模型请求；原始运行目录加入既有忽略范围。
- [x] 全套 unittest、task_demo、review_demo 与差异检查。仅报告本机实测；源码/模拟流程与真实 Agent 分开。
- [x] 写重要代码的逐段解释、验收命令和未完成范围，保存本地提交。

验收：39 项本机检查通过（37.307 秒），task_demo/review_demo 均通过，pip check 通过。实际范围和待完成项见 `docs/learning/04-review-package.md`。
