# Rondo

带着自己的 Agent 完成规划、编码和审查的本地工作台。

**0.15.0 · 源码运行版 · Windows 桌面已验证。** Rondo 组织任务、工作区、Agent 分工、提交、代码快照和审查记录；模型与账号由用户自己的 Agent 提供。

## 技术栈

| 层级 | 技术 | 用途 |
|---|---|---|
| 桌面应用 | Electron、Node.js | 管理本地窗口、文件访问、进程启动与系统入口 |
| 用户界面 | React 19、TypeScript、Tailwind CSS 4 | 构建任务会话、模型选择、代码面板和浅深主题 |
| 本地后端 | Python 3.11+ | 管理任务状态、Agent 调度、检查、审查与返修 |
| 数据存储 | SQLite、WAL | 持久化任务及作业状态，保存执行过程与会话投影 |
| 应用通信 | Electron IPC、MCP over stdio | 连接桌面界面、主进程与 Python 任务服务 |
| Agent 接入 | Codex App Server、ACP、WorkBuddy 本地会话接口 | 调用用户已安装的 Agent，管理会话、模型与权限请求 |
| 工作区与审查 | Git worktree、代码快照、SHA-256 | 隔离任务改动，固定审查版本，检测计划和审查是否过期 |
| 构建与验证 | Vite、electron-vite、ESLint、Python unittest、Playwright、GitHub Actions | 构建桌面端，检查代码及协议行为，验证界面流程 |

界面通过 Electron IPC 调用主进程，主进程通过 MCP 启动并连接本地 Python 服务；服务负责调度 Agent、保存 SQLite 记录，以及准备 Git 工作区和审查快照。模型推理由用户自己的 Agent 完成，Rondo 负责组织流程与展示结果。

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

侧栏和顶部的 **Agent设置** 提供本机检测、搜索筛选、自定义程序添加/编辑/移除和协议握手检查。选择程序后逐项填写参数即可，无需手改JSON；账号、模型和Skills由Agent自身管理。协议检查不创建开发会话或调用模型，也不冒充账号认证。

| 接入 | 角色 | 当前范围 |
|---|---|---|
| Codex App Server | 规划、执行、审查 | 沿用本机 CLI 配置、账号、Skills、MCP与默认模型；保存具名会话 |
| ACP 兼容 Agent | 规划、执行、审查 | 可连接 Claude Code、Gemini CLI、Copilot、OpenCode、Qwen、Kimi 等兼容实现及自定义 ACP 程序 |
| WorkBuddy native | 执行 | Windows WorkBuddy 实验适配，已在 5.9.3 验证会话与短消息；需单独配置本地通道与 MCP 信任 |

不要求每个用户都安装 WorkBuddy；三个角色都使用 ACP 时也不要求安装 Codex。安装检测不会调用模型或自动下载 Agent，**已安装不等于已登录或已验证所有能力**。具体模型、Skills与MCP由各Agent自身决定；纯GUI且没有可调用接口的产品不能仅靠填一个名字接入。

安装、账号前提、自定义argv、权限行为及支持范围见 [Agent接入指南](docs/AGENTS.md)。

## 工作流程

1. 选择已有项目或新项目的保存位置，填写需求和验收条件。
2. Rondo准备独立Git工作区；这一步不调用模型。
3. 生成计划后，可以在底部继续提问或纠正方案；提问只解释，修改要求产生新版本。右侧查看完整计划及历史版本。
4. 点击“采用 Vn，交给所选 Agent 执行”，将界面上的当前计划固定交接；执行完成后自动检查并交给所选审查Agent。
5. 首次审查要求修改时，最多自动返修一次并复查。失败、取消、过期或无进展会停止，刷新和恢复不会重放付费调用。

任务状态显示在对话区底部。计划就绪后，在底部选择执行和审查模型并采用计划；宽屏保留一处交接入口，窄屏打开完整计划时在计划面板底部操作。后续检查、审查和至多一次返修自动接续，无须逐阶段点击。手动交回返修时可重新选择执行模型，已启动的回合保持原选择。

规划阶段显示计划讨论输入框；执行或审查阶段可按需展开，草稿与对话可在重启后恢复。每条发送使用规划 Agent 的账号额度，已取消旧的两次规划上限。Codex 优先恢复自己的原生会话，原会话被另一客户端占用时，使用已保存上下文新建会话并明确标示；此切换发生在模型回合启动之前。ACP 当前通过已保存上下文创建新轮次，不冒充原生会话恢复。执行或审查期间可编辑草稿，暂不支持直接向运行中的任意 Agent 插话。

规划对话输入框可为当前消息选择规划 Agent 提供的模型；Codex 还可选择该模型支持的思考强度。此选择随消息保存，不更改 Agent 默认配置、执行或审查模型。未选择时沿用 Agent 设置。当前首次规划、执行和审查的默认模型按 Agent 配置，同一个 Agent 用在多个角色时共享其默认模型；尚无按角色分别保存默认模型的入口。

工作台可读文件与源码、查看差异和完整报告；静态HTML可通过本机HTTP预览，包括相对ES module。原生快捷入口只在已有对应记录时开放；ACP原生GUI入口尚未统一，运行记录保存在Rondo中。

在“Agent 设置”中选择已安装的 Agent，可从其实际提供的列表选择模型并保存。Codex 另提供该模型支持的思考强度；WorkBuddy 和自定义 ACP Agent 同样支持模型选择。ACP 未提供模型列表时会明确提示在原客户端配置，不虚构可用选项。读取 ACP 模型可能建立一次不发送提示词的临时原生会话。选择保存在 Rondo 配置中，不改原客户端的全局设置；开始执行时固定模型，自动返修沿用原选择。生成前核对所选模型，拒绝不可用或读回不一致的配置，不自动换模型。

“打开原生会话”始终打开对应 Agent 的已保存会话，运行中也可主动打开；它不会取消或重新派发任务。Codex 回合由 Rondo 使用时，原生端可能提示占用并暂时不能输入，回合结束后 Rondo 会释放自己的订阅。新的 WorkBuddy 任务使用其原生会话管理接口，后台进度更新不自动切换到原生窗口；旧任务的状态可能仍与原生历史不同步。工具权限请求直接在 Rondo 展示命令和原生选项，答复后继续同一回合；其余暂未支持的原生输入才请求激活原生窗口。

采用计划时可分别选择本次执行和审查模型；返修沿用执行选择，自动复查沿用审查选择。独立发起审查时也可选择模型。Agent 未提供模型列表时沿用已保存配置，界面说明原因。任务记录按作业顺序显示执行、审查、返修和复查的状态及已保存的停止原因；失败的返修不会被标为通过。

默认只针对一个可信本地用户。各Agent使用各自账号额度；计划、执行、检查与审查是不同事实。未配置独立检查时明确显示 `not_run`，执行者自报测试不能替代检查证据。

## 开发与验证

先激活 setup 创建的虚拟环境：Windows PowerShell 使用 `.\.venv\Scripts\Activate.ps1`；macOS/Linux 使用 `source .venv/bin/activate`。然后运行：

```sh
python -m unittest discover -s tests -v
npm --prefix desktop run lint
npm --prefix desktop run build
node --experimental-strip-types desktop/scripts/flow-check.mjs
node --experimental-strip-types desktop/scripts/agent-settings-check.mjs
node desktop/scripts/planning-dialog-smoke.mjs
```

默认测试和GitHub工作流不调用商业模型。安装desktop依赖后，ACP协议fixture可以验证真实acpx运行时、权限答复、文件回调及三角色闭环；它不是商业Agent账号验收。桌面smoke在隔离数据库、隐藏窗口运行。

0.15修复了Windows下反复替换session.json导致原生回合中断的问题，实时投影改用SQLite WAL；缓存故障不再当成模型失败。差异标签现在真实触发读取，并提供失败重试。

## 参与贡献

欢迎提交问题反馈、Agent 接入适配和交互改进。连接新的 ACP Agent 通常只需配置本机启动程序与参数。新增协议适配时，请提供无需账号、无需调用模型的测试样例，并说明支持的系统与版本。

项目原创代码采用 [MIT 许可证](LICENSE)，第三方组件遵循各自目录中的许可证与版权声明。

学习实现可从[会话工作台与原生环境](docs/learning/17-native-session-workspace.md)、[稳定状态与可选择Agent](docs/learning/18-agent-providers-stability.md)入手。更早的课程保留阶段性实现，当前行为以本README、PRODUCT.md与源码为准。
