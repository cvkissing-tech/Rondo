---
version: 1
slug: "desktop-src-renderer-src-app-tsx"
primary_target: "desktop/src/renderer/src/App.tsx"
related_targets: []
---

# 桌面工作台组件移植

Mode: Operate。Windows Electron，1360×900主窗口，最小960×680。用户明确否定上一版通用表单与三栏静态说明，要求直接复用可用产品组件。

## Direction contract

THESIS: 直接复用 Jean 的真实 UI 组件与中性主题，让工作区、任务、需求和差异占据屏幕；撤掉常驻角色说明栏。

OWN-WORLD: 上游 Jean 的中性浅/深色语义主题、紧凑侧栏、Radix 控件与分栏；以 Windows 系统 UI 字体阅读中文，等宽只用于路径和代码。使用真实 sidebar/input-group/resizable 源码，避免另造同类控件。

STORY: 从侧栏打开任务；新任务在居中的输入组合里写需求与验收。项目选择与任务设置是紧凑控件。准备完成后进入详情；需要查看代码或审查时打开可调整大小的工作区域，状态说明按需展开。

FIRST VIEWPORT: 240px可收起侧栏含真实任务搜索与列表；48px任务工具栏含切换导航、目录、连接和主题操作。新任务主区为约720px需求输入组合，不展示说明卡片或虚构活动。详情使用上游Resizable组件关联需求与计划、差异/审查；无改动时显示真实空状态。

FORM: code-led，按用户“直接复用”要求固定采用coollabsio/jean cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3，不再随机创作视觉世界。seed: none (pinned upstream product)。沿用用户已授权的产品功能和代码复用范围。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Truth and preservation

保留现有创建、恢复、工作区打开/复制、修改/新增差异和审查接口。所有侧栏项目来自数据库；不加入虚构任务、Agent消息、执行进度或已连接声明。Codex已支持显式生成执行计划，包含步骤、文件、验收方式、假设及代码新鲜度；每任务最多两次，生成使用额度，刷新与恢复不再生成。WorkBuddy自动执行尚未接入，计划中的检查不会自动运行。计划与审查均标明额度行为。
