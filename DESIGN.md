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

主工作区采用 T3 Code 的 ChatView 组合、用户消息容器、TimelineSystemDivider 与右侧面板模式；Rondo 的持久任务、规划、执行与审查替代上游状态及传输。精确来源与必要适配见 `vendor/t3code/workspace-provenance.json`，不把抽出的组合容器称作完整移植 T3 运行时。需求与真实 Agent 返回连续可读，当前动作固定在会话底部，文件、改动和已保存原生会话默认在右侧可达。

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
- 已准备任务默认并列显示会话与工作区检查面板，初始比例 62/38，最小比例分别为 42/28。分隔条沿用 Jean Resizable 控件，支持调整；右侧可收起，工具栏“代码改动”可恢复并切换到改动页。
- 会话标题区固定高 68px。中间消息区独立滚动，消息通道最大宽度 860px，内边距 28px 26px 32px；滚动留白由 `scroll-padding-block: 20px` 提供。用户需求初始完整展示，验收条件和工作区明细按需展开。
- 底部动作区不随消息滚走；内边距 14px 24px 18px，包含真实阶段、说明和一个下一步主动作。跳转已有计划或审查时，将相应消息滚入会话区并将焦点移至其按钮。
- 右侧检查面板默认可见，拥有高 42px 的“文件 / 改动 / 会话”标签栏。文件列表、源码、差异和会话列表各自按内容滚动；文件列表不超过面板高度的 36%，至少保留 90px。源码区域使用剩余空间。
- 1100px 以下任务侧栏为 210px，会话内容内边距为 22px 18px，底部动作为 12px 16px 并允许按钮换行；去掉重复的动作区环境尾注。最小桌面窗口宽度为 960px，不据此宣称移动端支持。

## Elevation & Depth

主区域用语义表面与细边界区分；Popover、Tooltip 沿用上游覆盖层，焦点使用 ring 与可见轮廓。Codex 输入容器保留恢复 CSS 的柔和表面阴影；本轮未另加装饰阴影体系。

上游 Button 的零模糊 raised 下沿是现有移植源码携带的处理，不作为新增组件应继承的阴影 token。TaskSidebar 携带的选中竖线同样只记录为现有源码处理，不把它推广为全产品 callout 或卡片规则。

## Shapes

基础圆角为 0.5rem，控件沿用其减 2px 的计算。用户消息容器使用 rounded-2xl（1rem），需求输入组合沿用 Codex large 变体的 28px 圆角。细分隔表达消息与产物的结构；不为每段 Agent 正文再套卡片。

## Components

### Buttons and inputs

使用 Jean Button 的 default、outline、ghost 变体及大小接口。主动作保留明确文字；工具栏使用 ghost，打开目录或原生会话使用 outline。禁用状态使用实际 disabled，不能仅变灰。表单继续使用 Jean Field/InputGroup/Textarea 和 REA 恢复的 Codex ComposerLayout，保持 label 关联与本机草稿恢复。

新任务入口统一选择项目或保存位置，不增加新建/已有模式选择；保留“准备任务不消耗模型额度”说明。接入配置按需展开，错误沿用 Alert；服务连接中断与普通操作失败分别提供重连或关闭错误操作。

### Task navigation

复用 Jean ProjectsSidebar / ProjectTreeItem 的任务列表、搜索、已提交筛选和分页，嵌入新的 WorkbenchShell；不再附加独立图标轨。当前选择、状态、空内容和连接说明来自实际数据，底部保留接入说明。任务过多时侧栏中部滚动，品牌与底部区域保留。

### Conversation and action dock

复用 `pingdotgg/t3code` 提交 `210b2e7c6a8be11441b7afc94742ce3c76860111` 的 ChatView 组合、用户消息结构与 TimelineSystemDivider。`ChatWorkspace.tsx` 以 header / children / footer 槽接入 Rondo 数据，保留独立消息滚动和底部动作区，不引入上游业务状态、路由或传输系统。

需求全文作为首条用户消息；规划、WorkBuddy 执行、审查按实际作业形成 Agent 消息。WorkBuddy 存在执行或提交时，完整报告默认展开；用户主动折叠后才显示最多 180 字预览。规划、审查依已有作业决定初始展开，交互标题保留 aria-expanded 与键盘焦点。结果、检查、审查结论继续分别呈现，不把模型回合结束当作验收通过。

当前阶段和一个下一步动作位于固定底部区；额度消耗、失败/取消、快照过期及次数限制继续如实说明。历史元数据在独立 details 中只读展示，不冒称完整聊天或事件溯源。返修与剩余次数沿用同一消息、动作和语义主题，恢复不自动重放模型调用。

### Workspace inspector

`WorkspaceInspector.tsx` 采用 T3 RightPanelTabs / PreviewPanelShell 模式，由 Rondo 的本地文件和会话服务替代上游浏览器/终端服务。标签有 tablist、tab、tabpanel 语义，支持键盘切换。

“文件”读取真实工作区，展示路径和大小，可选择文件读源码、刷新或打开目录；仅有可预览产物时显示“运行预览”。“改动”继续使用 Pierre Diffs 并跟随主题，保留真实空状态及错误反馈。“会话”按规划、执行、审查显示已保存的会话、模型与本机配置，打开操作只指向已有原生记录，不重发任务；缺少持久会话的历史 Codex 项明确解释并禁用打开按钮。

### Plan, native events and feedback

计划内容复用 Vibe ChatEntryContainer(plan) / ChatTodoList，保持 header/content/actions 与整体、步骤折叠。返回的计划不是执行完成，验收方式不是已执行检查；只在有真实用量时显示 tokens。

Codex 工具与会话事件位于对应 Agent 消息中，原生 details 按需展开；最近事件有界显示，输出区域内部滚动。待处理的 command/file 审批和用户问题在现有输入、select 和 Button 中呈现，不能用模拟答复继续执行。本文记录实现中的状态与控件，不据源码存在宣称已验证原生跳转或审批交互。

连接信息放在工具栏 Popover 中，本地任务服务、MCP 配置项、WorkBuddy 原生通道与模型就绪是不同状态。反馈使用原有 Alert 和可关闭通知；刷新和恢复是只读操作，不能变成付费重试。

## Do's and Don'ts

### Do:
- **Do** 优先复用已移植组件、语义主题与现有交互。
- **Do** 将完整需求、Agent 返回、产物与当前动作留在同一任务上下文。
- **Do** 保留消息、源码、差异和列表各自的滚动边界及键盘焦点。
- **Do** 区分真实状态、已保存记录、只读刷新与消耗额度的动作。

### Don't:
- **Don't** 恢复旧图标轨、墨绿静态角色栏或默认收起完整 WorkBuddy 报告的旧布局。
- **Don't** 为填满页面虚构任务、报告、进度、会话或连接成功。
- **Don't** 将源码结构复用说成完整移植上游运行时，或将窗口截图扩大为原生会话与审批验收。
