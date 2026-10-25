# 第9课：从桌面按钮追到 Git 工作区

本轮交付 0.8.0 Windows 桌面开发预览。主入口是我们自己的窗口；创建任务、恢复、查看差异均使用实际 Python 后端。自动拆解、WorkBuddy 自动执行与自动返修仍未接通，界面直接标明。没有新增 HTTP 服务或第二套任务数据库。

## 先运行，再看代码

在项目根目录双击 `Start-Desktop.cmd`。它运行已构建的桌面程序；首次缺少构建产物时会先构建。修改源码后用 `npm --prefix desktop run build` 更新；开发时用 `npm --prefix desktop run dev`。

1. 选择已经有至少一次提交的 Git 项目。
2. 填需求与验收条件，点“准备任务”。
3. 程序自动进入任务详情，不需要复制任务编号。上方目录是独立 worktree，从提交的 HEAD 开始，源目录未提交的文件不会复制。
4. 在该目录中修改文件，点“代码改动”查看。包括新增文件；再次点击标签会重新读取。
5. “审查结果”中可显式调用 Codex。只有此操作调用模型；请先停止写入代码。任务最多两次审查，失败或取消也计入。

当前“准备任务”不等于“自动开发”。WorkBuddy 的 MCP 客户端连接不等于桌面程序可以主动操控它。接下来先接结构化规划，再接实际执行适配器，沿用同一个任务编号关联结果。

## 一次点击经过了什么

```text
React 表单 App.tsx
  → preload 的 window.workbench.startTask()
  → Electron 主进程限定的 workbench:start-task IPC
  → 官方 TypeScript MCP Client.callTool('start_task')
  → Python MCP server.py
  → TaskLauncher.start() / TaskStore
  → Git worktree + SQLite 回执
  → 返回任务上下文，React 自动切换详情
```

从 `desktop/src/renderer/src/App.tsx` 的 `prepare` 开始读。请求号根据表单内容稳定复用，避免回复丢失时重复创建：

```ts
const fingerprint = JSON.stringify(data)
if (startRequest.current.fingerprint !== fingerprint)
  startRequest.current = { fingerprint, id: crypto.randomUUID() }
const result = await api.startTask({ ...data, request_id: startRequest.current.id })
await selectTask(result.task_id)
```

此处前端请求号保存在当前窗口内存中。重开应用通过数据库任务列表和最后任务编号恢复，而不是自动重发创建请求。

`desktop/src/preload/index.ts` 只公开任务需要的几个方法。页面不能取得原始 ipcRenderer、Node.js、任意命令执行或任意文件访问：

```ts
startTask: input => invoke('start-task', input),
context: id => invoke('context', id),
changes: id => invoke('changes', id)
```

`desktop/src/main/index.ts` 校验 IPC 来自本窗口主 frame，并把字段交给现有 MCP schema 校验。打开目录时从后端根据任务编号取得路径，页面不能借此要求打开任意 URL。

`desktop/src/main/backend.ts` 用官方 stdio transport 启动已有服务。多个界面请求复用一个连接；连接失败可重试，退出时关闭自己的服务。默认数据库是项目 `.agent-review-loop/workbuddy.sqlite3`。不修改 WorkBuddy 全局配置，不读取账号令牌。

## 差异显示为什么直接复用组件

`TaskLauncher.changes()` 复用已有临时 Git index 捕获能力，比较任务 base_commit 与当前 tree，包含未跟踪文件，不修改用户 index 或 HEAD。通过 `get_task_changes` 返回最多 200,000 字节的补丁。

前端懒加载 `desktop/src/renderer/src/PatchView.tsx`。Pierre 的 `PatchDiff` 只接受单文件补丁，因此这里使用库自带解析器和 `FileDiff`：

```tsx
const files = parsePatchFiles(patch, undefined, true).flatMap(group => group.files)
return <>{files.map((file, index) =>
  <FileDiff key={index} fileDiff={file}
    options={{ theme: 'github-light', diffStyle: 'unified' }} />
)}</>
```

超出显示上限时显示截断提示和原始文本；解析异常由局部 Error Boundary 降级到原始差异，不让整个任务窗口白屏。完整改动仍在工作区中。这是显示限制，不是模型上下文扩容。

## 审查与恢复

`get_task_context` 新增 `latest_review_job_id`；重开任务即可找到最新作业，不用重新消耗额度。React 约 2.5 秒查询一次状态；成功后读取分页结果。任务切换会停止旧任务的轮询。取消是一个请求，需继续等服务返回终态。

本轮桌面验收没有点击消耗额度的审查按钮，没有新增真实模型调用。审查启动/查询/取消复用已实现的后端；此前一次真实 Codex 合成审查的记录仍在第5课，本轮不将它冒充成完整桌面闭环验收。完整 WorkBuddy 开发/返修也未验证。

## 运行参数

从 PowerShell 设置环境变量后启动桌面：

| 变量 | 作用 |
| --- | --- |
| `ARL_PROJECT_ROOT` | 本项目源码根目录，默认 desktop 的上一级 |
| `ARL_PYTHON` | Python 可执行文件，默认根目录 .venv |
| `ARL_DATABASE` | SQLite 文件的绝对路径 |
| `ARL_TASK_ROOT` | 独立任务目录根路径 |
| `ARL_REVIEW_ROOT` | 审查证据目录根路径 |
| `ARL_CODEX_EXECUTABLE` | Codex CLI 路径；未设置则使用后端原规则 |
| `ARL_CHECK_CONFIG` | 已有检查配置 JSON；未配置时检查明确为 not_run |

这是源码环境预览，尚未打包 Python 运行时或独立安装器；macOS/Linux 未做桌面运行验收。

## 本轮验证与如何复现

```powershell
.venv/Scripts/python.exe -m unittest tests.test_task_launch tests.test_mcp
npm --prefix desktop run lint
npm --prefix desktop run build
npm --prefix desktop run smoke
```

相关 Python 测试 7 项通过；类型检查与生产构建通过。Electron smoke 用真实窗口、真实 MCP、临时 Git 仓库：通过界面创建 worktree、读取修改与新增文件、确认源文件不变、检查 960 像素窗口无横向溢出、关闭重开恢复任务。它不启动真实模型，截图和 JSON 结果保存在忽略于 Git 的 `.agent-review-loop/desktop-smoke-*`。测试仓库保留供检查，不混入实际任务数据库。

## 复用来源

- Electron-vite 官方 React/TypeScript 模板，由 `@quick-start/create-electron@1.0.31` 生成；沿用构建配置和 TypeScript 工程，替换示例页面及不需要的更新服务配置。
- `@modelcontextprotocol/client@2.4.0`：官方 TypeScript MCP 客户端及 stdio transport。
- `@pierre/diffs@1.6.1`：补丁解析、文件差异与语法高亮；无需自己写 diff 算法和代码渲染器。
- `lucide-react@1.61.0`：统一图标。保留依赖中的许可与归属，版本由 package-lock.json 锁定。
- 产品布局参考 Emdash、Jean、Vibe Kanban 的任务、工作目录、差异和审查关联；没有整体复制它们的业务后端。具体源码分析见 `docs/research/2026-10-25-desktop-product-reuse.md`。
- 项目内 Hashimoto 与 Willison 蒸馏 Skills 用于工程方法参考，落实为可运行增量、真实证据与可解释调用链；不代表本人参与或背书。
