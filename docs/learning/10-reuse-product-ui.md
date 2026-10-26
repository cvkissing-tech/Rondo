# 第10课：直接移植开源产品的界面组件

0.8.1 根据用户反馈替换 0.8.0 的墨绿表单界面。原版虽然使用了 Electron-vite、MCP 和 Pierre Diffs，但页面主体自己组装，静态角色说明占据整栏，不能把基础库复用等同于已经复用成熟产品界面。

这次实际移植 [Jean](https://github.com/coollabsio/jean) 的 React 控件和主题，固定提交 `cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3`。源码位于 `desktop/src/renderer/src/vendor/jean/`，`NOTICE.md` 记录原路径及文件 blob SHA；保留原 LICENSE.md。源码可直接取得，本轮未逆向其他应用。

## 哪些是直接复用，哪些由我们接入

| 能力 | 直接复用的源码 | 我们的接入 |
| --- | --- | --- |
| 任务侧栏、收起、键盘快捷键 | `components/ui/sidebar.tsx` | 展示 SQLite 中的真实任务；Ctrl+B；用 localStorage 替代网页 cookie |
| 需求输入组合、字段、按钮 | `input-group.tsx`、`field.tsx`、`button.tsx`、`input.tsx`、`textarea.tsx` | 表单调用已有 `start_task`，不伪装为已发送的 Agent 消息 |
| 可调整工作区分栏 | `resizable.tsx` / react-resizable-panels 3.0.6 | 左侧任务上下文，右侧代码差异或审查；支持拖动及方向键 |
| 提示、连接面板、状态 | `tooltip.tsx`、`popover.tsx`、`badge.tsx`、`alert.tsx`、`empty.tsx` | 接入 MCP 状态，WorkBuddy 明确未接入 |
| 浅色/深色基础主题 | 从上游 `src/App.css` 提取的 `theme.css` | Windows 字体、可读对比度、持久化选择，差异视图跟随主题 |

没有导入 Jean 的 Tauri、业务数据库、账号或 Agent 后端。现有 Electron 主进程与 Python/MCP 仍是我们产品的连接边界；组件通过属性和事件获得真实任务状态。

## 为什么复制源码还需要适配

开源产品的组件一般有本地别名、图标体系和样式构建器。直接复制文件但不带这些依赖，通常会得到空白、未排版或无法编译的页面。

本轮改动是有边界的：

- `@/components` 等别名改为 `@jean/`，并在 Vite/TypeScript 中同时声明。
- reicon 图标入口替换为已安装的 Lucide 对应图标。
- 引入 Tailwind 4 构建插件，保留上游语义颜色和组件变体，而不是重写一套控件 CSS。
- 不把原仓库的通用动画、字体偏好服务、Tauri 通信和云端数据一起拉进来。
- 上游 `use-mobile` 已有惰性初始化，去掉 effect 中重复的同步设置；侧栏在 Electron `file://` 下使用 localStorage 保存展开状态。
- vendor 保留上游排版和变体导出，不为满足本项目的格式化/Fast Refresh 风格拆散组件；类型和功能检查照常执行。

## 实际组合的代码

从 `desktop/src/renderer/src/App.tsx` 的这些入口读起：

```tsx
import { Sidebar, SidebarProvider, SidebarInset } from '@jean/components/ui/sidebar'
import { InputGroup, InputGroupTextarea } from '@jean/components/ui/input-group'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@jean/components/ui/resizable'

<SidebarProvider>
  <Sidebar>{/* 真实任务列表 */}</Sidebar>
  <SidebarInset>
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel>{/* 当前任务需求 */}</ResizablePanel>
      <ResizableHandle />
      <ResizablePanel>{/* 当前代码改动或审查结果 */}</ResizablePanel>
    </ResizablePanelGroup>
  </SidebarInset>
</SidebarProvider>
```

上述注释是讲解占位，实际源码里的区域都已连接相应数据，没有使用它们伪造运行结果。`prepare()`、`selectTask()`、`showChanges()`、`startReview()` 仍沿用第9课的后端调用链。

## 验收

`npm --prefix desktop run build` 和 `npm --prefix desktop run lint` 通过。真实 Electron smoke 使用隔离 Git 项目和数据库，完成创建任务、查看修改/新增、保持源目录不变、重开恢复，并检查任务筛选、Ctrl+B 侧栏、键盘调整分栏、连接弹出面板与深色主题恢复。

本机本轮截图及结果：`.agent-review-loop/desktop-smoke-mVxPfg/`。截图禁用过渡动画以固定展开/收起后的证据，避免把动画中间帧当成布局终态。没有新增真实模型调用，没有新增 WorkBuddy 自动执行能力。
