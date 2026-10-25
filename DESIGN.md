---
name: Agent Review Loop
description: 墨绿导航、灰白工作面和清晰状态组成的本地开发工作台
colors:
  accent: "#285b46"
  accent-hover: "#1d4936"
  text: "#23342e"
  muted: "#5e6b62"
  canvas: "#f4f5f3"
  surface: "#ffffff"
  header: "#fafbf9"
  sidebar: "#233e33"
  sidebar-text: "#eff4ef"
  sidebar-selected: "#3b5a49"
  agent-surface: "#f0f3ee"
  line: "#dde2dc"
  placeholder: "#68776b"
  pending: "#76643e"
  focus: "#2e8060"
typography:
  headline:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "15px"
    fontWeight: 650
  body:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  code:
    fontFamily: "Consolas, monospace"
    fontSize: "12px"
rounded:
  badge: "4px"
  control: "6px"
  agent-icon: "9px"
  form: "10px"
spacing:
  control-gap: "8px"
  field-padding: "11px 12px"
  action-padding: "11px 15px"
  tabs-gap: "24px"
  primary-padding: "36px 34px 60px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "{spacing.action-padding}"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "{spacing.field-padding}"
  navigation:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.sidebar-text}"
    width: "224px"
  navigation-selected:
    backgroundColor: "{colors.sidebar-selected}"
    textColor: "{colors.surface}"
---

# Design System: Agent Review Loop

## Overview

视觉方向沿用“事务所项目册”：以稳定的导航、白色工作面、墨绿动作和细分隔组织开发任务。克制体现在信息层级与状态表达，不使用纸张纹理、装订装饰或营销式大标题。

这是一套桌面操作界面。系统字体服务于中文输入、任务阅读和持续使用；代码、路径才使用等宽字体。图标统一来自 Lucide，现有界面不依赖装饰图片。

## Colors

墨绿 `accent` 用于主动作和选中标签；更深的 `sidebar` 承载持久任务导航。`canvas`、`surface` 与 `agent-surface` 通过色阶区分主工作区、输入面和角色说明。

`text` 用于正文，`muted` 用于说明。待接入状态使用 `pending`，同时保留明确文字，不能只靠颜色传达状态。当前占位文字为 `placeholder`，不回退为修复前的浅灰。

## Typography

操作字体为 Segoe UI、Microsoft YaHei UI 和 sans-serif；Consolas 仅用于路径与代码。页面标题 24px/650，窄窗口降为 22px；节标题 15px/650；正文基准 14px，任务说明和表单文字多为 13px。辅助说明为 11–12px，角色状态为 10px，均保留清晰对比。

标题不使用额外的眉题；任务编号、基础提交和状态属于直接关联当前任务的操作信息。

## Layout

主窗口 1360×900，最小 960×680。左导航固定 224px，顶部栏高 65px；其余区域使用主内容与 240px 角色栏两列，内容总宽最多 1400px。主区域内边距为 36px 34px 60px。

1100px 及以下导航变为 202px、角色栏为 204px、主区域为 30px 22px。任务标题允许换行，长路径省略并保留完整 title 与复制操作。工作内容纵向滚动；当前实现是桌面窗口，不定义手机布局。

## Elevation & Depth

界面不用投影。深度来自深色导航、浅色角色栏、白色输入面和 1px 边界；主动作通过实色强调。焦点使用 2px `focus` 外轮廓，偏移 3px，不作为装饰阴影。

## Shapes

控件统一 6px 圆角，表单容器 10px，角色图标容器 9px，状态标签 4px。标签导航用底部 2px 线表示选中；不为每段正文再套卡片。

## Components

**按钮。** 主按钮为墨绿底白字，11px 15px 内边距；悬停切换为 accent-hover。普通按钮白底、1px 描边，悬停使用浅绿。禁用状态透明度 0.48，并保留实际 disabled 语义。

**输入。** 白底、1px `#ccd5cc` 边框，11px 12px 内边距。字段有可见标签，文本框允许纵向调整；错误显示于页面提醒区，已输入内容保留。

**导航。** 任务项左对齐，标题下方显示编号与实际状态。选中背景为 sidebar-selected；任务列表独立滚动，接入说明和连接状态位于底部。

**任务详情。** 标题、工作区路径条和三个内容标签形成稳定框架。路径支持复制与打开；差异使用 Pierre Diffs，异常时退回原始补丁。审查主动作旁说明额度行为；后台终态和测试状态分别呈现。

## Do's and Don'ts

- **Do** 沿用灰白工作面、细边界与墨绿操作色；扩展界面继续使用现有控件语法。
- **Do** 使用明确文字区分已完成、待接入、运行中、失败和取消。
- **Do** 保留可见标签、键盘焦点、长文本换行与窄窗口可操作性。
- **Don't** 将尚未接通的 Agent 显示为正在执行，或用模拟进度替代真实状态。
- **Don't** 增加装饰图片、纹理或指标卡来填充空任务列表。
- **Don't** 将路径截断后的可见文本当作完整路径，也不把审查通过等同于测试或人工验收通过。
