# Snapshot Checks Implementation Plan

> **For agentic workers:** 本次按用户“直接进入开发”的指示，在当前会话执行并记录检查点，不额外启动子Agent。

**Goal:** 在既有后台审查前执行明确配置的检查，绑定代码版本与证据，失败时不消耗Codex生成额度。

**Architecture:** checks.py复用ProcessTree执行；snapshots.py绑定和校验证据；ReviewJobs把检查接入准备阶段，CLI传递只读启动配置。数据库保持v2。

**Tech Stack:** Python标准库、既有MCP/SQLite与受控进程树，无新依赖。

**Spec:** docs/superpowers/specs/2026-10-25-snapshot-checks-design.md

## Global Constraints

- MCP不接收任意检查命令，也不自动执行仓库中的配置。
- 无配置保留原有not_run语义。
- 检查在副本after目录执行，结果和日志保存在副本外；不安装依赖。
- 非零、超时、取消、输出过量、启动/清理失败、文件改变都停止审查，无自动重试。
- 日志每流最终保存最多1MiB；不承诺运行期间磁盘硬配额。
- 配置身份纳入请求指纹；数据库结构不变；默认不调用任何模型。

## Task 1: 执行与证据

Files: 新增agent_review_loop/checks.py、tests/test_checks.py，扩展snapshots.py。

- [x] 写实际Python检查用例，先确认缺少run_checks时失败。
- [x] 实现validate_config/load_check_config/run_checks，复用ProcessTree，记录退出、取消与日志摘要。
- [x] 实现bind_check_evidence，verify_package校验checks/result.json与日志及输入快照。
- [x] 验证passed后日志被修改则PACKAGE_CHANGED，检查改写副本则changed，源仓库保持原样。

核心验收：

```python
result = run_checks(package, output, {'argv': [sys.executable, '-c', 'print(42)'], 'timeout_seconds': 5})
assert result['status'] == 'passed' and result['exit_code'] == 0
manifest = bind_check_evidence(package, output)
assert verify_package(package)['checks']['record_id'] == manifest['checks']['record_id']
```

## Task 2: 接入后台与CLI

Files: review_jobs.py、__main__.py、codex_review.py、server.py、tests/test_review_jobs.py、tests/test_review_mcp.py、tests/fixtures/review_service.py。

- [x] ReviewJobs接收冻结的check_config；加入幂等指纹；准备包后执行并绑定证据。
- [x] 非passed不启动runner；status返回有界checks摘要与证据路径；CLI serve/config增加--check-config。
- [x] 测试failed时runner调用0次、passed时审查收到最终snapshot_id、配置变化同请求报冲突；真实MCP返回checks。
- [x] 审查提示按manifest.checks描述证据，避免硬编码“未运行检查”；公共入口阻止失败包直接进入Codex。

## Task 3: 可运行学习交付

Files: examples/checked_review_demo.py、docs/learning/07-snapshot-checks.md、README.md、pyproject.toml、CI配置及WorkBuddy交接说明。

- [x] 一键演示真实测试失败→改代码→通过→fixture审查→篡改被发现，所有模型调用0。
- [x] 写重要代码、失败/通过证据、范围与限制；最终85项通过，78.239秒；额外复现并修复慢取消查询绕过期限的问题。
- [x] 检查差异并保存本地交付，不将本机配置、日志或账号资料加入Git。
