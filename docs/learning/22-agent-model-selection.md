# 统一 Agent 模型选择

2026-10-28。入口：Agent 设置 → 选择已安装的 Agent → 模型设置。

## 产品行为

Codex、WorkBuddy、内置/自定义 ACP Agent 共用同一个模型设置组件。列表来自原 Agent，按 Agent ID 保存到 Rondo 的 agents.json 中的 native_models。字段名是兼容性的内部名称，ACP 同样使用该表。

Codex 额外展示模型实际支持的思考强度。ACP 未提供可选模型时显示限制，禁止保存虚构选择；未安装的 Agent 先走原有安装/配置流程。读取列表和保存不发送模型提示词。ACP 的列表查询可能产生临时原生会话记录。

保存只影响后续回合，原客户端的全局配置、登录、Skills 和 MCP 保持原来的管理方式。同一个 Agent 在多个角色中的默认模型相同；这里没有另做按角色分别选模型的功能。

## 直接复用

没有另写 ACP 客户端。使用项目已安装的 acpx 0.21.0：

- [inspectAgentModels 的实现](https://github.com/openclaw/acpx/blob/69c7519e87942885c39c0e60540164747621f273/src/runtime/public/probe.ts)负责启动指定 argv、ACP 初始化、获取会话模型和关闭自己的连接，不发送 prompt。
- `runtime.ensureSession({sessionOptions:{model}})` 复用 acpx 的初始模型选择与可用性检查，兼容 Agent 提供的模型元数据。
- [进程与模型查询边界](https://github.com/openclaw/acpx/blob/69c7519e87942885c39c0e60540164747621f273/docs/runtime-process-lifecycle.md)说明查询可能创建原生历史，只关闭自身拥有的连接。

本轮在 GitHub 核对上述源码；部署使用 package-lock 固定的现有依赖，没有升级依赖或下载新 Agent。

## 三条真实调用链

Codex：`model/list` → 保存选择 → `thread/start` 或 `thread/resume` 的 model/config → 核对 model/reasoningEffort → `turn/start` 明确传入 model/effort。只覆盖本次会话的模型设置，不覆盖系统指令、权限、Skills 或 MCP。

WorkBuddy：读取实际产品模型列表 → 保存选择 → 预留执行记录时固定 requested_model → 原生 set/updateConfig → session:get 读回 → 发送一次提示词。显示读回的配置模型 ID；fast-model/balanced-model/deep-model 明确标为自动路由，不能把路由 ID 当成确定的底层供应商模型。

ACP：`inspectAgentModels` → 保存模型 ID → ensureSession 的 sessionOptions.model → getStatus 读回 currentModelId → 才开始 startTurn。模型不可用或读回不一致时不发出 prompt。规划/审查读取该 Agent 的保存选择；执行和自动返修固定采用初次执行的模型，避免中途修改设置影响返修。

## 验证与限制

桌面隔离配置验收覆盖真实 Codex/WorkBuddy 模型列表、自定义 ACP 选择、未提供模型列表的只读状态、保存与重启恢复、960px 布局。实际用户配置没有被测试写入。

ACP 使用真实 acpx 和确定性协议替身验证：查询时不发 prompt；session/set_model 在 session/prompt 之前；选择的模型读回一致；不可用模型的 turns_started 为 0。Codex 协议测试覆盖模型/强度参数和不一致时零生成。WorkBuddy 桥接测试覆盖模型读回失败时不发送提示词。

本机 Codex 还通过了零生成的临时线程探针，model=gpt-6.1-sol、reasoningEffort=medium 的读回与设置一致，然后释放临时线程。没有用商业模型运行新一轮开发；列出模型也不能证明当前账号有足够额度或该模型服务此刻无故障。
