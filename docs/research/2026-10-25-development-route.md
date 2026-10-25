# 开源参考后的继续开发路线

复核日期：2026-10-25。范围：GitHub README、指定提交的源码、官方接口文档，以及本项目已有 Windows 模拟运行证据。本轮未运行 Emdash、Superset、Vibe Kanban 或 Clodex，也未调用真实模型。

## 决策

保留当前 Python + SQLite + MCP 核心，把项目收敛为可自动交接的执行/审查流程。参考成熟工作台的接入边界，参考小型工作流的快照绑定；不整体搬入另一套桌面应用、数据库和云端体系。acpx 是待验收的运行组件，不成为业务状态的唯一持有者。

## 源码参考与采用边界

| 项目及读取提交 | 已核对源码 | 我们采用什么 |
| --- | --- | --- |
| [Emdash](https://github.com/generalaction/emdash/tree/e21cd3d84fd025546bdd4c4aef879336c7a91a20) | `packages/plugins/src/agents/registry.ts`、`impl/codebuddy/index.ts`、`agents/integrations/providers.md`、`packages/core/src/runtimes/workspace-registry/node/create-worktree.ts` | 能力声明、明确 argv、真实生命周期事件、worktree 创建阶段与失败回滚的思路；不整套移植其插件系统和服务容器 |
| [Clodex](https://github.com/9thLevelSoftware/Clodex/tree/acde0309a15489e22929517b05bf3d7adb1afeac) | `clodex/workflow.py`、`clodex/workspace.py` | diff 哈希绑定、审查失败不能放行、有界返修、独立工作目录；使用原生 Git 重新实现本项目所需的小范围逻辑 |
| [acpx](https://github.com/openclaw/acpx/tree/36b4253eb6a1a829d602375cd0087a56c0b782f5) | `docs/agents.md`、此前已核对的会话/流程文档及本机 0.21.0 运行包 | 通过公开 CLI/runtime 调用，固定版本；Windows 关闭失败未解决前保持实验状态 |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban/tree/d5cbb5380fa0b32e98ef9b8d987f63decce4be3a) | `crates/executors/src/executors/mod.rs`、`codex/review.rs`、README | 初始执行/续接/审查分开处理；取消请求与退出结果分开；Codex 原生审查入口的参考，不引入整套 Rust 后端 |
| [Superset](https://github.com/superset-sh/superset/blob/6277058f17204959d1d42d8c963885396b0ad398/README.md) | README；递归源码树请求失败，本轮不声称已审查其实现 | 参考任务工作区、差异审查的产品组织；README 明确 Windows 尚未提供，不能当作本机可直接采用的底座 |
| [WorkBuddy PHP SDK](https://github.com/JaguarJack/workbuddy-openapi/blob/738f794a73bc327d730ffbcb29b220e4e39863d2/src/Actions/LocalAssistant/SendMessage.php) | SendMessage.php 与官方 Open API | HTTP 契约与错误处理参考；不为此引入 PHP，不以消息发送成功代替代码任务完成 |

Emdash README 列出 Windows 安装包，但未在本机安装或验收。其 CodeBuddy 插件明确启动 `@tencent-ai/codebuddy-code` 的 `codebuddy`/`cbc`，ACP 参数是 `--acp`；这不能证明已接入 WorkBuddy 桌面应用，也不能证明复用了 WorkBuddy 的模型、账号或 Skills。

[Vibe Kanban 官方公告](https://www.vibekanban.com/blog/shutdown)说明公司停止运营、项目转向开源社区维护，本地工作区继续工作。因此不能把它描述为代码不可用或无人维护；采用时应自行固定和验证源码，不依赖原公司的服务承诺。

## 下一项可验收交付

先完成 Git 快照和审查包，因为它不依赖真实模型和 acpx 关闭问题：

1. 使用一次性测试仓库，从指定基础提交创建本任务拥有的工作目录；不改变用户原仓库未提交内容。
2. 在任务工作目录写入固定合成改动，捕获新增、修改、删除等文件与代码内容；明确未跟踪文件、二进制、子模块的处理边界，不静默漏掉。
3. 生成审查包：任务要求、基础提交、不可变快照标识、文件清单、差异、检查命令/退出码/日志和未执行项。
4. 模拟审查结果绑定快照标识。文件再变，旧审查保持历史记录并标为过期，不能继续作为新版本通过依据。
5. 从持久记录恢复时不重复执行已完成阶段；无法判定真实执行结果时转为待核查，不自动再消费模型额度。

真实审查者需要读取代码时，应提供固定快照的单独工作目录；只保存 diff 的哈希不能阻止其读到随后变动的文件。Git worktree 隔离文件，不隔离进程权限；审查只读还需运行器能力和权限验收。

## 后续交付顺序

1. 完成上述快照/审查包与离线验收。
2. 并行推进工作项而非并行调用模型：提取 acpx Windows 正常/取消/崩溃关闭的最小复现；独立核对两个真实 Agent 的调用入口。运行组件不合格不阻塞业务核心。
3. Codex 优先验证[官方 App Server](https://learn.chatgpt.com/docs/app-server)的 review/start、完成事件和中断；与 ACP 候选实测比较后首版只维护一条生产调用路径。
4. WorkBuddy 依[官方本地助理 API](https://open.workbuddy.cn/docs/openapi)核实目标工作目录、请求/回复关联与完成/停止语义；缺少证据时标记自动化能力未验证。云端任务 ACP 和 CodeBuddy CLI 均须单列，不能作为现有桌面会话的等价替换。
5. 真实端到端首版：一次执行、自动检查、固定快照、一次独立审查、用户选定意见后一次修复；限额/超时/失败保存结果并停止。修复产生新快照，是否复查按预算和用户选择处理。
6. 流程可靠后增加薄桌面界面：任务、运行状态、代码差异、审查意见、修复选择。MCP 与界面调用同一核心，后续可由其他工作台调用。

## 完成标准

一条任务记录能够回答：由谁、使用哪个已确认模型/环境、在哪个代码版本、做过哪些检查、发现什么问题、修复过哪些意见、哪里仍未完成。未报告的用量保持未知；日志和审查包不包含密钥。模型输出必须验证结构及文件定位；结构无效保留原始文本并标记失败，不解析为已通过。

这使学习重点落在进程与协议、Git、持久状态、失败恢复和可验证审查，并能自然产出上游复现/回归测试或适配贡献。对外提交 issue/PR 前另核对对应项目当前贡献流程；本轮没有发布或发送任何内容。
