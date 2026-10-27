---
version: 1
slug: "desktop-src-renderer-src-app-tsx"
primary_target: "desktop/src/renderer/src/App.tsx"
related_targets:
  - "desktop/src/renderer/src/TaskTimeline.tsx"
  - "desktop/src/renderer/src/taskFlow.ts"
  - "desktop/src/renderer/src/PlanPanel.tsx"
  - "desktop/src/renderer/src/WorkspaceInspector.tsx"
---

# 桌面工作台组件移植

Mode: Operate。Windows Electron，1360×900主窗口，最小960×680。用户明确否定上一版通用表单与三栏静态说明，要求直接复用可用产品组件。

## Direction contract

THESIS: 用户明确授权替换既有布局。Rondo 从静态工作记录改为会话工作台，需求、Agent 返回、工具调用、当前主动作和实际产物在同一任务内可达。

OWN-WORLD: 成熟 Agent 工作台的中性界面，沿用 Jean 浅深主题与 Windows 字体；移除72px图标轨和覆盖全宽的32px顶栏。244px任务栏（窄桌面210px）、44px主区顶栏；T3 ChatView 会话列、68px会话标题、可滚动消息区与固定底部动作；右侧常驻可调整文件/改动/原生会话面板。不增加新品牌色或装饰。

STORY: 先读用户需求消息，随后按规划、执行、审查查看真实结果；正在运行的 Codex 显示真实工具事件和原生等待输入。右侧直接读文件与源码，有index.html时可运行预览；会话快捷入口只打开已有记录，不重发任务。旧Codex临时会话不可恢复，按钮禁用并解释。WorkBuddy完整提交默认展开。

FIRST VIEWPORT: 任务标题与角色、需求、Agent消息流、文件列表及当前阶段主动作。任务过长时中间独立滚动，动作固定底部；右侧文件与源码独立滚动，960px无页面横溢出。新任务为720px需求输入区，25px标题；接入配置按需展开。

FORM: code-led，用户固定成熟产品复用并要求开发者决定布局，已明确允许整体替换，无第二次风格选择。T3 Code 210b2e7c6a8be11441b7afc94742ce3c76860111 提供 ChatView/UserTimelineRow/TimelineSystemDivider 与右侧面板结构；Jean、Vibe、Codex和Pierre保留实际可用模块。精确来源与必要适配在vendor NOTICE和workspace-provenance.json，不把适配壳描述为复制整个上游运行时。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Truth and preservation

保留现有创建、恢复、工作区打开/复制、修改/新增差异和审查接口。所有侧栏项目来自数据库；不加入虚构任务、Agent消息、执行进度或已连接声明。Codex已支持显式生成执行计划，包含步骤、文件、验收方式、假设及代码新鲜度；每任务最多两次，生成使用额度，刷新与恢复不再生成。WorkBuddy原生执行已接入，状态来自持久作业；计划完成后显式派发，收到对应提交后自动检查与审查，未配置检查时标记not_run。计划与审查均标明额度行为。

> 下列 extension 为先前版本的历史验收记录；当前布局与交互以本页上方0.14方向契约和现行DESIGN.md为准。

## Native execution extension · 2026-10-26

普通 extension，对照既有工作台验收；Rondo 名称、连接检查/启动、原生会话与停止操作均落在现有导航、Popover、Button 和 WorkLog 中。无新品牌 token、组件视觉变体或布局；Jean / T3 / Vibe / Codex / Pierre 的来源与主题边界保持原约定。计划、执行、检查与审查是不同事实，模型回合结束不能单独表示提交或验收成功。0.12.0 的一次返修与自动复查沿用下述工作记录扩展。

已逐张核对 `.impeccable/review/desktop.png`、`desktop-960.png`、`desktop-dark.png` 和 `connection.png`：浅深主题、窄桌面、连接 Popover 和执行成功摘要均延续既有层级。源码核对范围为本 brief 的四个 target；实时验收及 102 Python、4 native fixture、15 flow assertions 的记录见 `docs/learning/14-workbuddy-native-execution.md`。这些记录证明已列出的场景，不扩大为所有 WorkBuddy 版本或完整自动开发能力。

## Bounded repair extension · 2026-10-26

普通 extension，仅在 `App.tsx`、`taskFlow.ts` 与 `TaskTimeline.tsx` 的既有 Jean Button / T3 WorkLog 中表达返修模式、来源审查、停止原因与额度边界；不增加 CSS、token、组件视觉变体或视觉世界。计划就绪的主动作明确包含执行、审查与一次返修，以及双方账号额度。首次审查要求修改且快照 current 时，可自动交给 WorkBuddy 返修一次并复查；旧任务或尚未开始的交接可从当前审查显式发起。

工作记录区分“正在返修”“返修结果已提交”及“返修未完成”，展开后读取原生会话、模型、来源审查 ID 与最多返修一次的说明。成功摘要仍默认收起；失败或自动交接停止时保留原因并展开记录。过期审查引导核对代码；取消、派发不明确、未产生改动、范围外改动或次数耗尽均停止，不把刷新和恢复变成重新派发。范围检查在执行后比较 Git tree，不是写入前的文件系统沙箱。

已保存作业区显示计划、执行/返修与审查各自的 `n/2` 计数，失败和取消也计入；执行/返修上限对应首次执行加一次返修。返修后仍有问题时转为查看剩余问题；审查达到 `2/2` 时，新审查按钮显示“审查次数已用完（2/2）”并原生禁用。恢复只读取已有作业；自动交接需要 Rondo 服务持续运行，重启不自动重放付费调用。

本轮浅色主窗口、960px窄桌面、返修记录、深色主题与次数用完的历史状态已逐张核对，截图为 `.impeccable/review/repair/desktop.png`、`desktop-960.png`、`repair-record.png`、`desktop-dark.png`、`budget-history.png`。事实与验证范围以 `PRODUCT.md` 和 `docs/learning/15-bounded-repair.md` 为准：108项 Python、20项前端状态断言、零模型 Electron smoke 与构建通过。真实验收以明确预埋缺陷开始，真实 Codex 提出1项 `changes_requested`，显式发起原生 DeepSeek 返修，随后自动真实 Codex 复查为 `approved`，最终 `current`；首次审查自动交回返修的调度分支由离线测试覆盖。此证据不扩大为首次缺陷由 Agent 写出、所有 WorkBuddy 版本兼容或完整自动开发。

## Project entry extension · 2026-10-26

普通 extension，仅同步现有新任务入口和反馈行为，保留 Jean 输入、Codex 需求容器、Button、Alert 及浅深主题；不增加 CSS、token、布局或组件视觉变体。入口统一选择项目文件夹或保存位置，无“新建 / 已有项目”模式切换。输入提示“选择项目文件夹（支持空文件夹）”，上方辅助说明已有文件会保留、新项目自动使用独立子文件夹；需求、验收、可选任务名称及“准备任务”主动作维持既有顺序和层级。

空目录自动初始化；普通保存目录已有文件时建立独立子项目并保留原文件；已有 Git 项目根目录沿用提交基线。选择 Git 子目录时用中文提示改选项目根目录。目录、需求、验收与任务名称草稿在本机恢复；准备任务仍不消耗模型额度，准备成功进入同一工作记录，计划、执行与审查尚未开始时如实显示。

操作错误沿用 destructive Alert，Git 目录错误以中文说明。服务仍连接时显示“关闭错误提示”，只关闭当前错误并保留草稿；服务未连接时显示“重新连接 / 刷新”。简短通知保留既有关闭按钮。测试和准备检查在隐藏窗口运行，不让检查过程弹出额外终端窗口。

已逐张核对 `.impeccable/review/new-project/desktop.png`、`desktop-960.png`、`desktop-dark.png`、`friendly-error.png` 与 `prepared.png`，覆盖浅色主窗口、窄桌面、深色入口、中文目录错误和准备后的工作记录。本轮实现验收为24项相关 Python、build/lint 和零模型新项目 smoke 通过；文档同步未重跑这些检查。截图证明列出的界面状态，零模型 smoke 不代表真实模型完成新项目开发。实现事实以 `PRODUCT.md` 与本轮源码为准。


## 0.15.0 Agent角色扩展

普通功能扩展，继续现行T3/Jean/Vibe/Codex/Pierre视觉系统。新任务增加三列原生select的Agent分工区，复用Field/Button与既有边框、字体和浅深主题；不新增品牌视觉。标题、计划面板、工作流、工具权限与会话区显示实际选定Agent，旧任务保留默认角色。安装检测明确区别登录；缺失适配器禁用；ACP没有原生GUI跳转时说明并禁用入口，不虚构Codex链接。差异标签必须真实读取并在失败时提供重试。Task4恢复截图和无模型角色选择截图一起验收；fixture明确标记为离线，不冒充商业模型。
