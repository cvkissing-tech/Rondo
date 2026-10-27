---
name: Rondo
description: 复用 T3 会话结构与 Jean 主题的 Rondo 桌面 Agent 工作台
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "#666666"
  border: "oklch(0.922 0 0)"
  sidebar: "#f7f7f7"
  ring: "oklch(0.556 0 0)"
  dark-background: "#101010"
  dark-foreground: "#fafafa"
  dark-card: "#181818"
  dark-primary: "#fcd452"
  dark-primary-foreground: "#101010"
  dark-muted: "#242424"
  dark-muted-foreground: "#aaaaaa"
  dark-border: "#323232"
  dark-sidebar: "#141414"
  dark-accent: "#282828"
  dark-destructive: "#f87171"
typography:
  headline:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "25px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  session-title:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
  brand:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  task-prose:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "13px"
    lineHeight: 1.9
  label:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "11px"
    fontWeight: 500
  code:
    fontFamily: "Consolas, Courier New, monospace"
    fontSize: "12px"
rounded:
  base: "0.5rem"
  control: "calc(0.5rem - 2px)"
  user-message: "1rem"
  composer: "28px"
spacing:
  field-padding: "4px 12px"
  toolbar-padding: "0 16px"
  session-header-padding: "12px 24px"
  chat-padding: "28px 26px 32px"
  compact-chat-padding: "22px 18px"
  dock-padding: "14px 24px 18px"
  compact-dock-padding: "12px 16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
  button-ghost:
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
  input:
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "{spacing.field-padding}"
  navigation:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.foreground}"
    width: "244px"
  workspace-toolbar:
    height: "44px"
    padding: "{spacing.toolbar-padding}"
  session-header:
    height: "68px"
    padding: "{spacing.session-header-padding}"
  inspector-tabs:
    height: "42px"
  user-message:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.user-message}"
  badge-outline:
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
  task-composer:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.composer}"
---

# Design System: Rondo

## Overview

**Creative North Star: "可操作的 Agent 会话工作台"**

Rondo 直接复用成熟 Agent 产品的可用源码结构，以任务侧栏、会话列和产物面板组织工作。Jean 的中性浅深主题与 Windows 字体保持不变；本轮更换空间结构，不新增品牌配色、装饰图片或自行编造的视觉世界。

主工作区采用 T3 Code 的 ChatView 组合、用户消息容器、TimelineSystemDivider 与右侧面板模式；Rondo 的持久任务、规划、执行与审查替代上游状态及传输。精确来源与必要适配见 `vendor/t3code/workspace-provenance.json`，不把抽出的组合容器称作完整移植 T3 运行时。需求与真实 Agent 返回连续可读，规划输入与当前动作固定在会话底部，完整计划、文件、改动和已保存原生会话在右侧可达。

**Key Characteristics:**
- 中性浅深工作面与紧凑任务导航。
- 可滚动消息流、固定动作区与独立产物面板。
- 复用实际组件，显示真实任务、完整提交及可解释状态。

## Colors

浅色主动作沿用 `primary` 与 `primary-foreground`；白色工作面、浅灰导航与细边界组织层级。深色主动作和焦点沿用 Jean 的黄色，近黑工作面、卡片、muted 与边界保持各自语义角色。应用在 `assets/main.css` 对导航与次级文字的覆盖是最终事实；frontmatter 中深色键对应 `.dark` 覆盖。

Vibe 计划组件在 `.vibe-plan-surface` 中将边界、正文和标题/动作栏映射到 `border`、`background` 与 `muted`。错误和过期状态使用 destructive Alert；颜色不替代状态文字或禁用语义。

**The Semantic Theme Rule.** 页面及复用控件使用语义变量；切换主题时共同变化，不在单个控件中另造浅深配色。

## Typography

操作字体为 Segoe UI、Microsoft YaHei UI、sans-serif；代码、提交与路径使用 Consolas、Courier New、monospace。根字号为 14px，正文为 13px；上游 rem 控件按实际根字号计算。新任务标题为 25px/600，会话标题为 15px/600，侧栏品牌为 16px/600，辅助文字多为 10–12px。

需求与完整执行报告保留换行并允许长行折行。文件源码使用 12px/1.7、`white-space: pre` 与内部滚动，代码原始缩进不会为适应面板强制改写。会话标题、任务名、面包屑和文件栏标题保持单行省略。

## Layout

- 外壳占满窗口，html、body 与 root 禁止页面整体滚动；没有独立图标导航轨。任务侧栏为 244px，品牌行高 54px，主区工具栏高 44px；侧栏可通过工具栏按钮或 Ctrl+B 收起、恢复。
- 新任务页是可独立滚动的输入区，表单最大宽度 720px；桌面内边距 64px 40px 36px，窄桌面为 44px 28px。
- 宽于 1100px 的已准备任务默认并列显示会话与工作区检查面板，初始比例 62/38，最小比例分别为 42/28。分隔条沿用 Jean Resizable 控件，支持调整；右侧可收起，工具栏“代码改动”可恢复并切换到改动页。
- 会话标题区固定高 68px。中间消息区独立滚动，消息通道最大宽度 860px，内边距 28px 26px 32px；滚动留白由 `scroll-padding-block: 20px` 提供。用户需求初始完整展示，验收条件和工作区明细按需展开。
- 底部动作区不随消息滚走；内边距 14px 24px 18px，包含真实阶段、说明、一个下一步主动作和常驻规划输入。查看计划打开右侧相应版本；跳转审查时将消息滚入会话区并将焦点移至其按钮。
- 右侧检查面板拥有高 42px 的“计划 / 文件 / 改动 / 会话”标签栏。完整计划在独立滚动区内展示，内边距 18px 16px；文件列表、源码、差异和会话列表各自按内容滚动，文件列表不超过面板高度的 36%，至少保留 90px。源码区域使用剩余空间。手选标签不被状态轮询覆盖。
- 1100px 及以下任务侧栏为 210px，会话内容内边距为 22px 18px，底部动作为 12px 16px 并允许按钮换行；去掉重复的动作区环境尾注。检查面板默认收起，打开后独占侧栏以外的工作区并隐藏会话及其控件，关闭后恢复草稿并将焦点返回规划输入；此时不显示分隔条。最小桌面窗口宽度为 960px，不据此宣称移动端支持。
- Agent 设置继续保留任务侧栏与主区工具栏；管理区使用 272px 目录和流式详情，1100px 以下目录为 220px。目录列表与详情各自滚动，搜索/筛选和底部“添加自定义 Agent”不随列表滚走；详情长路径与诊断允许换行。编辑表单最大宽度 640px，留在详情区内，不新增弹窗。

## Elevation & Depth

主区域用语义表面与细边界区分；Popover、Tooltip 沿用上游覆盖层，焦点使用 ring 与可见轮廓。Codex 输入容器保留恢复 CSS 的柔和表面阴影；本轮未另加装饰阴影体系。

上游 Button 的零模糊 raised 下沿是现有移植源码携带的处理，不作为新增组件应继承的阴影 token。TaskSidebar 携带的选中竖线同样只记录为现有源码处理，不把它推广为全产品 callout 或卡片规则。

## Shapes

基础圆角为 0.5rem，控件沿用其减 2px 的计算。用户消息容器使用 rounded-2xl（1rem），需求输入组合沿用 Codex large 变体的 28px 圆角。细分隔表达消息与产物的结构；不为每段 Agent 正文再套卡片。

## Components

### Buttons and inputs

使用 Jean Button 的 default、outline、ghost 变体及大小接口。主动作保留明确文字；工具栏使用 ghost，打开目录或原生会话使用 outline。禁用状态使用实际 disabled，不能仅变灰。表单继续使用 Jean Field/InputGroup/Textarea 和 REA 恢复的 Codex ComposerLayout，保持 label 关联与本机草稿恢复。

新任务入口统一选择项目或保存位置，不增加新建/已有模式选择；保留“准备任务不消耗模型额度”说明。Agent 安装与启动配置移入独立设置工作区，新任务保留角色选择与管理入口；错误沿用既有语义反馈，服务连接中断与普通操作失败分别提供重连或关闭错误操作。

### Agent role picker

0.15 普通扩展在新任务中加入 `AgentPicker.tsx`，继续使用 Jean Field / FieldLabel / ghost Button 与原生 select，不新增调色板、字体、阴影或布局世界。分工区以 1px border 分隔、上内边距 14px；“规划 / 执行 / 审查”三列等宽，列间距 12px。select 高 36px、圆角 6px、内边距 0 9px、字号 12px，表面与文字使用既有 `background`、`foreground`、`border` 语义变量，保留原生键盘选择。

每个 select 有可见且关联 id 的标签，仅列出支持该角色的 Agent，可用项在前；缺失适配器的 option 实际禁用并标注“未安装适配器”。初次检测与“重新检测”期间显示“检测中…”，并禁用重复检测；“管理 Agent”使用既有 ghost Button 进入设置，返回保留任务草稿。已移除配置的既有选择显示“配置已移除”且禁用，不暗换角色。失败说明在分工区就地显示。说明明确：检测只读取本机安装状态，不验证登录、不下载、不调用模型。

创建时选择的角色随任务固定。任务标题分工、计划、执行、审查、权限说明和原生会话区显示实际所选 Agent，而不是将 Codex / WorkBuddy 写成不可变角色；旧任务保留 Codex / WorkBuddy / Codex 默认值。各 Agent 的账号、默认模型、Skills 和 MCP 由自身环境决定；检测可用不是商业账号或模型能力已验证。

### Agent setup directory, editor and readiness

2026-10-27 的普通扩展继续现有 Jean / T3 / Vibe / Codex / Pierre 世界。AionUi 提交 `11cd2a9a20d1e033157636efc570b41384c66d85` 提供 AgentCard 行、agentFilters 和 LocalAgents / InlineAgentEditor 的搜索、筛选与原位编辑流程；Goose 提交 `2c6812a358db1b11953b9fafc05c6126eb818788` 提供 AcpReadinessPanel 的状态、诊断与动作结构。适配到 Rondo 数据、IPC 与 Jean 控件；来源、原始文件 SHA256 和 Apache-2.0 许可保留在对应 vendor 目录，不宣称复制上游认证或整个运行时。

目录行是原生 button，名称单行省略、安装事实显示为次级文字，选中用现有 accent 表面和 `aria-current`，键盘焦点使用 ring 轮廓。搜索与“全部 / 已找到 / 未找到”筛选只作用于 Agent 目录；无匹配时保留说明与添加入口。详情按角色、安装、协议检查、启动配置和帮助顺序呈现，以细分隔与现有语义表面组织，不新增配色或阴影。

编辑沿用 Jean Field / Input / Button：标识保存后固定，程序使用原生文件选择器，每个 argv 参数独立一行，保留添加/移除参数与明确保存/取消。含空格路径无需加引号，不拼接成 shell 命令。版本冲突在详情顶部显示可读错误与“保留输入，读取最新配置”；此动作只读取最新版本，保留当前标识、程序和参数，提示核对后再次点击“保存配置”，不自动重试提交。移除配置使用原位警告与明确确认，说明对任务绑定的影响。

协议面板使用状态图标、文字、诊断 details 与 outline Button，分别表达未找到、已找到但未检查、检查中、通过与失败；检查中的重复动作禁用，减少动态效果偏好下关闭旋转。显式检查只初始化协议，不发送开发任务、prompt 或登录；“协议检查通过”不能代替账号、额度或模型能力验证。WorkBuddy 的实验通道与启动操作保持原有边界。

静态文档同步依据当前源码和逐张查看的 `.impeccable/review/agent-settings/` 九张捕获：`desktop.png`、`editor.png`、`checked.png`、`desktop-960.png`、`desktop-dark.png`、`conflict.png`、`conflict-recovered.png`、`empty-search.png`、`task-roles.png`。既有零模型证据 `.agent-review-loop/agent-settings-ui-5iBYDc/result.json` 记录 `modelsCalled: 0`、仅 `initialize` 请求、版本冲突后保留输入与显式再次保存、草稿返回和三角色选择；本次文档同步未重跑 UI、模型或实现测试。实现验收及独立审查范围见 `docs/learning/19-agent-setup-workspace.md`：冲突动作修复已复核为 resolved、ship，不扩大为所有商业 Agent 后端验收。

### Task navigation

复用 Jean ProjectsSidebar / ProjectTreeItem 的任务列表、搜索、已提交筛选和分页，嵌入新的 WorkbenchShell；不再附加独立图标轨。当前选择、状态、空内容和连接说明来自实际数据，底部保留接入说明。任务过多时侧栏中部滚动，品牌与底部区域保留。

### Conversation and action dock

复用 `pingdotgg/t3code` 提交 `210b2e7c6a8be11441b7afc94742ce3c76860111` 的 ChatView 组合、用户消息结构与 TimelineSystemDivider。`ChatWorkspace.tsx` 以 header / children / footer 槽接入 Rondo 数据，保留独立消息滚动和底部动作区，不引入上游业务状态、路由或传输系统。

需求全文作为首条用户消息；规划讨论按轮次保留用户意见、真实答复、状态、所选规划 Agent 和对应的“查看计划 Vn”入口，完整计划留在右侧。解释沿用原版本，修订产生新版本，历史入口不覆盖当前计划。存在执行或提交时，所选执行 Agent 的完整报告默认展开；用户主动折叠后才显示最多 180 字预览。手动展开或折叠的选择保留，审查依已有作业决定初始展开；交互标题保留 aria-expanded 与键盘焦点。执行消息另标本轮采用的计划版本；结果、检查、审查结论继续分别呈现，不把模型回合结束当作验收通过。

当前阶段和一个下一步动作位于固定底部区；额度消耗、失败/取消、快照过期及次数限制继续如实说明。执行、返修，以及已有执行且尚无审查时的“刷新执行记录”动作会展开执行消息、将其滚入视区并聚焦标题按钮。历史元数据在独立 details 中只读展示，不冒称完整聊天或事件溯源。返修与剩余次数沿用同一消息、动作和语义主题，恢复不自动重放模型调用。

常驻规划输入复用 Codex ComposerLayout 与 Jean Textarea / Button；正文为 13px/1.7，输入区域最小高 54px、最大高 126px并内部滚动，容器 focus-within 使用现有 ring 轮廓。收件人显示“规划 · 所选 Agent”及当前计划版本，发送独立于“采用 Vn，交给所选 Agent 执行”。Enter 发送、Shift+Enter 换行，输入法组合输入不发送。任务切换、重启及发送失败保留草稿；规划回答中显示停止按钮，仍可写下一条意见。执行或审查中允许编辑草稿但禁用规划发送，并显示原因。额度说明、失败及使用已保存上下文的新会话说明按实际状态显示。

### Workspace inspector

`WorkspaceInspector.tsx` 采用 T3 RightPanelTabs / PreviewPanelShell 模式，由 Rondo 的本地文件和会话服务替代上游浏览器/终端服务。标签有 tablist、tab、tabpanel 语义，支持键盘切换。

“计划”承载 Vibe 完整计划与步骤。查看历史版本时显示“正在查看历史计划 Vn；执行按钮始终使用当前版本”和“返回当前计划”，底部输入引用及采用动作继续指向当前版本。切换版本、标签、刷新和恢复只读取已保存结果，不自动调用模型。

“文件”读取真实工作区，展示路径和大小，可选择文件读源码、刷新或打开目录；仅有可预览产物时显示“运行预览”。“改动”激活时实际发起读取，继续使用 Pierre Diffs 并跟随主题；区分尚未读取、读取中、无改动和读取失败，错误时显示原因并提供“重新读取改动”，不把失败伪装成空差异。“会话”按规划、执行、审查显示已保存的会话、模型与本机配置，打开操作只指向已有原生记录，不重发任务；缺少持久会话的历史 Codex 项明确解释并禁用打开按钮；ACP 没有原生 GUI 跳转时展示对应说明并禁用入口，不构造虚假的 Codex 链接。

### Plan, native events and feedback

计划内容复用 Vibe ChatEntryContainer(plan) / ChatTodoList，保持 header/content/actions 与整体、步骤折叠；标题显示版本，额度说明使用所选规划 Agent 的名称。规划两次上限已移除，每次发送或重新规划仍是显式额度动作；忙碌、过期、失败和取消按实际状态呈现，执行与审查的既有次数边界继续保留。采用动作明确当前版本与执行者，派发绑定所见计划标识与代码基线，不能因查看历史版本而改派旧计划。返回的计划不是执行完成，验收方式不是已执行检查；只在有真实用量时显示 tokens。

本轮普通扩展的文档同步核对了 `App.tsx`、`TaskTimeline.tsx`、`PlanningComposer.tsx`、`WorkspaceInspector.tsx` 和 `assets/main.css`，并逐张查看 `.impeccable/review/planning-dialog/` 的 `desktop-light.png`、`desktop-dark.png`、`compact-dark.png`、`compact-plan.png`、`historical-plan.png`、`execution-permission.png`、`execution-result.png`、`medium-plan.png` 与 `compact-draft-return.png`。`responsive-result.json` 记录 960px/1040px 独占布局、隐藏控件不可聚焦、草稿保留与关闭后焦点返回；独立 finish review 将唯一的窄窗重叠问题复核为 resolved、ship。`.agent-review-loop/planning-dialog-zZM7dJ/result.json` 记录模型调用为 0、解释保留 V1、修订与历史保留、重启草稿及执行准确采用 V2，并通过 ACP 权限/文件回调和自动审查。本次文档同步未重跑实现测试、模型或商业 Agent 验收；实现边界见学习21。

原生与 ACP 工具、会话事件位于对应所选 Agent 消息中，原生 details 按需展开；最近事件有界显示，输出区域内部滚动。待处理的 command/file 审批和用户问题在现有输入、select 和 Button 中呈现，不能用模拟答复继续执行。本文记录实现中的状态与控件，不据源码存在宣称已验证原生跳转或审批交互。

WorkBuddy 的公开回复与工具状态复用同一工具记录区，由既有 SQLite 投影提供，不展示 reasoning 或交接凭证。逐张核对 `.agent-review-loop/workbuddy-progress-ui-zrjNNq/` 的 `recovered-events.png`、`recovered-events-960.png` 与 `recovered-events-dark.png`：任务 #4 的 47 项真实历史与文件区可读，执行仍为 cancelled，底部解释超时、产物保留及尚未提交或审查。同期 `result.json` 记录模型为 glm-5.3-flash、HTTP 预览可读、无页面错误及零模型调用，独立 finish review 在此恢复状态范围内为 ship。此证据只确认历史恢复界面，不证明新一轮商业模型执行或游戏整体完成；实现与恢复边界见 `PRODUCT.md`、对应 surface brief 和 `docs/learning/20-workbuddy-progress-timeout.md`。本次文档同步未重跑实现测试或模型。

工具栏与任务侧栏的“Agent 设置”入口打开设置工作区，本地任务服务、MCP 配置项、WorkBuddy 原生通道与模型就绪仍是不同状态。反馈使用原有语义错误与可关闭通知；目录刷新和任务恢复是只读操作，显式协议检查可启动程序但不发起模型任务，不能把这些动作变成付费重试。

## Do's and Don'ts

### Do:
- **Do** 优先复用已移植组件、语义主题与现有交互。
- **Do** 将完整需求、Agent 返回、产物与当前动作留在同一任务上下文。
- **Do** 保留消息、源码、差异和列表各自的滚动边界及键盘焦点。
- **Do** 区分真实状态、已保存记录、只读刷新与消耗额度的动作。

### Don't:
- **Don't** 恢复旧图标轨、墨绿静态角色栏或默认收起完整执行报告的旧布局。
- **Don't** 为填满页面虚构任务、报告、进度、会话或连接成功。
- **Don't** 将源码结构复用说成完整移植上游运行时，或将窗口截图扩大为原生会话与审批验收。
