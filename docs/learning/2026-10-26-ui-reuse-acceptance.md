# 0.8.1 界面组件移植验收

用户反馈 0.8.0 页面简陋、AI 模板感强，并明确要求可复用的直接复用。本轮优先处理界面，原定的 Codex 自动规划没有开始实现。

## 实际变更

- 从 Jean 固定提交 `cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3` 移植真实 React UI 源码，原始路径、blob SHA 与适配说明保存在 `vendor/jean/NOTICE.md`。
- 使用上游 Sidebar、InputGroup、Resizable、Popover、Tooltip、Field 与控件；使用提取的浅深语义主题，替换旧墨绿静态角色说明栏。
- 连接真实任务与差异；增加任务筛选、侧栏 Ctrl+B/按钮收起、分隔条键盘调整、连接面板与持久化主题。
- 保留原有 Python/MCP、SQLite、Git、审查与额度边界。没有移植 Tauri 或另一套业务后端。
- 源码可直接取得，本轮没有逆向其他应用，没有新增真实模型调用。

## 检查结果

- TypeScript 主进程/界面类型检查及生产构建通过。
- ESLint 通过。vendor 保留上游源码格式和 variant 导出，格式化与 Fast Refresh 专用风格规则不强制改写它；类型/功能规则继续生效。
- 真实 Electron smoke：创建任务、修改/新增差异、源目录不变、任务恢复、960px 无全页横向溢出、筛选、侧栏、分栏键盘操作、连接面板和主题恢复均通过。
- smoke 证据在 `.agent-review-loop/desktop-smoke-mVxPfg/`，含六张真实截图和 `result.json`。测试数据为隔离合成 Git 项目，未写入实际任务库。关闭过渡动画以固定截图终态。
- 本轮 detector 执行一次返回空数组；旧设计体系正在被替换，因此扫描没有使用旧墨绿 token 作为豁免依据。
- 独立 finish reviewer 查看六种状态后判定 ship，无 material fix；范围为当前桌面开发预览。

## 范围

这不是 Jean 完整 fork，也没有获得它的全部 Agent 能力。当前调用链仍是我们自己的桌面 → 受限 IPC → MCP → Python。Codex 自动拆解、WorkBuddy 自动执行与自动返修仍未接入。工作台的审查接口沿用既有后端，本轮未消耗模型额度完成一次新审查。

尚未制作包含 Python 的独立安装包；仅本机 Windows 实际验收。未推送远程或声称 GitHub CI 已运行。
