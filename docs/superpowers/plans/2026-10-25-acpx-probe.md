# ACPX Runtime Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 本轮沿用已批准的隔离验证方向，在当前会话执行；不为执行流程新增技能框架。此探针是实验代码，不是已接入真实 Agent 的产品运行层。

**Goal:** 在本机 Windows 验证 acpx 0.21.0 自动启动、两阶段交接、会话延续、取消和失败识别。

**Architecture:** 使用安装包提供的 CLI 和 ACP SDK，不自己实现协议。JS 模拟 Agent 仅处理固定合成指令；Python 探针配置隔离 HOME、项目和事件记录，运行 acpx 子进程并断言结构化结果。

**Tech Stack:** Node.js 24.15.0、acpx==0.21.0、其实际安装的 @agentclientprotocol/sdk、Python 标准库。

**Spec:** `docs/research/2026-10-25-automatic-agent-runtime.md` 的“下一项最小验证”。

## Global Constraints

- 不调用模型、不读取账号凭据、不修改任何用户级配置。
- 安装目录 `.agent-review-loop/acpx`，npm 使用项目内缓存并关闭安装脚本。
- 子进程仅保留运行所需环境变量，HOME/USERPROFILE/APPDATA 指向本次探针目录。
- Agent 以 Node 的明确参数数组启动，Windows 不使用命令字符串猜测。
- 显式配置模拟 Agent 名称，禁止落入默认 Codex 或其他真实运行器。
- ACP 文件/终端能力关闭，权限 deny-all；模拟器自身只读写本次实验目录。
- 正常执行命令有超时，后台会话有短 TTL，模拟 Agent 自带退出安全时限。
- 验收记录区分“模拟器支持”“acpx 实际表现”和“真实客户端待验证”。

## Task 1: Install and model-free fixture

- [x] 核对 npm 发布版 0.21.0、engines 与 integrity，项目内安装并忽略安装脚本。
- [x] 创建 `examples/fixtures/acp_mock.mjs`，通过 SDK 的 AgentSideConnection 实现 initialize/newSession/loadSession/prompt/cancel。
- [x] 支持 echo、review、sleep、crash 固定动作，保存会话计数与收到的工作目录。

```javascript
return { stopReason: "end_turn" };
```

上述终态必须出现在协议响应，文本里包含“成功”不算完成证据。

## Task 2: Automated behavioral probe

- [x] 创建 `examples/runtime_probe.py`，验证安装版本，生成独立目录与配置。
- [x] 自动执行 executor→reviewer，并验证后者收到前者的产物。
- [x] 同一命名会话两次请求，校验 provider session ID 与持久计数。
- [x] 发起 sleep 后等待实际开始记录，再取消；校验终态，再发后续请求。
- [x] 触发 crash，要求非零退出/失败终态，不能把部分文本当成功。
- [x] 保存命令 stdout/stderr、模拟器事件、总结 JSON。
- [ ] 关闭会话稳定通过：executor 返回 QUEUE_OWNER_IDENTITY_UNVERIFIED，整体探针退出 1，保留待解决项。

```python
assert result["session_id"] == previous["session_id"]
assert result["turn"] == previous["turn"] + 1
```

Run: `.venv/Scripts/python.exe -m examples.runtime_probe`

## Task 3: Learning record and decision

- [x] 解释启动、结构化结果、会话身份与取消的关键代码。
- [x] 根据实测列出可采用部分与仍需验证的边界，保留不通过项。
- [x] 检查现有项目改动，保存探针与报告，不将隔离安装、HOME 或原始会话记录加入 Git。

实测及下一步决策：`docs/learning/03-automatic-runtime-probe.md`。正常/取消/崩溃分别关闭的最小复现作为下一项工作；本轮不把 acpx 升为生产调度依赖。

不在此计划内：真实 Codex/WorkBuddy 付费调用、账号接入、产品调度 API、Git 快照和真实审查质量。
