# Async Review MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让本地 MCP 发起、查询、读取和取消既有 Codex 审查，而不阻塞长请求。

**Architecture:** 原 SQLite 增量迁移；review_jobs.py 管理幂等、预算、文件锁和后台线程；CodexRpc 增加取消检查；server.py 暴露四个工具。按既定授权在当前会话分步实现。

**Tech Stack:** Python 标准库、SQLite、已安装 MCP 2.3.0 与既有受控进程树。

**Spec:** docs/superpowers/specs/2026-10-25-async-review-mcp-design.md

## Global Constraints

- 同数据库同时一个活动审查，单任务最多两次尝试，失败和取消计入；无自动重试。
- 同 task/request_id 同参数返回同 job，不同参数报冲突。
- 状态持久化，只有确认所有者锁释放才推断 interrupted；不按 PID 猜测。
- 取消先 cancelling，实际清理后 cancelled；服务关闭等待，不遗弃后台工作。
- 原任务数据完整迁移，列表与状态不泄露 token/提示/原始日志。
- 测试不调用模型；fixture 来源明确，正式 CLI 不提供冒充真实后端的开关。

## Tasks

- [x] 写实际 SQLite/线程用例，确认没有模块时失败；实现 schema1→2 与后台管理。
- [x] 在 CodexRpc/run_codex_review 加取消钩子，协议 interrupt 可忽略取消标记完成收尾。
- [x] MCP 四工具与生命周期接线；保留六个原任务工具。
- [x] 两个真实 stdio 服务与 SDK 客户端验证竞争、幂等、取消、分页和断线；终止服务后验证 interrupted、不自动重跑。
- [x] 补一键离线演示、WorkBuddy 配置/Skill 和第6课，运行必要回归：71项通过，69.218秒。
- [x] 记录 WorkBuddy 配置已保存、旧条目保留、首次信任待用户操作，以及本地交付。
- [x] 用户在 WorkBuddy 完成首次信任后，验收真实工具发现与 list_tasks：10/10启用，实际执行轨迹包含搜索与只读调用，参数及空列表响应与本地数据库一致。
- [ ] 另行记录真实开发/审查/修复闭环，不把只读连接成功当作完成。

关键断言：

```python
assert start_review(task_id, repo, base, request_id)['job_id'] == original['job_id']
assert get_review_status(job_id)['status'] == 'cancelling'
# 等实际运行者退出；不能把上面的请求状态当作终态。
assert get_review_status(job_id)['status'] == 'cancelled'
```
