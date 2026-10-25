# Agent Review Loop desktop

Windows 桌面开发预览，React / TypeScript / Electron-vite。运行需要项目根目录的 Python 后端环境；尚不是独立安装包。

在项目根目录执行：

```powershell
npm --prefix desktop ci
npm --prefix desktop run dev
```

生产模式开发预览：`npm --prefix desktop run build` 后双击根目录 `Start-Desktop.cmd`。

校验：`npm --prefix desktop run lint`、`npm --prefix desktop run build`、`npm --prefix desktop run smoke`。smoke 启动真实 Electron 和 Python MCP，使用隔离测试库，不调用模型。

可用：准备任务、恢复、目录打开/复制、代码差异、显式 Codex 审查/查询/取消。未接入：自动规划、WorkBuddy 自动执行与自动返修。完整说明见 [第9课](../docs/learning/09-desktop-workbench.md)。
