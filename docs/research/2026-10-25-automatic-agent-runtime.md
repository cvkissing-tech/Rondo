# 自动执行与审查：开源运行组件复核

日期：2026-10-25。目标是一次发起任务后，系统启动执行 Agent、收集结果，再交给审查 Agent；用户无需在两个产品之间传递任务编号。

本轮只检索与阅读源码，不安装候选运行器、不触发模型、不更改客户端配置。现有 0.2.0 的共享任务层保留；它不等于自动调度已经完成。

## 决策摘要

1. 优先验证 acpx 的会话运行能力，避免重新编写整套 ACP 客户端、会话管理、取消与流式事件解析。
2. 参考 Clodex 的差异绑定、审查失败处理与有界返修流程；当前项目是 Python，但不因此把耦合的工作流类直接整段搬入。
3. WorkBuddy 采用独立适配路线，先验证官方本地助理 API 能否满足指定项目、结果关联和实际运行环境要求。现有 PHP SDK 可作为请求、响应与测试的参考。
4. 尚不能宣称已有开源组合可在本机直接完成 Codex + WorkBuddy 的完整自动闭环。真实模型调用和账号权限仍未验证。

## 主候选：openclaw/acpx

阅读提交：`36b4253eb6a1a829d602375cd0087a56c0b782f5`；package.json 版本 0.21.0，Node.js >=22.13.0。本机 Node.js 实测 24.15.0，满足所声明的运行版本要求，但不等于安装或运行通过。

- [项目说明](https://github.com/openclaw/acpx/blob/36b4253eb6a1a829d602375cd0087a56c0b782f5/README.md)：无界面 ACP 客户端，支持持久会话、一次性执行、取消和机器可读输出。
- [Agent 注册表与说明](https://github.com/openclaw/acpx/blob/36b4253eb6a1a829d602375cd0087a56c0b782f5/docs/agents.md)：Codex、Claude 等映射到各自 ACP 适配；当前内置表未列出 WorkBuddy。
- [流程说明](https://github.com/openclaw/acpx/blob/36b4253eb6a1a829d602375cd0087a56c0b782f5/docs/flows.md)与[流程实现](https://github.com/openclaw/acpx/blob/36b4253eb6a1a829d602375cd0087a56c0b782f5/src/flows/runtime.ts)：支持 Agent 步骤、确定性动作、分支、检查点与运行记录。可评估直接采用 CLI 或公开 runtime/flows 导出，不抽取内部私有模块。
- [Windows 自定义 Agent 说明](https://github.com/openclaw/acpx/blob/36b4253eb6a1a829d602375cd0087a56c0b782f5/docs/custom-agents.md)：要求使用明确的 argv 配置；具备 ACP 能力是前提。
- [取消后继续会话的协议用例](https://github.com/openclaw/acpx/blob/36b4253eb6a1a829d602375cd0087a56c0b782f5/conformance/cases/020-cancel-then-followup.json)、[流程测试](https://github.com/openclaw/acpx/blob/36b4253eb6a1a829d602375cd0087a56c0b782f5/test/flows.test.ts)：存在模拟 Agent 检查，未在本机运行。

采用前核验：固定发布版本及其依赖，Windows 启停和取消、工作目录含空格、连续会话、已选模型与权限是否真正生效。项目仍处于 1.0 前，不能使用不固定版本的自动升级作为验收基线。

## 工作流参考：9thLevelSoftware/Clodex

阅读提交：`acde0309a15489e22929517b05bf3d7adb1afeac`。

- [workflow.py](https://github.com/9thLevelSoftware/Clodex/blob/acde0309a15489e22929517b05bf3d7adb1afeac/clodex/workflow.py)：自动规划、实现和审查，针对差异计算哈希；审查失败时提取意见交回实现者，限制修复次数。
- [delegate.py](https://github.com/9thLevelSoftware/Clodex/blob/acde0309a15489e22929517b05bf3d7adb1afeac/clodex/delegate.py)：后台执行、存活状态、结果记录和取消。
- [test_workflow.py](https://github.com/9thLevelSoftware/Clodex/blob/acde0309a15489e22929517b05bf3d7adb1afeac/tests/test_workflow.py)：有模拟 CLI 的工作区隔离、驳回后修复、无修复预算时阻塞等检查。

适用限制：流程主要围绕 Claude/Codex，命令、配置、状态和产物模块有耦合。其修复预算、审查者数量、重试策略不直接沿用；我们保留已商定的一次修复及明确停止条件。源码中的 Agent 能力描述仍需针对本机版本验证。

## WorkBuddy 接入参考：JaguarJack/workbuddy-openapi

阅读提交：`738f794a73bc327d730ffbcb29b220e4e39863d2`。这是 PHP SDK，不是 Python 运行组件。

- [发送本地助理消息](https://github.com/JaguarJack/workbuddy-openapi/blob/738f794a73bc327d730ffbcb29b220e4e39863d2/src/Actions/LocalAssistant/SendMessage.php)：调用 `/localassistant/message`，正文为 content 与 msg_type。
- [增量读取消息](https://github.com/JaguarJack/workbuddy-openapi/blob/738f794a73bc327d730ffbcb29b220e4e39863d2/src/Actions/LocalAssistant/ListMessages.php)：按 message_id 获取后续消息。
- [架构文档](https://github.com/JaguarJack/workbuddy-openapi/blob/738f794a73bc327d730ffbcb29b220e4e39863d2/docs/architecture.md)、[模拟 HTTP 测试](https://github.com/JaguarJack/workbuddy-openapi/blob/738f794a73bc327d730ffbcb29b220e4e39863d2/tests/WorkBuddyTest.php)：覆盖调用封装与错误行为，不当作真实账号验证。

已与[官方 Open API 文档](https://open.workbuddy.cn/docs/openapi)交叉核对：本地助理可查在线状态、发消息、读取消息；需开发者应用与用户授权。官方的任务 ACP 通道对应云端任务，不等同于控制现有桌面会话。

本地发送接口的公开参数中未见项目目录、会话 ID 或模型选择。因此“发送消息成功”不是“目标项目和环境正确”的证据。还须验证执行落点、消息与任务的关联、实际结束标志、工具审批和限额行为。未验证前不把轮询到一段助理回复认作完整代码任务成功。

不为少量 HTTP 调用额外引入 PHP 运行时。若官方接口满足需求，采用其接口契约和必要检查，在现有 Python 项目做小型适配。

## 备选与不采用的原因

| 候选 | 可取之处 | 当前取舍 |
| --- | --- | --- |
| [thomaswitt/mcp-agents](https://github.com/thomaswitt/mcp-agents) | MCP 外层、Codex App Server 内层，后台任务、结果分页和取消 | 可作为另一运行桥候选；README 要求 Node 26+，高于本机 24；没有确认 WorkBuddy 支持 |
| [nklisch/peeragent](https://github.com/nklisch/peeragent) | 直接 CLI 委派、异步等待、返回精简结果 | 适合小型替代方案；预编译插件主要覆盖 Linux/macOS，Windows 另需源码安装；未确认 WorkBuddy 支持 |
| [akashpandey/agent-relay](https://github.com/akashpandey/agent-relay) | 本地 CLI/MCP 委派与结果约定 | 文档注明原生 Windows 未验证，不列为当前主选；勿与 AgentWorkforce/relay 混淆 |
| [ulpi-io/plugin-handoff](https://github.com/ulpi-io/plugin-handoff) | 实现、审查、验证的结果契约，按 provider 检查能力 | Codex 适配明确隔离用户配置，并显式传入获准 MCP；不等于完整保留用户原环境，仅参考契约与检查 |
| [BlueSkyXN/tencent-workbuddy-sdk](https://github.com/BlueSkyXN/tencent-workbuddy-sdk) | 企业 skills/models/members/usage 管理 API | 仓库明确不是 Agent Runtime，不能解决本次桌面执行调度 |

## 下一项最小验证

先用隔离的模拟 Agent 验证候选运行器：自动启动→发任务→接收结构化终态→取消→再次调用，并验证 Windows 与错误退出；此阶段不需要模型账号。

再分别验证 Codex 与 WorkBuddy 的真实执行入口。Codex 有[官方 App Server](https://learn.chatgpt.com/docs/app-server)的 thread/turn/review 接口，可与现成适配比较；WorkBuddy 优先核验上述正式本地助理接口。真实模型验证前明确一个小任务、目录、权限与执行上限。

只有执行落点、结果关联与停止行为都验证后，才接入我们的 SQLite 状态和审查流程。MCP 作为用户或 Agent 调用产品的入口保留；不再要求用户手动把同一个任务在两个应用之间传递。
