# 第 3 课：先证明程序能自动调用 Agent

用户只发起一次任务，程序随后完成“执行 → 收集结果 → 审查 → 展示意见”；用户选择意见后再发起有限修复。MCP 任务数据库保存状态，运行层负责真正启动和调用 Agent，两者作用不同。

本轮先验证运行层候选 acpx，不新增桌面界面，也不请求真实模型。复用其 ACP 客户端、命名会话、后台队列、取消和 JSON 输出；不自行实现完整 ACP 协议。模拟 Agent 通过它依赖的官方 ACP SDK 提供固定响应，不具备代码理解或审查能力。

## 本机实测

2026-10-25，Windows、Node 24.15.0、acpx 0.21.0；模型调用 0 次。安装限定在项目忽略目录，未修改全局客户端配置。

| 验收项 | 结果 | 实际证据 |
| --- | --- | --- |
| 自动交接 | 通过 | Python 自动发给 executor，再把完整产物发给 reviewer，逐字段相等 |
| 工作目录与参数 | 通过 | 带中文和空格的 cwd 一致，`& $()` 等字符保持原文 |
| 会话续接 | 通过 | 等待短 TTL 后重新调用，出现 session/load，provider session ID 不变，计数 1→2 |
| 取消后继续 | 通过 | sleep 实际开始后才发送取消；返回 cancelled；再执行计数 2→3，会话 ID 不变 |
| 崩溃识别 | 通过 | 有部分文本输出后模拟器退出；acpx 非零退出，并返回 AGENT_DISCONNECTED，没有 end_turn |
| 关闭会话 | **未通过** | reviewer 正常关闭；executor 报 QUEUE_OWNER_IDENTITY_UNVERIFIED，总探针退出 1 |
| 现有服务回归 | 通过 | 原有 19 项 unittest 全部通过，6.155 秒 |

探针没有因为前四组成功就输出总体通过。第二次完整运行证据位于本机 `.agent-review-loop/runtime-probes/f1ace04c081d44c6b74d41939f0a29a2/`，含 summary.json、各命令 stdout/stderr 与模拟器审计事件；原始运行目录不加入 Git。失败后另用系统进程查询检查，没有观察到 acpx 或本实验模拟 Agent 的 Node 残留进程；这不证明关闭命令本身成功。

关闭错误原文中的稳定错误码：

```json
{"acpxCode":"RUNTIME","detailCode":"QUEUE_OWNER_IDENTITY_UNVERIFIED","origin":"queue","retryable":true}
```

安装版源码 `dist/ipc-D2BC99hf.js` 使用 PowerShell/CIM 获取 Windows 进程创建身份，无法验证时保留队列租约并拒绝退休。当前证据只定位到这个拒绝分支，**尚未证明是超时、身份采集、关闭竞争还是其他原因**。不要删除安全检查或强杀猜测中的 PID 来制造成功；下一步应提取最小复现，修复或改选运行方式。源码和测试方向参考 [acpx](https://github.com/openclaw/acpx/tree/36b4253eb6a1a829d602375cd0087a56c0b782f5)。

## 重要代码与含义

`examples/runtime_probe.py` 使用参数数组调用 acpx，`subprocess` 默认不启用 shell。自定义 Agent 也明确配置 argv，不把命令和参数拼成字符串：

```python
agents = {f'mock_{role}': {'argv': [node, fixture, install, state, role]}
          for role in ('executor', 'reviewer')}
```

这段为讲解缩写，实际可运行代码在脚本内。它可以减少 Windows 引号与中文路径问题，但不能据此推断真实 Agent 继承了原来的 Skills、模型和权限。

自动交接只有两步，暂不引入工作流框架：

```python
first = artifact(prompt('execute', 'executor', {'action': 'echo', 'text': '实现产物 & $() 中文'}))
reviewed = artifact(prompt('review', 'reviewer', {'action': 'review', 'artifact': first}))
assert reviewed['reviewed_artifact'] == first
```

先验证协议成功终态，再读取文本中的合成产物，避免把部分输出误认作完成：

```python
assert any(e.get('result', {}).get('stopReason') == 'end_turn' for e in events)
```

`examples/fixtures/acp_mock.mjs` 的取消处理用 AbortController 打断等待，并返回协议终态 cancelled。计数和会话 ID 来自实验文件，是可验证的模拟持久状态，不能说明真实模型保留了完整对话上下文。

## 如何复现

在项目根目录运行，需 Node >=22.13 和已安装的 Python 项目环境：

```powershell
npm install --prefix .agent-review-loop/acpx --cache .agent-review-loop/npm-cache --ignore-scripts --no-audit --no-fund --save-exact acpx@0.21.0
.venv/Scripts/python.exe -X utf8 -m examples.runtime_probe
```

每次使用新的隔离 HOME、项目目录和状态文件。环境只保留操作系统必需变量，不转发账号令牌；文件与终端能力关闭，权限 deny-all。后台队列 TTL 为 1 秒，模拟进程另有 45 秒退出期限。异常会保留证据并退出 1。本次并未把它加入默认 unittest：它需要单独安装 Node 依赖，而且候选运行器尚有未解决问题。

## 接下来按什么顺序做

1. 缩小 Windows 关闭问题：分别测试正常结束后关闭、取消后关闭、崩溃后关闭，记录队列身份和退出过程。若是开源运行器缺陷，形成可提交的复现与补丁；未证明前保留失败状态。
2. 接真实 Codex 的小任务，验证明确目录、会话关联、真实结束与停止。优先比较现成 ACP 适配与官方 App Server；一次小任务，不循环自动重试。
3. 验证 WorkBuddy 官方本地助理接口能否指定并确认工作目录、关联回复和确认完成。没有这些能力时，不能把“消息发出”包装成完整 Agent 接入；也不能把直连 DeepSeek API 当作 WorkBuddy 环境。
4. 两个真实入口可靠后，把调度结果写入现有 SQLite，固定 Git 修改快照，自动交给独立审查方。首版只做一次执行、一次审查、用户选定后一次修复；随后再决定桌面外壳。

本轮交付是运行层实验与明确边界，尚无真实 Agent 执行、代码审查质量或完整产品验收。
