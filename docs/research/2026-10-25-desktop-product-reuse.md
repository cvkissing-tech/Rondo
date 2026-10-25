# 独立桌面产品：开源复用与开发路线

2026-10-25。已读取下列官方仓库README、包配置和所列源码，未安装运行这些桌面产品。保留现有Python核心；产品入口确定为我们自己的本地桌面应用。

## 候选

| 项目 | 本轮确认 | 用于本项目 |
| --- | --- | --- |
| [Emdash](https://github.com/generalaction/emdash) | README提供Windows安装包；Electron应用；项目、worktree、Agent与差异审查。根工程为Nx/pnpm monorepo，桌面依赖多个workspace包 | 主要产品和接入结构参考；源码模块按依赖边界复用，不整仓替换现有核心 |
| [AionUi](https://github.com/iOfficeAI/AionUi) | readme.md列跨平台、多Agent；package.json有Electron与Windows构建。包含内置Agent、办公、定时与远程功能 | 参考对话、接入设置和Agent状态呈现；首版不接入其完整办公/内置Agent系统 |
| [Jean](https://github.com/coollabsio/jean) | Tauri/React/Rust，worktree与差异审查；README明确Windows尚未充分测试；package.json采用@pierre/diffs | 借鉴差异与任务交互，直接采用独立差异组件；首版不增加整套Rust后端 |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) | 任务、工作区、行内审查反馈；README标示sunsetting，官方公告转社区维护 | 参考返修交互；不以原公司的云服务作为依赖 |

## 明确选择

使用electron-vite官方React/TypeScript桌面模板，组装聚焦开发协作的独立产品；Emdash作为主要产品参考，优先采用已有可独立使用的组件。保留现有Python任务、快照、检查和审查核心，不移植另一套完整任务数据库与后端。

这不是只借鉴截图再重写底层：桌面生命周期、构建与打包采用现成模板；差异显示采用@pierre/diffs等现成库；协议连接采用官方MCP客户端；Git工作目录、SQLite及Codex适配使用现有实现。第一版不加入终端模拟器，确有交互式终端需求时再采用xterm.js。

Emdash的packages/chat-ui是private包，使用Solid并依赖@emdash/core和shared，不能当作独立React聊天控件直接复制。packages/ui虽然有公开导出，也需核对具体组件依赖。完整fork有较高初始复用率，但同时引入Nx、多包原生依赖、另一套任务/Agent系统；当前单条工作流不需要承担全部维护面。

## 应用结构

```text
我们的桌面窗口（React）
    → Electron主进程：目录选择、受限IPC、官方MCP客户端
    → 本地Python服务：唯一任务与流程状态
        → Codex：需求拆解、计划、结果审查
        → WorkBuddy适配：下发实现/返修，收集完成回执
        → Git工作目录、检查、版本及审查证据
```

窗口不直接启动任意命令或持有Agent账号密钥。主进程通过stdio调用既有本地MCP，不为首版额外增加对外HTTP服务。MCP和桌面端共用同一核心，避免两套任务真相。

## 开发顺序与交付

1. **可打开的任务工作台。** 选择项目、输入需求、配置角色，接入真实任务创建/恢复与目录；任务列表、过程、代码改动/意见在同一窗口可见。不能执行的阶段显示实际连接状态，不用模拟进度冒充。
2. **Codex规划与WorkBuddy派发。** 增加一条run_task流程入口：Codex给结构化计划；程序调用WorkBuddy执行；完成回执使用既有任务契约关联。用户不手工复制任务编号或提示。对接期间保留已可用的桌面任务功能。
3. **闭合审查和一次返修。** 执行完自动检查、固定代码交给Codex；有需修复的问题时回派WorkBuddy一轮。界面展示改动、审查与最终状态。失败/限额停止，不无限互评。

第一次完整交付目标：用户在我们的产品输入一项需求，产品展示Codex计划、WorkBuddy执行、Codex意见和一次返修结果。不是只打开两个Agent窗口，也不是要求用户切到WorkBuddy发起。

## WorkBuddy单独处理

Emdash的CodeBuddy插件实际启动@tencent-ai/codebuddy-code、codebuddy/cbc和--acp，不能代表WorkBuddy桌面接入。直接调用DeepSeek API也不能冒充沿用WorkBuddy环境。

WorkBuddy官方本地助理API提供发消息与读历史，需要开发者应用及OAuth授权。当前用户没有第三方应用，真实执行接入尚未完成；桌面组件复用不会消除这一条件。接入目标是任务关联、明确工作目录、完成回执及返修；不能仅凭发送消息成功宣布执行完成。客户端不内置公开共享的clientSecret。

## 已读源码与官方材料

- [Emdash README](https://github.com/generalaction/emdash/blob/main/README.md)、[根package.json](https://github.com/generalaction/emdash/blob/main/package.json)、[桌面package.json](https://github.com/generalaction/emdash/blob/main/apps/emdash-desktop/package.json)。
- [Emdash CodeBuddy实际入口](https://github.com/generalaction/emdash/blob/main/packages/plugins/src/agents/impl/codebuddy/index.ts)、[chat-ui包边界](https://github.com/generalaction/emdash/blob/main/packages/chat-ui/package.json)、[UI导出](https://github.com/generalaction/emdash/blob/main/packages/ui/package.json)。
- [AionUi readme](https://github.com/iOfficeAI/AionUi/blob/main/readme.md)、[package.json](https://github.com/iOfficeAI/AionUi/blob/main/package.json)。
- [Jean README](https://github.com/coollabsio/jean/blob/main/README.md)、[package.json](https://github.com/coollabsio/jean/blob/main/package.json)。
- [Vibe Kanban README](https://github.com/BloopAI/vibe-kanban/blob/main/README.md)、[官方维护状态公告](https://www.vibekanban.com/blog/shutdown)。
- [electron-vite官方模板](https://electron-vite.org/guide/)、[WorkBuddy官方Open API](https://open.workbuddy.cn/docs/openapi)。

本轮读取文件的blob身份：Emdash README=734a8dccc162c00df4f81778584e0d953323b3c2，desktop package=fa0a9ac36b279b2c5ab3cfbc69cbdcc106976334，CodeBuddy入口=969c7f4c241e663c335645899a232da6fce1f7e6；AionUi readme=93dc3b64ef25dd943eed76be7819051f1995479c；Jean README=d0fb7b65366114fd184c8eba16d93c30c9343167；Vibe Kanban README=32c6ed4ccd4649a9c78058a694dbbc1297c421a8。这里是文件blob SHA，不冒充完整工程提交；实际移植前固定完整提交。
