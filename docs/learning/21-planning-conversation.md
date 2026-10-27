# 21：让计划可以讨论，并准确交给执行者

本轮沿用现有Python作业生命周期、SQLite、Electron IPC与React组件，没有引入新的聊天框架或数据库。中间负责对话，右侧负责计划产物，底部负责继续输入和明确交接。

## 从界面追到模型

```text
PlanningComposer → DesktopAPI.sendPlanningMessage
  → Electron IPC planning-message → MCP send_planning_message
  → PlanJobs.start_message → 已有单作业互斥/幂等预留
  → run_codex_plan → Codex App Server 或 acpx / ACP
  → 保存答复/新计划 → 任务对话与右侧计划重新读取
```

`PlanningComposer.tsx`复用现有REA恢复的Codex输入容器与Jean控件；输入草稿和未确认发送的request_id保存在本机。发送失败保留文字；重试同一条消息复用request_id，不自动另发付费回合。输入法组合输入时，Enter不会误发。

`planning.py`复用`plan_jobs.result_json`保存用户消息、答复、版本、原计划引用和会话元数据。没有额外维护第二份任务数据库。最近100轮供界面读取，原作业目录仍保留；发给模型的历史和源码上下文有单独的体积边界。

## 提问和修订有什么区别

输出约定是一个很小的结构：

```json
{"reply": "解释或修改说明", "plan": null}
```

`plan=null`表示只解释，仍引用原来的计划。需求改变时，`plan`返回完整计划，经已有`validate_plan`核对后保存为新版本。提问本身不使版本增加，历史计划不会覆盖。首次没有计划时不接受空计划。

判断是否需要修订由Agent处理，界面呈现其实际返回结果；它并非一个能保证理解所有自然语言的关键词分类器。用户仍可继续纠正。测试替身中的关键词只用于确定性协议验收，不是生产实现。

## 为什么执行时要传两个标识

`job_id`定位生成作业，`plan_id`是具体计划内容的摘要。界面执行动作同时传这两个值：

```ts
api.startExecution(taskId, requestId, planResult.job_id, planResult.plan_id)
```

`execution.py`在预留作业时核对用户看到的计划与当前保存的计划一致；预留后持久保存`plan_job_id / plan_id / plan_version`。工作线程读取这份固定计划并再次核对代码新鲜度，不在派发时临时挑另一份新计划。讨论失败不删除之前的有效计划，但代码已变化的旧计划仍不能直接采用。

执行收据同时保存完整采用计划。`ReviewJobs`把它带入`manifest.json`的`task.adopted_plan`，成为固定审查快照的一部分；审查提示明确要求按用户已采用的修订范围判断。否则用户改成离线版后，审查者仍可能按最初的联网需求误报。原始需求保留，没有在讨论时提前覆盖。

## 延续原生环境

Codex继续使用本机CLI、配置、Skills与MCP，优先`thread/resume`恢复自己的最近成功规划会话。原生协议可能返回`active writer`，表示别的客户端正在持有该会话：这次本机零模型检查确实遇到过此情况。处理是在任何`turn/start`之前改为新会话，带入保存的任务和讨论上下文；界面标明“使用已保存上下文继续”。其他恢复错误停止，不能把已经开始的模型回合静默重发。

ACP首版采用保存上下文的新轮次，不声明已恢复同一个原生会话。执行、审查期间允许写草稿，首版不支持向任意运行中的Agent直接插话。

## 界面复用和布局

- T3 Code：沿用已移植的会话列、消息容器、底部区域与右侧标签结构。
- Codex：沿用已恢复的ComposerLayout与产品CSS，适配持续规划输入。
- Vibe Kanban：完整计划与步骤组件移到右侧，无另造计划卡。
- Jean：继续使用现有主题、控件、侧栏与可调整分栏。
- Cline / Continue / OpenHands：参考真实源码中的持续输入、规划讨论与运行反馈。没有把这些项目的IDE状态依赖整包复制进来；固定提交和路径见布局提案。

宽窗口保持左右分栏；1100px及以下默认收起产物面板，展开时独占侧栏以外的工作区，对话控件隐藏，关闭后焦点返回输入框。用户选择的右侧标签不受轮询影响。960px和1040px均已检查此行为。

## 证据与限制

后端相关测试已覆盖解释保留V1、修订V2、幂等冲突、历史读取、取消、恢复原生线程、active writer时仅启动一个模型回合，以及采用错误版本在派发前拒绝。前端通过类型检查、构建和ESLint。

`desktop/scripts/planning-dialog-smoke.mjs`运行真实Electron、MCP和acpx，用确定性ACP替身完成提问、修订、历史计划、重启草稿、窄窗口和采用V2后的权限答复、文件回调、自动审查。模型调用为0，不使用用户任务数据库。截图和运行结果保存在本机忽略目录，脚本本身进入源码。

这不是商业Agent账号端到端验收，也不证明所有Agent都支持同一套Skills、原生GUI或运行中插话。本轮没有重新派发用户的贪吃蛇任务，没有修改其任务状态，也没有发布GitHub或完整独立安装包。
