---
name: Agent Review Loop
description: 直接移植 Jean 产品布局、Vibe Kanban 计划组件与 REA 恢复的 Codex 输入容器
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

# Design System: Agent Review Loop

## Overview

**Creative North Star: "可操作的开发工作台"**

本体系直接复用 Jean 的 React 控件与语义主题，来源为 `coollabsio/jean` 提交 `cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3`。来源、文件身份和适配说明保存在 `desktop/src/renderer/src/vendor/jean/NOTICE.md`。它取代用户已否定的旧墨绿表单体系。

设计重心是项目、需求与实际代码改动。浅深主题采用同一组语义角色；系统字体承载中文操作与阅读，成熟控件提供导航、焦点、提示和分栏行为。页面不再用常驻角色介绍填满一侧。

**Key Characteristics:**
- 中性工作面与紧凑导航。
- 需求、代码改动和审查保持同一任务上下文。
- 真实源码组件复用，状态说明按需打开。

## Colors

浅色以白色工作面、浅灰导航和深灰文字分层。深色以近黑工作面、较浅的输入/弹出层和浅色文字分层；上游主题的黄色用于深色主动作与焦点。色值以 frontmatter 为准，深色键对应 `.dark` 对同名 CSS 变量的覆盖。

### Primary

浅色主动作使用 `primary` 与 `primary-foreground`；深色使用对应的 `dark-primary` 角色。它们是操作层级，不构成大面积装饰底色。

### Neutral

`background`、`sidebar`、`muted` 和 `border` 承担表面、导航、选中背景与分隔。应用对上游的次级文字和导航底色做了已落地的覆盖，记录于 `assets/main.css`；不要从未覆盖的上游默认值反推最终颜色。

错误与计划过期提示使用 Alert 的 `destructive` 语义；深色对应 `dark-destructive`，来自应用 `.dark` 中已实现的覆盖，保证近黑工作面上的错误文字可读。它不替代主动作色或中性色层级。

**The Semantic Theme Rule.** 页面及复用控件使用语义变量；切换主题时共同变化，不在单个控件中另造浅深配色。

## Typography

操作字体为 Segoe UI、Microsoft YaHei UI 和 sans-serif 回退。系统字体适用于此 Operate 界面；不承担营销展示角色。Consolas 和 Courier New 仅用于实际代码、提交与文件路径。

层级由新任务标题、任务文档标题、工具栏标题、正文和辅助标签构成，具体 token 见 frontmatter。页面 CSS 根字号为 14px，正文覆盖为 13px；因此来自上游的 rem 控件尺寸按当前根字号计算，不把上游默认根字号的像素值直接搬入文档。需求文本保留换行并可换长行，路径允许任意位置折行。

## Layout

- 外壳占满窗口，页面整体不产生滚动；任务正文、差异和审查区域分别拥有滚动。
- 侧栏由上游 Sidebar 组件提供，展开宽度 240px，图标收起宽度使用上游 `3rem`；Ctrl+B 或工具栏按钮切换。
- 顶部工作台工具栏 49px；任务视图工具栏最小高度 61px，分栏标题行 39px。
- 新任务标题和表单最大宽度 690px；可选任务名位于任务设置中。
- 单文档区域最大宽度 820px。执行计划、代码与审查视图使用上游 ResizablePanelGroup，初始上下文/工作面比例 40/60，最小比例 25/40。
- 1100px 以下工具栏允许换行，文档及审查区域收紧内边距。当前交付的桌面最小窗口宽度是 960px；不将导入组件自带的移动端分支当作已交付手机版。

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

### Navigation

直接移植 Jean MainWindow / SidebarTabRail / ProjectsSidebar / ProjectTreeItem 的产品布局：72px 导航轨、可收起的 240px 任务栏、32px 顶栏；Ctrl B 收起与恢复。真实任务列表支持搜索、已提交筛选、状态、分页；底部保留接入说明与本地 MCP 状态。

### Split work area

按需打开任务上下文旁的执行计划、代码改动或审查面板。分隔条支持拖动与方向键；代码视图保持 Pierre Diffs 并跟随浅深主题。没有改动或结果时使用真实 Empty 状态。

### Execution plan

执行计划沿用可调整分栏，正文独立滚动；内容直接使用 Vibe Kanban 的 ChatEntryContainer(plan) 与 ChatTodoList，保留源组件的 header/content/actions 结构、计划色与整体折叠交互。详情槽显示原有说明、文件与验收列表，所有步骤在未执行时保持未完成。Vibe 主题值仅在 .vibe-plan-surface 内生效；假设使用原生 details。

生成前明确说明使用 Codex 账号额度、每任务最多两次，失败或取消也计入。生成中展示真实状态与停止操作，不自动重试；刷新及恢复只读取已保存状态，重新生成须通过明确标注“消耗额度”的动作发起。代码新鲜度不是 current 时展示 destructive Alert；错误沿用同一 Alert。仅在返回真实用量时显示 tokens，费用未返回时如实说明。

上下文说明区分本次读取的源码片段数、项目文件数与截断状态；计划中的验收方式尚未执行。底部明确 WorkBuddy 自动执行未接入，生成计划不会修改代码或自动运行命令，不将计划步骤渲染为已完成进度。

### Connection popover and feedback

连接信息在工具栏 Popover 中查看；未接入能力明确显示，不能用绿色状态或虚构消息填补。错误使用 Alert，简短操作反馈可关闭。Badge 用于任务编号和紧凑结果，不扩展成展示指标。

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
