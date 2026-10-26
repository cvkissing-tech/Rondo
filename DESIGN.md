---
name: Rondo
description: 复用 Jean 工作台、T3 工作记录、Vibe Kanban 计划组件与 REA 恢复的 Codex 输入容器
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
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
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  document-title:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.5
  toolbar-title:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  timeline-title:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
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
  composer: "28px"
spacing:
  field-padding: "4px 12px"
  prompt-padding: "12px 17px"
  document-padding: "26px"
  compact-document-padding: "22px"
  toolbar-padding: "0 16px"
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
    width: "240px"
  badge-outline:
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
  task-composer:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.composer}"
---

# Design System: Rondo

## Overview

**Creative North Star: "可操作的开发工作台"**

本体系直接复用 Jean 的 React 控件与语义主题，来源为 `coollabsio/jean` 提交 `cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3`。来源、文件身份和适配说明保存在 `desktop/src/renderer/src/vendor/jean/NOTICE.md`。它取代用户已否定的旧墨绿表单体系。

设计重心是项目、需求与实际代码改动。浅深主题采用同一组语义角色；系统字体承载中文操作与阅读，成熟控件提供导航、焦点、提示和分栏行为。任务主区复用 T3 Code WorkLog，将需求、工作区、规划、执行与审查组织成连续工作记录；顶部直接显示分工、当前阶段和一个下一步主动作。

**Key Characteristics:**
- 中性工作面与紧凑导航。
- 需求、代码改动和审查保持同一任务上下文。
- 真实源码组件复用，需求全文、路径与记录详情按需打开。

## Colors

浅色以白色工作面、浅灰导航和深灰文字分层。深色以近黑工作面、较浅的输入/弹出层和浅色文字分层；上游主题的黄色用于深色主动作与焦点。色值以 frontmatter 为准，深色键对应 `.dark` 对同名 CSS 变量的覆盖。

### Primary

浅色主动作使用 `primary` 与 `primary-foreground`；深色使用对应的 `dark-primary` 角色。它们是操作层级，不构成大面积装饰底色。

### Neutral

`background`、`sidebar`、`muted` 和 `border` 承担表面、导航、选中背景与分隔。应用对上游的次级文字和导航底色做了已落地的覆盖，记录于 `assets/main.css`；不要从未覆盖的上游默认值反推最终颜色。

错误与计划过期提示使用 Alert 的 `destructive` 语义；深色对应 `dark-destructive`，来自应用 `.dark` 中已实现的覆盖，保证近黑工作面上的错误文字可读。它不替代主动作色或中性色层级。

Vibe 计划组件的品牌边界、正文背景和标题/动作栏背景分别映射到现有 `border`、`background` 和 `muted`。保留源组件结构，不将上游橙色计划大色面带入当前工作记录；此映射仅作用于 `.vibe-plan-surface`。

**The Semantic Theme Rule.** 页面及复用控件使用语义变量；切换主题时共同变化，不在单个控件中另造浅深配色。

## Typography

操作字体为 Segoe UI、Microsoft YaHei UI 和 sans-serif 回退。系统字体适用于此 Operate 界面；不承担营销展示角色。Consolas 和 Courier New 仅用于实际代码、提交与文件路径。

层级由新任务标题、任务文档标题、工具栏标题、正文和辅助标签构成，具体 token 见 frontmatter。页面 CSS 根字号为 14px，正文覆盖为 13px；因此来自上游的 rem 控件尺寸按当前根字号计算，不把上游默认根字号的像素值直接搬入文档。需求文本保留换行并可换长行，路径允许任意位置折行。

## Layout

- 外壳占满窗口，页面整体不产生滚动；连续工作记录与可选代码差异面板分别滚动。计划与审查详情随工作记录滚动。
- Jean 外壳使用 72px 导航轨、可收起的 240px 任务栏与 32px 顶栏；Ctrl+B 或工具栏按钮切换任务栏。
- 任务标题、Agent 分工和当前阶段位于记录滚动区上方。当前阶段说明与一个下一步主动作在窄桌面可换行；说明最大宽度 65ch。
- 工作记录横向内边距 22px、纵向内边距 20px，内容最大宽度 850px；需求全文、验收与工作区路径初始收起，需求保留简短预览。
- 代码差异按需从工具栏打开并可关闭。打开时使用 Jean ResizablePanelGroup，初始记录/差异比例 62/38，最小比例 42/25；关闭时记录使用可用宽度。
- 1100px 以下工具栏允许换行。当前交付的桌面最小窗口宽度是 960px；不将导入组件自带的移动端分支当作已交付手机版。

## Elevation & Depth

主工作区域通过色面和细边界区分。弹出层沿用上游 Popover/Tooltip 的边界与覆盖层语法；控件焦点由语义 ring 和可见轮廓表达。

上游 Button 保留的零模糊 raised 下沿属于当前源码携带的处理，未提炼为本产品新增页面应继承的阴影规范，也未纳入 sidecar 的可复用阴影 token。这里记录现状，不借文档把它扩散成新的视觉规则。

## Shapes

基础圆角沿用语义 `radius`，控件使用 `radius-md` 对它的计算。需求输入组合使用 Codex 发布包中 large 变体的 28px 容器圆角；边界为细实线。展开/收起时品牌文字裁切并省略，长任务名、面包屑保持单行省略，正文与路径允许换行。

## Components

### Buttons

直接使用 Jean Button 的 default、outline 和 ghost 变体及其大小接口。主动作保留文字和真实图标；次级操作用 outline，工具栏与导航相关操作用 ghost。禁用、悬停和焦点由组件实现，不能靠颜色代替不可用语义。

### Inputs / Fields

项目目录和验收条件继续使用 Jean Field/InputGroup/Textarea。需求输入采用 REA 恢复的 Codex ComposerLayout CSS 与 React 适配，保留 Root/Body/Attachments/Input/Footer 层级、comfortable 密度与 large 圆角。原生 textarea 接现有表单状态；label 保持关联。

新任务入口复用同一表单，不增加新建/已有项目模式切换。项目输入提示“选择项目文件夹（支持空文件夹）”，辅助文字说明保存位置中已有文件会保留、新项目自动使用独立子文件夹；空文件夹自动初始化，已有 Git 项目根目录继续沿用。目录、需求、验收与可选任务名称的草稿在本机恢复。“准备任务”仍为唯一提交主动作，并保留不消耗模型额度的说明；准备完成后进入现有工作记录。

### Navigation

直接移植 Jean MainWindow / SidebarTabRail / ProjectsSidebar / ProjectTreeItem 的产品布局：72px 导航轨、可收起的 240px 任务栏、32px 顶栏；Ctrl B 收起与恢复。真实任务列表支持搜索、已提交筛选、状态、分页；底部保留接入说明与本地 MCP 状态。

### Split work area

工作记录为任务主区，不再以需求、计划、代码、审查四个平行页签组织任务。规划与审查在同一记录内展开；代码改动作为可选侧面板，使用 Layout 中的比例。分隔条支持拖动与方向键；代码视图保持 Pierre Diffs 并跟随浅深主题。没有改动或结果时使用真实 Empty 状态。

### Task work records

复用 `pingdotgg/t3code` 提交 `3de45c6254345f968fbdc64db7b149bf4f429855` 的 WorkLog Block/List/Button/Row/Details，来源与适配保存在 `vendor/t3code/NOTICE.md`。紧凑图标行承载需求、工作区、规划、执行与审查，详情缩进展开；交互行保留键盘焦点及 `aria-expanded`。

标题下持续显示 Codex 规划、WorkBuddy 执行与 Codex 审查的分工和接入状态。当前阶段由真实任务与作业状态推导，使用可播报状态区和一个下一步主动作；消耗额度的动作在按钮中明示。需求与工作区初始收起；最新计划/审查按已有作业展开，用户仍可折叠。

执行行沿用同一 WorkLog 披露结构，区分等待派发、实际领取者、原生作业阶段与真实提交摘要；文件变化不代表执行完成。执行成功后初始收起，保留最多 160 字摘要，超出时添加省略号；展开后可读完整摘要、原生会话 ID、阶段和返回的模型名称。活动作业可停止，停止中禁用重复停止；失败、取消、等待权限或派发不明确时展示真实状态，不把刷新变成重新派发。

底部原生 details 展示已保存作业元数据及计数，只读恢复不调用模型；较早记录为概要，不把此投影称为完整事件溯源或完整对话历史。原生会话结束并收到对应执行者的 MCP 提交后才接续检查与 Codex 审查；执行完成、检查结果和审查结论继续分别呈现。

返修沿用同一 Button / WorkLog 结构与现有语义主题，不增加视觉变体。阶段文案区分返修进行中、结果已提交和返修未完成；详情保留来源审查 ID、原生会话、模型与停止原因，成功摘要仍默认收起，失败或交接停止时展开。首次审查要求修改且代码 current 时至多返修并复查一次；尚未交接的当前审查提供明确标注“消耗额度”的返修动作。过期审查引导核对代码，返修后仍有问题则查看剩余问题；取消、派发不明确、未产生改动、范围外改动或次数用完时停止。

历史区分别显示计划、执行/返修与审查的 `n/2` 计数，失败和取消也计入；执行/返修表示首次执行加一次返修。审查达到 `2/2` 时按钮文案为“审查次数已用完（2/2）”，并使用真实 disabled 语义。刷新与重启恢复只读取已有记录；需要服务持续运行的自动交接不能表示成重启后自动重放。sidecar 的返修与用尽状态仅为结构示例，真实行为和验收边界以对应 surface brief、`PRODUCT.md` 与第15课记录为准。

### Execution plan

执行计划在工作记录内展开，随记录滚动；内容直接使用 Vibe Kanban 的 ChatEntryContainer(plan) 与 ChatTodoList，保留源组件的 header/content/actions 结构与整体、步骤折叠交互。边界与表面采用现有中性主题映射，标题折叠按钮与动作控件保持并列，不嵌套交互。详情槽显示原有说明、文件与验收列表，所有步骤在未执行时保持未完成；假设使用原生 details。

生成前明确说明使用 Codex 账号额度、每任务最多两次，失败或取消也计入。生成中展示真实状态与停止操作，不自动重试；刷新及恢复只读取已保存状态，重新生成须通过明确标注“消耗额度”的动作发起。代码新鲜度不是 current 时展示 destructive Alert；错误沿用同一 Alert。仅在返回真实用量时显示 tokens，费用未返回时如实说明。

上下文说明区分本次读取的源码片段数、项目文件数与截断状态；计划中的验收方式尚未执行。计划就绪后由任务主动作显式交给 WorkBuddy 原生执行，按钮说明执行与自动审查均消耗各自账号额度。生成计划本身不会修改代码；不将计划步骤渲染为已完成进度。

### Connection popover and feedback

连接信息在工具栏 Popover 中查看；WorkBuddy 使用现有 outline“检查连接”和 ghost“启动并连接”按钮，连接期间禁用两项操作。连接返回值决定“待检查/已连接”标记及分工行说明，连接错误就地显示；Codex 继续标为计划与审查时按需连接，不把本地任务服务、MCP 工具数和原生执行通道混作一种状态。错误使用 Alert，简短操作反馈可关闭。Badge 用于任务编号和紧凑结果，不扩展成展示指标。

目录相关的 Git 错误使用中文说明，并在可定位时给出应选择的项目根目录。本地服务仍连接时，操作错误提供“关闭错误提示”；服务未连接时提供“重新连接 / 刷新”。关闭操作错误不触发重新连接，表单草稿保留；两类反馈沿用既有 Alert 与 ghost Button，不新增错误样式。

## Do's and Don'ts

### Do:
- **Do** 优先使用已移植控件的现有变体、语义颜色与交互。
- **Do** 让需求、代码改动和审查处于同一任务上下文。
- **Do** 为状态、空内容和不可用操作展示真实依据。
- **Do** 区分计划生成的额度消耗、只读刷新、真实 tokens 与尚未执行的验收方式。

### Don't:
- **Don't** 恢复用户已否定的墨绿静态角色说明栏。
- **Don't** 为填满界面虚构任务、消息、执行进度或连接成功。
- **Don't** 把本轮桌面最小宽度验证扩大为移动端支持声明。
