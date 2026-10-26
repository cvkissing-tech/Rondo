---
version: 1
slug: "desktop-src-renderer-src-app-tsx"
primary_target: "desktop/src/renderer/src/App.tsx"
related_targets: []
---

# 桌面工作台组件移植

Mode: Operate。Windows Electron，1360×900主窗口，最小960×680。用户明确否定上一版通用表单与三栏静态说明，要求直接复用可用产品组件。

## Direction contract

THESIS: 以同一任务的需求、规划、执行提交、审查记录表达开发过程；当前阶段、Agent 分工和下一步动作可直接读懂。直接复用成熟产品模块，不另创视觉世界。

OWN-WORLD: 保留 Jean 72px导航轨、240px任务栏、32px顶栏与浅深主题；主区移植 T3 Code WorkLog，计划保留 Vibe 组件结构并映射现有中性表面。Windows系统字体与Lucide图标沿用。

STORY: 打开任务先读阶段与角色，需求和路径默认折叠；展开需要的计划、执行提交和审查记录，按需打开侧面差异。刷新和恢复读取已有结果；显式生成才使用额度。WorkBuddy未接入时不渲染虚构执行。

FIRST VIEWPORT: 任务标题、规划/执行/审查分工、当前阶段和一个主动作；下方为T3工作记录。需求摘要可见、全文和目录收起。差异关闭时记录占主区，打开后62/38可调整分栏；960px仍可操作。MCP数量位于连接详情，已保存作业概要按需展开。

FORM: code-led，用户明确固定成熟产品复用，无随机seed或新风格：Jean cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3、T3 Code 3de45c6254345f968fbdc64db7b149bf4f429855、Vibe Kanban d5cbb5380fa0b32e98ef9b8d987f63decce4be3a、REA恢复的Codex26.1021.3705.0输入容器。产品级来源及适配见各vendor NOTICE。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Truth and preservation

保留现有创建、恢复、工作区打开/复制、修改/新增差异和审查接口。所有侧栏项目来自数据库；不加入虚构任务、Agent消息、执行进度或已连接声明。Codex已支持显式生成执行计划，包含步骤、文件、验收方式、假设及代码新鲜度；每任务最多两次，生成使用额度，刷新与恢复不再生成。WorkBuddy自动执行尚未接入，计划中的检查不会自动运行。计划与审查均标明额度行为。
