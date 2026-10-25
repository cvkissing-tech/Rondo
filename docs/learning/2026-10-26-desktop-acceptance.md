# 0.8.0 桌面开发预览验收

日期：2026-10-26（Asia/Shanghai）。仅本机 Windows 实际运行。

## 完成

- Electron / React / TypeScript 桌面入口，调用现有 Python MCP，无新增 HTTP 服务或任务数据库。
- 真实 MCP 发现 14 个工具；表单创建独立 Git worktree，自动进入任务；工作区路径打开/复制入口。
- 查看已修改文件及未跟踪文件；Pierre Diffs 多文件显示；超大/无法解析的补丁有原始文本降级。
- 显式审查入口、状态轮询、取消、分页结果及重开任务恢复最新作业；消费额度前有明确说明。
- 默认任务/工作区读写真实本地库；测试使用独立库。没有修改 WorkBuddy 配置。

## 实际结果

| 检查 | 结果与范围 |
| --- | --- |
| `unittest tests.test_task_launch tests.test_mcp` | 7 项通过，覆盖任务/新增差异与 MCP 兼容工具集 |
| `npm --prefix desktop run lint` | 通过，0 错误/警告 |
| `npm --prefix desktop run build` | 主进程与前端类型检查、生产构建通过 |
| `npm --prefix desktop run smoke` | 真实 Electron + Python MCP，界面创建、改动、原目录不变、960px 无横向溢出、重开恢复通过 |
| 界面检测 | 对修改的 TSX/CSS 执行一次 detector，返回空数组 |
| 独立界面复核 | 初次要求修复小字对比度；同视口复拍后原问题 resolved，disposition ship。此结论覆盖修复项 |
| 设计文档 | `DESIGN.md` 及 `.impeccable/design.json` 已从当前源码提取 |

最终 smoke 证据在本机 `.agent-review-loop/desktop-smoke-CTq9df/`：四张真实窗口截图与 `result.json`。证据目录忽略于 Git，新环境运行会生成自己的目录。新增 Windows 桌面 CI 仅运行依赖安装、lint、build；尚未推送或在 GitHub 执行。

## 未完成与未验证

没有新增真实模型调用，没有从桌面按钮消耗额度验证一次完整审查。启动/查询/取消使用现有后端契约，本轮 UI smoke 只验证到审查入口。此前真实合成审查单独见第5课，不能作为本轮桌面端或 WorkBuddy 完整执行证明。

尚未接入 Codex 自动拆解、WorkBuddy 自动执行、自动返修；界面标明待接入。尚未打包 Python 运行时或独立安装器，macOS/Linux 桌面运行未验证。旧 `create_task` 任务没有受管理工作区，点击时返回 TASK_NOT_PREPARED，不会擅自创建新目录。

## 本轮复用

官方 Electron-vite React/TypeScript 模板、官方 TS MCP 客户端、Pierre Diffs、Lucide。保留 Python/SQLite/Git 核心。没有整体 fork 其他产品，也没有宣称自动执行已接通。
