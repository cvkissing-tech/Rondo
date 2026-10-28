# Rondo Agent 接入

Rondo 当前提供源码运行版。Node.js 22.13+、Python 3.11+、Git 是本地运行前提；Agent 本身需要自行安装、登录。Rondo 不提供模型账号，也不读取其他桌面应用的私有登录凭据。

## 第一次运行

在仓库根目录执行：

```sh
npm run setup
npm start
```

setup 只在仓库内建立Python虚拟环境、安装固定依赖并构建桌面端，不调用模型、不登录Agent、不修改其他应用。后续用 `npm run check:setup` 检查运行前提。当前应按源码运行；旧electron-builder配置尚未包含Python后端，不要把它的输出当作可独立安装的完整产品。

## 选择分工

创建任务时分别选择规划、执行、审查Agent，组合随任务保存，不随全局设置悄悄改变。已存在任务按创建时的分工继续；历史任务默认Codex / WorkBuddy / Codex。示例：

- Codex / Codex / Codex：使用本机Codex App Server，可读取原有Skills/MCP，持久会话有Codex入口。
- Codex / ACP兼容Agent / Codex：使用另一个Agent实现，Codex规划和审查。
- 三个角色都使用ACP：不要求安装Codex；结构化计划/报告/意见仍由Rondo验证。
- WorkBuddy可作为执行方：当前是Windows WorkBuddy 5.9.2实验适配，需下文的本地通道及MCP设置。

新任务“Agent分工”列出的可用性来自本机命令/适配包检测；“已安装”不表示已登录、所有工具可用或模型尚有额度。Rondo不会在检测时自动下载Agent、创建会话或调用模型。缺少适配器的条目会禁用。

## ACP兼容Agent

直接复用 `acpx@0.21.0` 官方runtime和registry，固定在desktop/package-lock.json。它提供Claude Code、Gemini CLI、Copilot、OpenCode、Qwen、Kimi等配置项；每一项仍需对应的本地CLI/适配器。请按[acpx Agent指南](https://github.com/openclaw/acpx/blob/26849fd33785f85fb1ea8c6a1a189f816bf95d81/docs/agents.md)与各Agent官方说明安装并登录。

官方[ACP注册表](https://github.com/agentclientprotocol/registry)可以寻找更多兼容实现；Rondo不在后台下载或执行注册表中的软件。CLI、适配器、模型与GUI应用是不同层：只有桌面GUI且没有可用程序接口的产品，不能靠添加名称接入。

### 在界面中接入自己的Agent

点击侧栏或顶部的“Agent设置”。左侧搜索名称、按“已找到/未找到”筛选；右侧查看支持角色、缺少的程序和协议检查结果。检测列表不会自动启动Agent；点击“检查协议”才会启动所选程序完成握手，不创建开发会话、不发提示词。协议通过仍不证明已经登录、账号有额度或实际任务必定成功。

添加程序时点击“添加自定义Agent”，填写固定标识、浏览选择程序，并逐项添加启动参数。程序路径中有空格也不需要加引号。保存后回到任务，在三个角色中选择它。已有ACP条目可用“设置程序位置”配置非标准安装位置；自定义条目可编辑或移除。移除不卸载程序或删除账号；绑定该标识的旧任务在重新配置前可能无法继续。

界面直接管理下述本机文件，不需要用户手动编辑JSON。保存有版本冲突检查，发现其他程序修改会停止覆盖；损坏配置不会被空配置替换。账号与密钥仍由Agent自身管理。修改启动配置会影响之后使用该标识发起的运行，已创建任务的角色标识不会改变。

### 配置文件方式（可选）

创建 `~/.rondo/agents.json`（Windows为 `%USERPROFILE%\.rondo\agents.json`）：

```json
{
  "agents": {
    "my-agent": ["C:/absolute/path/my-agent.exe", "acp", "--stdio"]
  }
}
```

macOS/Linux使用相应的本机绝对路径。也可通过 `RONDO_AGENTS_CONFIG` 指向另一个本机配置文件。配置使用程序和参数数组，不拼接shell命令；只配置你明确安装并信任的程序。无需把账号密钥写进此文件。Rondo重开/新建任务后会出现 `my-agent (ACP)`。

ACP会话和工具记录在Rondo保存，只有Agent实际提供原生ID和客户端入口时才可进一步接原生跳转。当前ACP条目不伪造Codex/WorkBuddy链接。模型选择沿用各Agent自己的默认配置；原有Skills、工具与MCP能否加载由对应Agent决定，Rondo不会把Codex的Skills宣称为所有Agent通用。

### 权限与结果

ACP读操作可由runtime处理；Agent显式请求非读权限时，Rondo展示其原始选项并把你的选择返回。点击执行已授权在该任务工作区修改文件、运行相关本地检查，因此执行角色启用ACP文件/终端回调；规划/审查角色不启用写回调。acpx检查回调路径边界，这不是对Agent原生进程的操作系统沙箱。工具权限请求的默认后备策略为deny，不把回调异常当作授权。

执行完成由Rondo用自己持有的任务领取凭证保存报告，不要求每一个Agent都配置Rondo MCP，也不把凭证放进模型提示词。只有真实完成且结构化输出通过校验，才接续检查与审查。未配置独立检查时显示not_run；Agent自报的测试不能替代该证据。

## Codex原生接入

先安装并登录Codex，确保 `codex` 可从PATH找到。Rondo沿用本机账号、配置和环境，由Codex加载Skills、MCP及权限配置；任务级模型和推理强度选择不改原客户端的全局设置。桌面应用独占连接器不等同于CLI能力。每个任务的规划、执行和审查保存独立具名会话。旧版本ephemeral会话不能补回。

## WorkBuddy实验接入

仅支持已核验的Windows5.9.2。需要本机桌面执行通道及agent-review-loop MCP；其他人的电脑不会自动获得你的MCP信任或本地路径。按[integrations/workbuddy/README.md](../integrations/workbuddy/README.md)安装并信任工具。`python -m agent_review_loop config --db <自己的绝对数据库路径>` 会生成自己的配置。Rondo源码运行的默认数据库为仓库内 `.agent-review-loop/workbuddy.sqlite3`。

尚未配置WorkBuddy时，可以直接选择Codex或已安装的ACP Agent作为执行方。Rondo不会要求每位用户都安装WorkBuddy。

## 已验证范围

本机真实Codex原生Skill/命令与持久会话已有验收；WorkBuddy5.9.2执行/返修已有验收。新增ACP层已通过真实acpx runtime、标准JSON-RPC、人工权限答复、ACP文件回调及三个角色的无模型闭环。不同商业Agent账号、平台、原生GUI入口并未逐一验收。错误、取消、无效JSON或权限拒绝均保留记录，不自动重试或替换成另一个模型。

静态HTML预览使用仅绑定127.0.0.1的本机HTTP服务，支持相对路径ES module；不自动执行package.json脚本或启动任意项目服务器。Vite等需要构建/开发服务器的项目，请按项目说明运行对应命令。关闭Rondo时关闭其预览服务。
