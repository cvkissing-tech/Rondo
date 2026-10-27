# 从源码接入变成可操作的Agent设置

这轮目标是让别人安装Rondo后，能在界面中接入自己的工具。现有任务分工和acpx runtime保留；新增设置工作区，把管理动作从需求表单分离。当前仍是源码运行版，不把设置界面完成当成独立安装包完成。

## 实际借用了什么

| 项目与固定版本 | 实际使用 | 保留的边界 |
|---|---|---|
| [AionUi](https://github.com/iOfficeAI/AionUi/tree/11cd2a9a20d1e033157636efc570b41384c66d85/packages/desktop/src/renderer/pages/settings/AgentSettings) | AgentCard行结构、agentFilters可用性辅助函数、LocalAgents的搜索/筛选/自定义编辑/刷新流程，InlineAgentEditor的程序与参数分开配置 | 适配到AgentInfo、Jean主题和Rondo IPC；未复制其认证、Assistant、头像和Arco运行时 |
| [Goose](https://github.com/block/goose/blob/2c6812a358db1b11953b9fafc05c6126eb818788/ui/desktop/src/components/settings/providers/AcpReadinessPanel.tsx) | 接入状态、检测动作、诊断信息布局与条件分支 | 不沿用账号连接成功的文案，不在挂载时自动启动Agent |
| [Zed](https://zed.dev/docs/ai/external-agents) | 核对“外部Agent拥有运行时、账号、模型与配置”的接入边界，比较设置与任务选择分离的路径 | 仅为产品/协议参考，没有复制Rust代码 |
| acpx 0.21.0（既有依赖） | 新增使用doctor/probe，而非重新实现协议握手 | 初始化不创建session或prompt；关闭文件和终端回调，超时由已有ProcessTree结束整个子树 |

两个新vendor目录均有LICENSE、NOTICE和原始文件SHA256。复用是有来源的适配，不等于把上游整个产品放进Rondo。

## 页面为什么这样分配

沿用现有任务侧栏，顶部与侧栏都可进入Agent设置。管理区内部列表272px（窄窗口220px），详情使用剩余宽度；列表与详情各自滚动。“添加自定义Agent”固定在列表底部，长列表不会把它推走。搜索与安装筛选只作用于Agent目录，不影响任务列表。

编辑是详情区的原位表单，不再加一层弹窗。新任务只保留三个角色选择和“管理Agent”入口。返回时App持有的任务草稿保留；角色标识随任务保存。长路径和诊断可以换行；切换条目或编辑模式回到详情顶部，避免看见上一条的滚动位置。最低960px窗口与浅深主题均在桌面捕获。

## 关键调用链

`AgentSettings → preload → main/agentSettings.ts`只管理本机配置。保存参数结构为：

```ts
{ id: 'my-agent', argv: [program, ...args], revision: config.revision }
```

没有拼接shell命令，也不使用空格分词解析Windows路径。程序浏览调用Electron原生文件选择器。配置编辑不放进MCP工具，Agent不能通过新增工具更改自己的启动配置。

主进程重读原文件并对比SHA256版本，再以唯一临时文件写入并替换；保留未知顶层字段，损坏文件停止覆盖。这个低频、单主进程的配置写入不同于旧会话高频JSON投影；Node读者支持替换共享。版本检查能发现读取后、提交前已发生的外部修改，不承诺与不合作的外部编辑器实现跨进程事务锁。

协议检查通过`check_agent_connection`调用。ACP直接使用官方运行时：

```js
const runtime = createAcpRuntime({ agentRegistry, probeAgent: id, fs: false, terminal: false, /* cwd and deny fallback */ })
try { emit(await runtime.doctor()) }
finally { await runtime.shutdown() }
```

仅启动已检测存在的程序。ACP的宿主文件与终端回调禁用；没有session/new、session/prompt或自动登录。自定义Agent的进程仍是用户信任的本地程序，不是OS沙箱。Codex只initialize App Server；WorkBuddy复用既有本机通道检查和启动操作。

## 成功与失败各表示什么

- 已找到程序：被动安装检测，不表示登录或模型可用。
- 协议检查通过：初始化可通信，不表示账号、额度、Skills或所有商业能力验收。
- 失败/超时：显示真实诊断；不自动下载、不改用另一个Agent、不重发任务。
- 移除配置：移除argv映射，不卸载程序、不删除账号和任务；依赖该标识的后续运行可能需要先恢复配置。

## 验收与学习

`tests/test_agent_check.py`以真实acpx和标准JSON-RPC fixture检查：只收到initialize，文件/终端能力为false，错误协议失败。fixture无模型、账号、网络。Codex路径测试只初始化传输，不调用生成。

`desktop/scripts/agent-settings-check.mjs`覆盖带空格路径与字面参数、空参数、版本冲突、标识/控制字符校验、未知字段保留、删除和损坏配置保护。`agent-settings-smoke.mjs`在隔离配置/数据库中操作文件浏览、保存、真实握手、外部修改冲突、草稿返回、三角色选择、重启和移除，不运行用户开发任务。

阅读顺序：先看AgentSettings.tsx的save与check，再看preload和主进程边界；随后看agentSettings.ts的版本检查，最后看agents.py与runtime.mjs中如何复用现有协议和进程树。界面文案必须对应这些真实证据。

本轮本机结果：124项Python测试通过（222.5秒）；配置持久化断言与20项任务状态断言通过，typecheck/build/lint通过。零模型桌面证据在`.agent-review-loop/agent-settings-ui-5iBYDc/result.json`；九张捕获在`.impeccable/review/agent-settings/`，覆盖桌面、960px、深色、编辑、握手、外部修改冲突、搜索空态和角色返回。检查日志只出现initialize请求。该证据不扩展为所有商业Agent、认证方式、跨平台安装包或实际模型开发任务的验收。


独立界面审查最初指出冲突恢复不可操作；现增加“保留输入，读取最新配置”，只更新读取版本并保留标识/程序/参数，再由用户显式保存。复核对该项评分resolved，disposition为ship；这是列出修复的复核范围，不扩大为商业Agent认证验收。本机真实Codex的App Server initialize握手也已通过，账号仍标注not_checked；未调用生成。本轮原有桌面任务/差异/重启回归在`.agent-review-loop/desktop-smoke-MSYSUq`通过。
