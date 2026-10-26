# 第12课：直接移植产品界面与 REA 恢复

0.9.1 根据用户要求，把复用范围从基础控件扩大到成熟产品的界面模块。
不再为工作台外壳、任务导航、输入容器和计划条目另造一套视觉规则。

## 先澄清上一版

0.8.1/0.9.0 复制了 Jean 的真实 Sidebar、InputGroup、Button、Resizable 等源码，
但任务页面的布局、表单容器与计划列表仍由本项目组合实现。
这是真实的组件复用，不能等同于完整产品界面移植。

## 现在具体使用什么

| 部位 | 产品与固定来源 | 本地使用位置 | 必要适配 |
| --- | --- | --- | --- |
| 窗口、72px 导航轨、侧栏结构 | coollabsio/jean `cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3` 的 MainWindow / SidebarTabRail | vendor/jean/components/workbench/WorkbenchShell.tsx | Tauri/store 换成现有 SidebarProvider 与 props；移除本产品没有的入口 |
| 任务导航、搜索、选中行 | 同版本 ProjectsSidebar / ProjectTreeItem | vendor/jean/components/workbench/TaskSidebar.tsx | 绑定真实 MCP tasks；保留上游行布局、筛选与选中样式；不引入远程服务器管理 |
| 新任务页面布局 | 同版本 WelcomeProjectGrid | App.tsx 的新任务区 | 保留其列式容器与标题布局，内容换为本项目的实际输入字段 |
| 需求输入容器 | 本机 Codex 26.1021.3705.0，经 REA 静态分析 | vendor/codex/ComposerLayout.tsx + composer.css | 直接复制已发布 CSS 的选择器与声明；React 薄适配替代私有编辑器和状态依赖 |
| 计划容器与步骤 | BloopAI/vibe-kanban `d5cbb5380fa0b32e98ef9b8d987f63decce4be3a` 的 ChatEntryContainer / ChatTodoList | vendor/vibe-kanban + PlanPanel.tsx | 图标/翻译/工具函数接现有依赖；增加详情槽保留文件与验收文本；补键盘操作 |
| 代码差异 | 已安装的 @pierre/diffs | PatchView.tsx | 继续直接调用 FileDiff，保留解析失败后的原始差异回退 |

Jean、Vibe Kanban 的原许可证和来源记录随 vendor 保存。
Codex 恢复部分根据本次用户授权处理，provenance.json 记录本机包来源、SHA256 和原 CSS 字节范围。
已复核4份原文件SHA256，以及86条样式各自的原字节范围；移植样式正文原样复制。
不把闭源恢复代码描述为上游原始 TSX，也不把 React 适配描述为直接导入整个桌面程序。

## 关键代码看这里

`App.tsx` 接的是产品模块与真实业务数据，而不是只把按钮换皮：

```tsx
<WorkbenchShell sidebar={<TaskSidebar tasks={tasks} ... />} toolbar={...}>
  {/* 原有任务创建、计划、差异与审查内容 */}
</WorkbenchShell>
```

`PlanPanel.tsx` 直接使用 Vibe 的产品级组件：

```tsx
<ChatEntryContainer variant="plan" expanded title="Codex 执行计划">
  <ChatTodoList todos={steps} expanded={stepsExpanded} onToggle={...} />
</ChatEntryContainer>
```

需求输入保留恢复出的 `_ComposerLayoutRoot_1q7o3_2` 等选择器和 data 变体。
颜色映射到已有 Jean 语义变量，几何、间距、阴影声明来自实际包。
原应用的账号、遥测、私有后端与编辑器依赖没有接入；这些部分不属于输入容器移植。

## REA 实际做了什么

- Codex：对安装包中选出的 7 个 JS 做静态分析，152,032 bytes，0 parse failures；父 Evidence 为 `ev_45324be29d34caab057ef8763d9505f343f6548e2229f640c01c6880a54ecc0c`。样式另外按原字节范围提取，不执行应用 bundle。
- WorkBuddy：完整 ASAR 分析遇到原生附属文件哈希不一致，记录后继续的全包分析又在 300 秒超时，不能把它当成功。
- 随后从同一个 WorkBuddy 包中只提取状态 chip、项目来源 chip 和 workspace preparing 三个相关 JS，以及两份 CSS。REA 对这 26,764 bytes 的 JS 分析完成，0 parse failures；父 Evidence 为 `ev_83b2a400b2f4847ad4d12f62c0eb0f7e8135480c84b7a87ecddd9421e68e7043`。
- 对 workspace-preparing 的静态追踪 Evidence 为 `ev_004333b76284e22d4a0a0181f33f1007a378a171e4637aabdf7fe7f71e173cf8`。发现其组件包含随机递增到 85% 的加载百分比逻辑；本项目没有真实百分比来源，因此不移植这部分。
- REA 的相关动态调用与语义关系仍有未知项。这里的结论只覆盖选定模块；不是对整个应用或运行行为的完整还原。

本机原始包和用户数据没有修改。忽略于 Git 的完整调查证据位于
`.agent-review-loop/rea-codex-ui/` 与 `.agent-review-loop/rea-workbuddy/`。

## 这轮保持的产品事实

任务数据、工作目录、计划、差异与审查仍使用现有后端。
计划生成成功不表示步骤已执行，Vibe 待办项保持未完成状态。
WorkBuddy 自动执行仍未接通。本轮 UI 验证不再调用模型，复用上一轮已保存计划。

后续 UI 改动继续先查产品源码；缺源码的目标使用 REA。每个移植模块说明来源、
原样保留部分、适配部分和未恢复部分，不再把基础组件复用当成完整产品移植。
