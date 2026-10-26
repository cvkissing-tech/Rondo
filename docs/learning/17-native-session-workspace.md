# 17. 会话工作台与 Codex 原生环境

本轮把 Rondo 的任务摘要页改成会话工作台，并修正实际 Agent 接入。用户明确允许替换旧布局，要求直接复用多个成熟 Agent 产品的代码、页面结构和交互。

## 页面如何组织

左边为项目任务导航；中间采用 T3 Code ChatView 的标题、滚动消息区与固定底部动作结构；右边为常驻可调整的文件、改动、原生会话面板。需求使用 UserTimelineRow 的消息容器，完整 WorkBuddy 提交默认展开，计划继续使用 Vibe Kanban，代码差异使用 Pierre Diffs。原有72px图标轨移除，避免占用工作宽度。

GitHub连接器本轮返回Transport closed，源码通过Git直接获取，固定T3提交 `210b2e7c6a8be11441b7afc94742ce3c76860111`：

- [ChatView](https://github.com/pingdotgg/t3code/blob/210b2e7c6a8be11441b7afc94742ce3c76860111/apps/web/src/components/ChatView.tsx)：提取会话列、标题、内容和底部容器，替换上游业务store为Rondo props。
- [TimelineUserMessageRow](https://github.com/pingdotgg/t3code/blob/210b2e7c6a8be11441b7afc94742ce3c76860111/apps/web/src/components/chat/TimelineUserMessageRow.tsx)：提取真实用户消息容器，不复制Rondo没有的访客/附件服务。
- [TimelineSystemDivider](https://github.com/pingdotgg/t3code/blob/210b2e7c6a8be11441b7afc94742ce3c76860111/apps/web/src/components/chat/TimelineSystemDivider.tsx)：复制源码，适配import与现有Radix Tooltip。
- RightPanelTabs / PreviewPanelShell：采用标签面板结构，由已有react-resizable-panels和Electron IPC实现本地文件服务；未复制上游浏览器、终端和网络服务。

精确文件SHA-256、来源和适配边界见 `desktop/src/renderer/src/vendor/t3code/workspace-provenance.json`、NOTICE。Jean导航/主题、Vibe计划、REA恢复的Codex输入容器与Pierre差异保留已有来源。这里是实际代码区域提取与业务适配，不能称复制了整个T3应用。

## 为什么之前不是原生环境

旧适配先读取MCP名称，再以 `-c mcp_servers.<name>.enabled=false` 重启服务；thread/start使用ephemeral、read-only、approvalPolicy never及替换baseInstructions；turn/start固定effort low，并拒绝工具事件。用了本机程序与账号，也不能称完整继承本机环境。

当前关键调用位于 `agent_review_loop/codex_review.py`：

```python
with CodexRpc([str(executable), 'app-server', '--stdio'], cwd,
              output / 'stderr.log', on_request=handle_request) as client:
    client.initialize()
    thread = client.request('thread/start', {
        'cwd': str(cwd), 'ephemeral': False,
    })
    client.request('thread/name/set', {
        'threadId': thread['thread']['id'], 'name': session_name,
    })
    # turn/start不覆盖model、effort、sandbox、approvalPolicy或baseInstructions。
```

Python进程及其App Server继承原有环境变量；Electron的MCP子进程也显式继承环境，避免SDK默认白名单丢掉CODEX_HOME或本机配置变量。角色约束作为任务文本追加，原有系统指令和AGENTS仍由原生服务加载。规划与审查在真实任务工作区运行；完成后比较Git tree，发生变化时拒绝保存成功结果。这是事后完整性核对，不是写入前权限沙箱。

固定审查包仍是审查依据。现在只把改动文件清单和有界预览送入初始请求，提示Agent通过原生工具读取包内changes.patch和完整before/after；不再把整个项目两份源码塞进64KiB。预览截断会标明，未改的资产不会浪费提示词。初始请求上限不等于模型上下文或费用上限。

## 原生交互与可恢复记录

`native_session.py`把原生事件投影为最多60条可显示记录，完整events.ndjson仍保留。开始/完成的同一item按ID更新，不把两个事件当作两次调用。session.json以临时文件replace原子更新，界面轮询可以看到工具、输出、原生模型/推理配置、启用Skills数和MCP配置名。

命令审批、文件审批与用户问题进入pending。用户在Rondo选择后，经job+request身份验证写入一次性答复；不自动授权，不提供acceptForSession。取消或过期停止等待。其他动态客户端工具、权限扩展、MCP elicitation尚未实现，会停止并说明；不能据此声称所有Codex桌面专属能力接入。

会话名为“Rondo · 规划/审查 · 任务名称”。新会话持久保存，右侧按钮使用codex://threads/<id>打开；旧临时会话禁用并解释。WorkBuddy入口使用workbuddy://chat/<session-id>。Codex安装清单声明codex协议，发货bootstrap的dN解析器包含threads分支；WorkBuddy发货main-bootstrap的navigateToSession使用同一chat协议。REA对选择的Codex主模块做过部分分析（超时/覆盖限制保留），协议结论另来自固定发货代码片段；不把部分分析宣称完整逆向。

文件列表来自保存的工作区，跳过依赖和符号链接；预览校验realpath仍在工作区内，源码读取限制512KiB，不通过renderer执行任意shell。发现根index.html才出现运行预览，使用系统浏览器打开；Rondo尚未内嵌通用开发服务器/浏览器或自动启动任意构建命令。

## 本轮证据

- 一次真实Codex原生回合：`gpt-6.1-sol / high`、153个启用Skills、4项启用MCP配置；实际读取ponytail并执行Get-Location。持久thread `01a1791c-e1ec-7530-bb78-a675b28043b8`，随后从Codex读回同一thread与命令记录，命名请求单独成功。调用耗时20.524秒；服务报告总tokens61854，费用未知。未再次运行用户游戏开发。
- 该回合证明本机配置、Skill读取、原生命令与会话保存；不证明4个MCP全部在线，不证明桌面专属连接器接入，也不替代大型项目审查质量评估。
- WorkBuddy session:get读回用户任务#3的会话 `8bc9cb41-1ebb-48f5-8f1c-43c58440d94a` 及实际工作区；状态terminated，表示原生回合已结束。游戏文件真实存在。报告中的40/40与29/29是执行方报告；Rondo独立checks为not_run，界面继续如实显示。
- 115项Python测试通过；随后新增的大文件审查回归与本轮相关22项测试通过。构建/typecheck/lint通过。隐藏窗口常规Electron smoke通过，0模型；实际任务SQLite备份的文件、源码、会话标签与路由捕获通过，0模型。系统打开路由在检查中被拦截，不把它声称为所有原生应用窗口的视觉导航验证。
- 本机忽略证据：`.agent-review-loop/native-session-live/`、`desktop-smoke-9to09x/`、`workspace-capture-Cn3beR/`；截图 `.impeccable/review/workspace/`。验收窗口不出现在用户桌面。

阅读代码建议：先从 `WorkspaceInspector.tsx` 看React状态和Electron调用，再顺着preload → main IPC →保存任务上下文 →真实文件，最后读codex_review.py → CodexRpc → native_session.py的请求/事件循环。界面状态来自可读的协议与文件，模型本身不直接控制页面。

最终界面复核 disposition: ship，范围为两项整改：主操作在1360/960下展开、滚动并聚焦相应记录，以及DESIGN.md/sidecar与当前布局一致。该复核不包含原生应用窗口导航或未截图的审批状态。最终常规零模型smoke证据为 `desktop-smoke-kCjams/`。
