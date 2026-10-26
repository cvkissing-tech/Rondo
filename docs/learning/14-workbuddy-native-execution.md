# 第14课：Rondo 指挥 WorkBuddy 原生执行

本文记录0.11.0；后续一次自动返修见[第15课](15-bounded-repair.md)。

本次将两段现成能力连起来：开源项目提供的 WorkBuddy 原生会话 RPC，以及 Rondo 已有的任务、MCP 提交、固定快照检查和 Codex 审查。产品界面继续使用 Jean / T3 WorkLog，不增加一套新视觉系统。

## 1. 真正接入的是 Agent 环境

Rondo 通过本机调试通道进入 WorkBuddy 主渲染进程，再调用它已经实现的 MessageChannel RPC。模型、Skills、MCP、工具执行与权限仍由 WorkBuddy 管理。这里没有把 DeepSeek 的 API 包装成一个假的 WorkBuddy。

```text
Rondo：任务 + 独立 Git 工作区
  → Codex：生成并保存与代码版本绑定的计划
  → ExecutionJobs：保存原生会话 ID，再派发一次
  → WorkBuddy：读取 MCP 任务、领取、修改、运行检查、提交
  → 原生回合结束 + 对应执行者的 MCP 提交
  → ReviewJobs：固定代码包 → 配置的检查 → Codex 审查
```

原生 RPC 从 `dudu555-djiao/codex-workbuddy-gateway` 固定提交直接适配，Windows 激活方式参考 `Kxiandaoyan/workbuddy-acp-bridge`。源码位置、commit 和差异见 [`NATIVE-NOTICE.md`](../../integrations/workbuddy/NATIVE-NOTICE.md)。其余调研项目只作对照，没有为了数量引入不需要的网关。

## 2. 三段值得读的代码

先看 [`native-bridge.mjs`](../../integrations/workbuddy/native-bridge.mjs)。这是复用的协议核心：

```javascript
const mc = new MessageChannel()
window.postMessage({
  type: 'workbuddy:open-local-daemon-transport-port',
  target: { transportType: 'local' }
}, '*', [mc.port2])
```

这不是 MCP。它打开 WorkBuddy 自己的本地守护进程 RPC，然后使用 `workspace:initialize`、`session:create`、`session:sendMessage`。MCP 用于任务读取、领取和结果回传。两种通道各自负责自己擅长的环节。

然后看 [`execution.py`](../../agent_review_loop/execution.py)：

```python
self._save_details(job_id, details)  # 先保存 session_id，再发送
result = self.runner(payload, directory / 'runtime', executable,
                     cancel_check=lambda: self._cancelled(job_id), on_event=event)
submitted = self.store.get_task(task['task_id'])
# 核对 submitted 状态及 attempts.owner 与本作业一致，之后才成功。
review = self.reviews.start_review(task['task_id'], str(repo), base_ref,
                                   'execution-' + job_id)
```

原代码还有取消、失败和对应执行者检查。设计要点是：派发成功、模型回合结束、提交了结果、测试通过、审查通过，是五件不同的事。结果查询不应该产生新的模型调用。发送不确定时直接自动重试可能令同一工作区被重复修改，因此这里保存会话供核对。

最后看 [`taskFlow.ts`](../../desktop/src/renderer/src/taskFlow.ts) 与 [`TaskTimeline.tsx`](../../desktop/src/renderer/src/TaskTimeline.tsx)：它们把持久状态映射成阶段和操作。界面轮询的是记录，没有自己计时模拟完成百分比，也不会因重新打开页面重发任务。

## 3. 本机真实验收（2026-10-26）

环境：Windows、WorkBuddy 5.9.2、已有受信任的本地 MCP；本轮仅为正常退出并由 Rondo 启动的 WorkBuddy 开启 loopback 调试端口。无需第三方开发者应用。

隔离任务修复 `slugify` 连续空白及首尾空白问题，原始 fixture 有四个有意义的测试，其中空白测试在原实现失败。WorkBuddy 使用 `deepseek-v4.1-flash`，只修改 `slug.py`：

```python
def slugify(value):
    return "-".join(value.lower().split())
```

任务 ID `1`；计划 `dc79094dbca942ec8d9b4bdcc5fd51db`；原生执行 `38c33f8b6df44bc5a53df6277c5a5be8`；自动审查 `02131275c5bf4e38b8eb6457545efe0d`。

实际结果：原生派发回执确认，MCP 领取和提交者匹配，执行回合正常结束；Rondo 在固定副本运行 `python -m unittest -q`，4个测试通过、exit code 0、检查未改变代码。Codex 返回 `approved`，读取时新鲜度为 `current`。这证明这一任务的闭环通过，不代表任意项目或后续 WorkBuddy 版本都已经验证。

本地原始证据位于忽略于 Git 的 `.agent-review-loop/native-connection/live-e1a03ba4dd/evidence.json`，包含目录、作业状态、检查记录和审查结果；同目录保留验收前 SQLite 备份。代码未提交到原项目，fixture 在专用目录中。

普通检查不调用模型：Python 102个测试通过；原生传输 fixture 4个测试通过；前端状态断言15项；Electron 零模型 smoke 覆盖任务创建、恢复、差异、外部领取/提交及页面操作。真实验收单独消费了一次计划、一次 WorkBuddy 执行和一次自动审查。平台未返回的费用记为未知。

## 4. 当前边界

- 桌面“Agent 连接”可检查或启动通道；正在运行且未打开调试端口时，要正常退出后重新启动。
- 执行仍遵循 WorkBuddy 的原生权限要求；等待权限会显示等待状态。
- 每个任务一次派发。模型回执不明确时停止，防止重复执行。
- 审查发现问题后自动返修，是下一段独立功能；本轮没有把它标为完成。
- 未配置固定检查时记录 `not_run`。独立安装包与跨平台适配后续处理。
