# 第11课：让需求变成可恢复的执行计划

0.9.0 接通桌面中的显式 Codex 计划生成。保留 Jean 源码 UI，新增“执行计划”视图；生成一次之后可刷新、恢复、检查是否过期。WorkBuddy 自动执行与自动返修仍未接入，计划中的检查不会自动运行。

## 先体验

打开根目录 `Start-Desktop.cmd`，准备任务后切到“执行计划”，点击“生成 Codex 计划”。此按钮会使用当前本机 Codex 账号额度。生成与审查共用单个活动作业名额；每任务分别最多两次计划、两次审查，失败和取消也计入，不自动重试。

准备任务本身不调用模型。刷新、重开读取已经保存的计划也不调用模型。生成期间可切换视图；正常关闭工作台会请求停止自己的活动作业。关闭后恢复的是已保存的结果和终态，不会自动重新生成。

## 一条实际调用链

```text
任务的“生成 Codex 计划”按钮
  → preload.startPlan(task_id, request_id)
  → Electron 限定 IPC → 官方 MCP Client
  → start_task_plan → 已保存的工作区与 base_commit
  → PlanJobs：持久回执、幂等、额度上限、后台线程
  → 固定代码上下文 → 共享 run_inline_json → Codex App Server
  → 校验结构与路径 → plan.json + 内容哈希 + 数据库终态
  → read_plan → 右侧显示步骤、文件、验收与假设
```

这里继续采用官方 App Server 的 `thread/start`、`turn/start.outputSchema` 与事件终态；协议来源见 [官方文档](https://learn.chatgpt.com/docs/app-server)。没有新增 API Key 接入或另一套模型 SDK。

## 复用了哪些代码

- `codex_review.py` 提取 `run_inline_json()`，计划与审查共用本机登录检查、继承 MCP 禁用、只读线程、单轮输出、超时/取消和 ProcessTree 清理。原审查的快照与结果校验仍在原函数中。
- `planning.py` 的 `PlanJobs` 复用 `ReviewJobs` 的启动、幂等回执、预算、状态查询、取消、OS owner lock 与退出规则，只替换具体规划工作和读取结果。
- SQLite 升至 schema 4，增加与审查回执结构相同的 `plan_jobs`。计划和审查分别存放，旧审查工具不会把 plan_id 当 review_id；事务内同时检查两个表，防止跨角色并发启动。
- 界面继续使用已移植的 Button、Badge、Alert 与既有分栏，没有新建 UI 框架。

`start_task_plan` 使用已保存的任务目录，调用方不需要再次传入目录和基础提交：

```python
context = tasks.context(task_id)
plans.start_review(task_id, context['workspace'], context['base_commit'], request_id)
```

内部沿用生命周期类的 `start_review` 方法名，不意味着又执行了一次审查；`PlanJobs._work()` 调用的实际 runner 是 `run_codex_plan()`。

## 共享数据库不等于共享完整上下文

规划器取的是一个明确的输入包：任务需求、验收、固定 Git tree、有限文件列表和源码片段。

- 文件列表至多 300 项，编码后不超过 16 KiB。
- 按需求中的文件名词和 README/manifest 等规则排序；最多 6 个源码片段，每个至多 4 KiB，明确标记是否截断。
- 跳过大文件、二进制、依赖/构建目录以及常见凭据文件名；这是输入筛选规则，未实现完整秘密扫描器。
- 输入包至多约 60 KiB，最终业务 prompt 上限 64 KiB。没有发送聊天历史或整库记录。

这是可解释的文件名排序，尚未实现语义检索。模型必须在假设中说明缺少的上下文，不能把片段输入描述为已经读完仓库。

## 如何避免拿旧计划继续执行

```python
payload['context_id'] = digest(canonical(payload))
```

输入的需求、文件列表、片段和 Git tree 一起决定 context_id。模型必须原样返回这个编号；程序再次验证输入哈希、结果结构与相对路径。

```python
freshness = 'current' if current_tree(repo) == context['target_tree'] else 'stale'
```

计划原文另外计算 plan_id 并存入回执。读取时校验 plan_id，文件被修改则拒绝作为原结果；代码 tree 改变则标为 stale。文件名不要求已经存在，因为计划也可能创建新文件，但必须是工作区内合法相对路径。

结果最多 8 步，每步包含 title、details、files、verification，另有 summary 与 assumptions。verification 是文本，程序不会把模型字符串交给 shell 执行。界面只清理重复步骤编号的显示前缀，保存的模型原文不改写。

## 本轮真实验收与成本事实

在隔离 Git 项目中，通过真实 Electron 按钮只生成一轮计划，使用本机已登录 Codex。结果是 3 步：确认工作副本边界、修改脚本并新增说明、验证输出和差异。计划保存、工作台重开恢复、代码改变后 stale 提示均通过。

| 项目 | 实际记录 |
| --- | --- |
| 模型 | gpt-6.1-sol，来自本机配置 |
| 生成轮数 | 1，没有模型重试 |
| 调用耗时 | 35.083 秒，包含本地调用准备与进程退出 |
| 业务 request.txt | 1,195 字节 |
| 输入 tokens | 26,093 |
| 输出 tokens | 1,016 |
| 合计 tokens | 27,109，缓存输入 0 |
| 费用 | 接口未返回，不能据此计算金额 |
| 进程清理 | process_tree_closed=true |

业务 prompt 很小，但实际模型输入仍有大量运行环境开销；具体组成尚未进一步隔离。不能根据代码片段大小宣称调用便宜，也不能据此承诺节约固定比例。因此当前保持显式生成、单活动作业与持久两次上限。

证据位于忽略于 Git 的 `.agent-review-loop/desktop-smoke-tUYGTD/`。`runs/.../runtime/result.json` 是原调用记录；`real-plan.json` 是 MCP 读取结果。后续界面复拍使用 `capture-plan.mjs` 重读同一个 plan_id，未发起新生成。最初一次验收等待条件提前结束，记录为 turns_started=0/cancelled，已修复等待逻辑；它没有产生模型调用。

## 验证命令

```powershell
.venv/Scripts/python.exe -m unittest tests.test_store tests.test_review_jobs tests.test_task_launch tests.test_codex_review tests.test_planning tests.test_mcp
npm --prefix desktop run lint
npm --prefix desktop run build
npm --prefix desktop run smoke
```

默认 smoke 不调用模型。只有显式设置 `ARL_SMOKE_REAL_PLAN=1` 时才通过按钮实际生成一次，消耗账号额度；不要把这个开关放进常规 CI。

本轮相关存储/审查/任务回归 25 项、规划与 MCP 集成 9 项通过；提取共享调用后原审查 7 项通过，最终规划/共享调用的相关 12 项也通过。它们有重复覆盖，不把这些数字相加当成独立测试数。本机 Windows 已实际运行，其他桌面平台未验收。
