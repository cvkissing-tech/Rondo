---
version: 1
slug: "desktop-src-renderer-src-app-tsx"
primary_target: "desktop/src/renderer/src/App.tsx"
related_targets:
  - "desktop/src/renderer/src/TaskTimeline.tsx"
  - "desktop/src/renderer/src/taskFlow.ts"
  - "desktop/src/renderer/src/PlanPanel.tsx"
---

# 桌面工作台组件移植

Mode: Operate。Windows Electron，1360×900主窗口，最小960×680。用户明确否定上一版通用表单与三栏静态说明，要求直接复用可用产品组件。

## Direction contract

THESIS: 以同一任务的需求、规划、执行提交、审查记录表达开发过程；当前阶段、Agent 分工和下一步动作可直接读懂。直接复用成熟产品模块，不另创视觉世界。

OWN-WORLD: 保留 Jean 72px导航轨、240px任务栏、32px顶栏与浅深主题；主区移植 T3 Code WorkLog，计划保留 Vibe 组件结构并映射现有中性表面。Windows系统字体与Lucide图标沿用。

STORY: 打开任务先读阶段与角色，需求和路径默认折叠；展开需要的计划、执行提交和审查记录，按需打开侧面差异。刷新和恢复读取已有结果；显式生成计划、原生执行与审查才使用对应额度。WorkBuddy 连接由真实通道返回，等待、取消与派发不明确均可读；执行成功初始收起并保留最多160字摘要，不渲染虚构执行。

FIRST VIEWPORT: 任务标题、规划/执行/审查分工、当前阶段和一个主动作；下方为T3工作记录。需求摘要可见、全文和目录收起。差异关闭时记录占主区，打开后62/38可调整分栏；960px仍可操作。MCP数量位于连接详情，已保存作业概要按需展开。

FORM: code-led，用户明确固定成熟产品复用，无随机seed或新风格：Jean cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3、T3 Code 3de45c6254345f968fbdc64db7b149bf4f429855、Vibe Kanban d5cbb5380fa0b32e98ef9b8d987f63decce4be3a、REA恢复的Codex26.1021.3705.0输入容器。产品级来源及适配见各vendor NOTICE。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Truth and preservation

保留现有创建、恢复、工作区打开/复制、修改/新增差异和审查接口。所有侧栏项目来自数据库；不加入虚构任务、Agent消息、执行进度或已连接声明。Codex已支持显式生成执行计划，包含步骤、文件、验收方式、假设及代码新鲜度；每任务最多两次，生成使用额度，刷新与恢复不再生成。WorkBuddy原生执行已接入，状态来自持久作业；计划完成后显式派发，收到对应提交后自动检查与审查，未配置检查时标记not_run。计划与审查均标明额度行为。

## Native execution extension · 2026-10-26

普通 extension，对照既有工作台验收；Rondo 名称、连接检查/启动、原生会话与停止操作均落在现有导航、Popover、Button 和 WorkLog 中。无新品牌 token、组件视觉变体或布局；Jean / T3 / Vibe / Codex / Pierre 的来源与主题边界保持原约定。计划、执行、检查与审查是不同事实，模型回合结束不能单独表示提交或验收成功。0.12.0 的一次返修与自动复查沿用下述工作记录扩展。

已逐张核对 `.impeccable/review/desktop.png`、`desktop-960.png`、`desktop-dark.png` 和 `connection.png`：浅深主题、窄桌面、连接 Popover 和执行成功摘要均延续既有层级。源码核对范围为本 brief 的四个 target；实时验收及 102 Python、4 native fixture、15 flow assertions 的记录见 `docs/learning/14-workbuddy-native-execution.md`。这些记录证明已列出的场景，不扩大为所有 WorkBuddy 版本或完整自动开发能力。

## Bounded repair extension · 2026-10-26

普通 extension，仅在 `App.tsx`、`taskFlow.ts` 与 `TaskTimeline.tsx` 的既有 Jean Button / T3 WorkLog 中表达返修模式、来源审查、停止原因与额度边界；不增加 CSS、token、组件视觉变体或视觉世界。计划就绪的主动作明确包含执行、审查与一次返修，以及双方账号额度。首次审查要求修改且快照 current 时，可自动交给 WorkBuddy 返修一次并复查；旧任务或尚未开始的交接可从当前审查显式发起。

工作记录区分“正在返修”“返修结果已提交”及“返修未完成”，展开后读取原生会话、模型、来源审查 ID 与最多返修一次的说明。成功摘要仍默认收起；失败或自动交接停止时保留原因并展开记录。过期审查引导核对代码；取消、派发不明确、未产生改动、范围外改动或次数耗尽均停止，不把刷新和恢复变成重新派发。范围检查在执行后比较 Git tree，不是写入前的文件系统沙箱。

已保存作业区显示计划、执行/返修与审查各自的 `n/2` 计数，失败和取消也计入；执行/返修上限对应首次执行加一次返修。返修后仍有问题时转为查看剩余问题；审查达到 `2/2` 时，新审查按钮显示“审查次数已用完（2/2）”并原生禁用。恢复只读取已有作业；自动交接需要 Rondo 服务持续运行，重启不自动重放付费调用。

本轮浅色主窗口、960px窄桌面、返修记录、深色主题与次数用完的历史状态已逐张核对，截图为 `.impeccable/review/repair/desktop.png`、`desktop-960.png`、`repair-record.png`、`desktop-dark.png`、`budget-history.png`。事实与验证范围以 `PRODUCT.md` 和 `docs/learning/15-bounded-repair.md` 为准：108项 Python、20项前端状态断言、零模型 Electron smoke 与构建通过。真实验收以明确预埋缺陷开始，真实 Codex 提出1项 `changes_requested`，显式发起原生 DeepSeek 返修，随后自动真实 Codex 复查为 `approved`，最终 `current`；首次审查自动交回返修的调度分支由离线测试覆盖。此证据不扩大为首次缺陷由 Agent 写出、所有 WorkBuddy 版本兼容或完整自动开发。
