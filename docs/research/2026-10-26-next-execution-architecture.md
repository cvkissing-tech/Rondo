# 0.10.0之后：执行接入与有界协作架构建议

调研日期：2026-10-26。基线：本地提交33e6201。此文是源码核对后的开发建议，
没有修改运行逻辑、接入账号或发起新的模型任务。只抽样阅读列明模块，不等于运行验收这些完整产品。

## 产品与本轮判断

产品继续定位为本地、个人使用的已有Coding Agent协作工作台：用户提出需求，
产品管理工作区、任务交接、检查和独立审查。已有自己的桌面、18个MCP工具、Git隔离工作区、
持久规划/审查、检查包与工作记录。下一阶段重点接真实执行器。

本地源码事实：
- agent_review_loop/workbuddy.py只有OAuth辅助、回调交换和assistant_online；没有发送任务/拉取回复/完成关联。
- store.py claim_task在任务submitted后明确拒绝再次领取，错误码TASK_SUBMITTED。
  因此现有一次性交接不能直接循环成返修，执行轮次需要单独记录。
- ReviewJobs已有持久回执、稳定请求号、OS owner lock、取消、两次上限；执行作业应复用这些已验证机制。
- 检查使用显式配置、固定代码包；不把模型给出的命令字符串直接当检查配置。

## 已核对的开源来源

### Vibe Kanban：执行器边界、退出信号和日志

固定版本：[d5cbb5380fa0b32e98ef9b8d987f63decce4be3a](https://github.com/BloopAI/vibe-kanban/tree/d5cbb5380fa0b32e98ef9b8d987f63decce4be3a)

- [执行器trait](https://github.com/BloopAI/vibe-kanban/blob/d5cbb5380fa0b32e98ef9b8d987f63decce4be3a/crates/executors/src/executors/mod.rs)：spawn/current_dir、follow_up/session_id、review、能力声明、日志规范化、exit_signal与cancel分别建模。
- [ACP会话日志](https://github.com/BloopAI/vibe-kanban/blob/d5cbb5380fa0b32e98ef9b8d987f63decce4be3a/crates/executors/src/executors/acp/session.rs)：持久JSONL与事件规范化。
- [执行日志服务](https://github.com/BloopAI/vibe-kanban/blob/d5cbb5380fa0b32e98ef9b8d987f63decce4be3a/crates/services/src/services/execution_process.rs)：包含从SQLite日志迁往本地文件的实现。

适用：借鉴很小的执行器输入/会话/完成/停止契约和事件归一化。
Rust/sqlx/Tokio整套不能直接作为本Python后端的可调用组件；无需为复用它重写后端。
我们的原始事件文件+SQLite概要已有相似基础，可延续。

### T3 Code：实例配置、会话身份与实际可用工具

固定版本：[4e493b1492c295475e5c4d1b971677b1bd305960](https://github.com/pingdotgg/t3code/tree/4e493b1492c295475e5c4d1b971677b1bd305960)

- [CodexDriver](https://github.com/pingdotgg/t3code/blob/4e493b1492c295475e5c4d1b971677b1bd305960/apps/server/src/provider/Drivers/CodexDriver.ts)：provider实例、配置、环境与continuation身份分开处理。
- [ProviderOrchestrationAdapterInfrastructure](https://github.com/pingdotgg/t3code/blob/4e493b1492c295475e5c4d1b971677b1bd305960/apps/server/src/provider/ProviderOrchestrationAdapterInfrastructure.ts)：provider实现与调度基础设施分开。
- [CodexDeveloperInstructions](https://github.com/pingdotgg/t3code/blob/4e493b1492c295475e5c4d1b971677b1bd305960/apps/server/src/provider/CodexDeveloperInstructions.ts)：按实际工具可用性构造上下文，不向模型描述不存在的工具。
- [ClaudeSkillDispatch](https://github.com/pingdotgg/t3code/blob/4e493b1492c295475e5c4d1b971677b1bd305960/apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts)：不同harness的Skill派发有特定规则，不能只靠统一文本假定兼容。

适用：每个角色保留自己的模型/账号/配置根目录/Skills能力说明，任务只交接必要输入。
其Effect与内部contracts耦合较重，不整套移植；纯函数需核对依赖和具体用途后再选取。
不复制该项目账号托管/令牌代理系统作为本项目前置条件。

### Agent Orchestrator：真实轮次身份、防止旧回复串入新任务

原ComposioHQ地址已跳转，当前是[OrchestratorInc/agent-orchestrator](https://github.com/OrchestratorInc/agent-orchestrator)，
固定版本e7e0fd87d99212140270486f7bb6653789b8c628，抽样后端为Go。

- [agent_continuation.go](https://github.com/OrchestratorInc/agent-orchestrator/blob/e7e0fd87d99212140270486f7bb6653789b8c628/backend/internal/ports/agent_continuation.go)：产品会话ID与原生会话ID/配置目录分开，available/unavailable/unknown三态。
- [terminal_turns.go](https://github.com/OrchestratorInc/agent-orchestrator/blob/e7e0fd87d99212140270486f7bb6653789b8c628/backend/internal/lifecycle/terminal_turns.go)：按时间和turn身份拒绝旧stop回答新的请求。
- [steps.go](https://github.com/OrchestratorInc/agent-orchestrator/blob/e7e0fd87d99212140270486f7bb6653789b8c628/backend/internal/lifecycle/steps.go)：有界工具步骤环；源码明确它只在内存，重启后清空。

适用：任务ID、执行轮次、Agent原生会话、代码快照分别关联；没有证明时标unknown。
不把内存步骤环复制成我们的持久历史，也不引入其完整Go daemon和云端栈。

### acpx：通用ACP接入候选，暂不作为默认运行器

固定版本：[36b4253eb6a1a829d602375cd0087a56c0b782f5](https://github.com/openclaw/acpx/tree/36b4253eb6a1a829d602375cd0087a56c0b782f5)

[执行契约](https://github.com/openclaw/acpx/blob/36b4253eb6a1a829d602375cd0087a56c0b782f5/src/session/execution/contracts.ts)
含cwd、sessionId/requestId、权限、队列等待和取消结果，可作为可执行CLI依赖候选。
本机既有探针曾在Windows关闭会话时报QUEUE_OWNER_IDENTITY_UNVERIFIED，见第3课；
本轮未重新运行或证明已经修复。先用旧复现定位/修复，再决定生产接入。
它不自动赋予WorkBuddy ACP能力。

## WorkBuddy正式通道的实际边界

更新：同日后续找到真实桌面ACP/原生RPC开源实现，详见
[Rondo本地执行桥接调查](2026-10-26-workbuddy-native-bridge-survey.md)。
下述OAuth条件只适用于官方Open API路线，不是所有本机接入方案的共同前置条件。

[官方Open API文档](https://open.workbuddy.cn/docs/openapi)目前列出OAuth第三方应用、
本地助理在线查询、消息发送触发任务、消息历史增量查询。
本地发送的公开body是content/msg_type，返回message_id。
这些定义不能单独证明可指定工作目录、远程选模型、停止执行、独立会话隔离或可靠完成通知。

建议：正式API负责唤醒/发送带task/run标识的指令，已有本地MCP负责领取任务上下文与提交结果。
先在一个实验工作区证明任务、目录、会话与结果可以正确关联。
接口不足的部分按已授权范围用REA定位本地任务入口和事件，再做小型运行验证；
UI逆向结果不能替代执行协议证明。

目前用户没有第三方应用，正式OAuth接入仍需要应用、权限审核及用户授权。
[第三方应用指南](https://open.workbuddy.cn/docs/third-party-app)中的硬件接入面向设备厂商及合作伙伴；
积分兑换应用的权限不等同于本地助理权限。不能假定个人项目创建应用后就能调用本地执行。
同时，[Open API准备工作](https://open.workbuddy.cn/docs/openapi)也列出Buddy应用，
[Buddy应用指南](https://open.workbuddy.cn/docs/buddy-app)有OAuth授权列表、回调、预览和审核流程。
因此不能断言硬件合作伙伴是唯一入口；Buddy应用能否申请所需本地助理scope仍待实际确认。
没有凭据时可以完成协议适配、离线回放与授权入口；不能将其算作真实WorkBuddy派发完成。
不以直连DeepSeek API替代用户要求的WorkBuddy环境。

### Rondo：权限资格核查（2026-10-26）

产品名称确定为Rondo。本次单独核查开放平台资格，不将接口存在当成权限可获得的证明。

- [入驻指南](https://open.workbuddy.cn/docs/onboarding)明确支持个人实名认证。
- [第三方应用权限配置](https://open.workbuddy.cn/docs/third-party-app)明确列出本地助理两个scope；
  硬件接入可申请全部scope，积分兑换仅开放对应能力域。
- Buddy应用有OAuth授权列表，但公开资料未明确个人主体能否为独立桌面产品申请这两个scope。
- 本次实际打开开放平台申请入口，IAB与Edge均未登录；Edge停在微信扫码登录页。
  尚未看到账号级申请选项，未创建应用、提交审核、接受条款或取得任何权限。
- 最终是否获批只能由平台审核结果确认；后台能选择scope也只证明可以提交申请。

登录后依次检查主体认证状态、Buddy/硬件应用创建资格、本地助理scope是否可选、
申请场景是否允许独立桌面端触发本机Agent。不要把分享能力的企业认证规则套用于所有API。

拟申请用途（未提交）：Rondo是本地优先的开源Agent协作桌面工作台；在用户明确发起开发任务后，
向其已登录的WorkBuddy PC端发送带任务标识的执行指令，通过本地MCP领取隔离工作区和计划并回传结果。
申请user.localassistant.invokable用于启动用户要求的执行任务；申请user.localassistant.readable
用于查询在线状态及核对派发回执和相关回复。不申请积分兑换、联系人或云端任务权限。

若后台没有对应选项，需向[官方咨询渠道](https://open.workbuddy.cn/docs/contact)确认：
个人实名主体、非硬件独立桌面软件能否申请以上scope；可使用哪种应用类型；
纯本地桌面应用如何满足client_secret不得暴露在客户端的要求。
本轮仅准备问题和用途说明，未发送邮件或其他对外消息。

### 2026-10-26：本地SDK的有界REA检查

目标为已安装WorkBuddy的`resources/wb-guest-sdk/wb.js`，72,519字节。
REA summary父证据：`ev_e0a73355f3e00672aa06e1a137c7231580faa5b2ca7554dc6c38b31ad063e70c`，
目录摘要SHA256：`4bbf0d3b0a545059bc3a857a8fc4f20804d6490d0e222155e73697473fbe215e`。
1个JS解析成功，0解析失败；语义覆盖仍unknown，4,746处未知。未执行SDK或发送模型请求。

原始打包代码中存在conversation的sendPrompt/runPrompt/cancel方法名和stateChanged事件名；
末尾通过宿主`window.__wbInvoke`/事件桥初始化`window.wb`，不是可直接供外部Python调用的独立CLI。
本地RPC扩展路由的endpoint/ticket来自hostInvoke解析，WebSocket有ticket和挑战握手。
这些是值得继续追踪的静态入口，不能据此宣称已发现外部任务创建协议或可获取合法连接票据。
REA对session_hello字符串的功能追踪未匹配到图节点；不能将原文字符串观察说成已恢复完整调用链。

接下来只追踪宿主conversation创建、工作区绑定与合法guest初始化路径；
外部调用可行性未证实前，不注入应用、不绕过票据校验、不把内部RPC包装成稳定公共接口。
执行完成仍以本项目MCP真实结果提交、对应工作区差异及固定检查为依据。

### 任务链接不等于自动执行

进一步抽取本机原始`deeplink-DSjugVW-.js`与`task-deeplink-coordinator-D-nqEU71.js`，
来源及SHA256保存在忽略目录`.agent-review-loop/rea-workbuddy-trigger/manifest.json`。
task链接的解析器确实接受action=start、prompt、cwd、model、skills等参数；
但协调器的executeTaskDeeplink在conversationEngine分支调用的是
`wb.conversations.prepareInput({target:{type:'new'},contentBlocks:...})`，
随后另发配置预填；另一个分支也命名为executeLegacyPrimaryPrefill。
因此本轮已观察到的流程是打开/准备输入，不是自动发送或启动代码执行。
不可将链接中start的字面含义、函数名execute或已填好提示词作为已派发证据。
本轮没有打开任务链接、改变WorkBuddy会话或调用付费模型。

## 最小架构与开发顺序

保留Electron/React与Python/SQLite/MCP；以task为长期需求，
另记录每轮execution及其request_id、native_session_id（若有）、输入context/代码tree、
派发回执、状态、检查、审查关联和实际用量。不引入通用插件市场或大型工作流框架。

0.11先做一次执行→固定检查→Codex审查：
1. WorkBuddy能力探测与接入：区分发送成功、确实开始、等待用户、结果已提交、失败和状态未知。
2. 持久执行作业：复用现有回执/owner锁/预算机制，重复点击不重复派发。
   发送后断线无法判断投递时，保留dispatch_unknown，先核对回执/历史，不自动重发付费任务。
3. 工作区与结果：复用TaskLauncher及MCP交接；完成依据真实提交与固定代码差异。
4. 自动交审查：使用既有检查包、ReviewJobs与版本绑定结果，界面继续展示真实记录。

0.12再做一次有上限的返修/复审：
为repair记录独立执行轮次，关联当前审查snapshot和所选问题；
不要直接重复claim已submitted任务，也不要清空历史或无条件重置两次预算。
默认一轮规划、一轮执行和一轮审查；允许的一轮返修/复审有独立明确上限。

成本跟随这条主线处理：保持明确生成与已保存结果复用，
区分业务输入与harness额外上下文，实测后再宣称节省；
执行保留Agent原有环境，审查按角色选择必要Skills，不静默改变用户环境。
费用缺失保持未知。恢复与失败不自动重放模型请求。

## 下一版验收终点

用户在本产品提交一个需求后，执行方在指定隔离工作区真实修改代码，
现有检查在固定版本运行，Codex审查返回并展示。
同一request_id不会多派发；重开能恢复执行记录；旧任务回复不会串入新任务；
不支持或未验证的停止/模型选择能力如实展示。
执行证据必须来自真正的WorkBuddy接入，不能用验收脚本替代。

这条闭环成功后，再整理一键启动、演示项目、复现脚本和开源发布材料。
acpx的Windows复现/修复可作为独立开源贡献，前提是先确认缺陷与补丁。
