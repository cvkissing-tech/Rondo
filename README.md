# Rondo

带着自己的 Agent 完成规划、编码和审查的本地工作台。

**0.15.0 · 源码运行版 · Windows 桌面已验证。** Rondo 组织任务、工作区、Agent 分工、提交、代码快照和审查记录；模型与账号由用户自己的 Agent 提供。

## 开始使用

需要 **Node.js 22.13+、Python 3.11+、Git**，以及至少一个自己已安装并登录的兼容 Agent。获取源码后，在仓库根目录运行：

```sh
npm run setup
npm start
```

`setup` 在仓库内创建 Python 虚拟环境、安装锁定的依赖并构建 Electron 桌面端，不调用模型、不安装或登录其他 Agent。后续可以用 `npm run check:setup` 检查本地运行前提。Windows 也可在完成 setup 后使用 `Start-Desktop.cmd`。

当前提供源码运行方式。现有 electron-builder 配置尚未将 Python 后端打包，输出不能当作完整独立安装包发布。

## 选择自己的 Agent

创建任务时，分别选择 **规划、执行、审查** Agent，组合随任务保存。

| 接入 | 角色 | 当前范围 |
|---|---|---|
| Codex App Server | 规划、执行、审查 | 沿用本机 CLI 配置、账号、Skills、MCP与默认模型；保存具名会话 |
| acpx / ACP | 规划、执行、审查 | 复用官方运行时和适配器目录；可接Claude Code、Gemini CLI、Copilot、OpenCode、Qwen、Kimi等兼容实现及自定义ACP程序 |
| WorkBuddy native | 执行 | Windows WorkBuddy5.9.2实验适配，需单独配置本地通道与MCP信任 |

不要求每个用户都安装 WorkBuddy；三个角色都使用 ACP 时也不要求安装 Codex。安装检测不会调用模型或自动下载 Agent，**已安装不等于已登录或已验证所有能力**。具体模型、Skills与MCP由各Agent自身决定；纯GUI且没有可调用接口的产品不能仅靠填一个名字接入。

安装、账号前提、自定义argv、权限行为及支持范围见 [Agent接入指南](docs/AGENTS.md)。

## 工作流程

1. 选择已有项目或新项目的保存位置，填写需求和验收条件。
2. Rondo准备独立Git工作区；这一步不调用模型。
3. 显式生成计划，再交给所选执行Agent实施；执行完成后自动检查并交给所选审查Agent。
4. 首次审查要求修改时，最多自动返修一次并复查。失败、取消、过期或无进展会停止，刷新和恢复不会重放付费调用。

工作台可读文件与源码、查看差异和完整报告；静态HTML可通过本机HTTP预览，包括相对ES module。原生快捷入口只在已有对应记录时开放；ACP原生GUI入口尚未统一，运行记录保存在Rondo中。

默认只针对一个可信本地用户。各Agent使用各自账号额度；计划、执行、检查与审查是不同事实。未配置独立检查时明确显示 `not_run`，执行者自报测试不能替代检查证据。

## 开发与验证

先激活 setup 创建的虚拟环境：Windows PowerShell 使用 `.\.venv\Scripts\Activate.ps1`；macOS/Linux 使用 `source .venv/bin/activate`。然后运行：

```sh
python -m unittest discover -s tests -v
npm --prefix desktop run lint
npm --prefix desktop run build
node --experimental-strip-types desktop/scripts/flow-check.mjs
```

默认测试和GitHub工作流不调用商业模型。安装desktop依赖后，ACP协议fixture可以验证真实acpx运行时、权限答复、文件回调及三角色闭环；它不是商业Agent账号验收。桌面smoke在隔离数据库、隐藏窗口运行。

0.15修复了Windows下反复替换session.json导致原生回合中断的问题，实时投影改用SQLite WAL；缓存故障不再当成模型失败。差异标签现在真实触发读取，并提供失败重试。

## 复用与贡献

- [acpx](https://github.com/openclaw/acpx)：固定0.21.0运行时、Agent registry、ACP会话、权限与文件/终端协议。具体边界见[integrations/acp/NOTICE.md](integrations/acp/NOTICE.md)。
- [ACP Registry](https://github.com/agentclientprotocol/registry)：兼容实现的参考索引，不作为静默下载或自动执行源。
- Jean、T3 Code、Vibe Kanban、Codex输入容器、Pierre Diffs：工作台结构及界面模块；各vendor目录保留来源、固定版本、哈希与必要适配。

新ACP Agent通常只需配置本机argv，不必修改Rondo源码。新增专有协议适配时，请提供无账号、无模型的协议fixture，并区分安装检测、真实执行与平台兼容证据。保留各组件许可证与NOTICE；项目许可证见 [LICENSE](LICENSE)。

学习实现可从[会话工作台与原生环境](docs/learning/17-native-session-workspace.md)、[稳定状态与可选择Agent](docs/learning/18-agent-providers-stability.md)入手。更早的课程保留阶段性实现，当前行为以本README、PRODUCT.md与源码为准。
