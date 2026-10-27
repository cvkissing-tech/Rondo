# 18. 修复状态保存，并让用户选择自己的Agent

## 这次失败发生在哪里

用户任务#4已成功启动Codex，并读取原有Skills。旧代码每收到一条事件（包括大量outputDelta）就写session.tmp并replace为session.json。Windows上另一个进程正短暂读取目标文件时，会拒绝替换。这个显示缓存异常又被当成回合异常，引发interrupt/关闭进程，导致没有最终计划。此前还把异常退出一概标成cleanup未确认，错误分类也不准确。

原生会话读回确认该回合interrupted，不能从不存在的最终输出“恢复计划”。0.15修复后显式重新生成一次，任务#4的新计划成功保存且freshness=current；原失败尝试仍保留，没有删记录或重置额度。

## 状态不再依赖文件替换

`native_session.py`复用标准库SQLite，单次作业的实时投影存入session.sqlite3，以WAL支持并发读取：

```python
with closing(sqlite3.connect(path, timeout=3)) as db, db:
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('CREATE TABLE IF NOT EXISTS session (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)')
    db.execute('INSERT INTO session VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload', (payload,))
```

任务DB拥有状态迁移；原始事件日志保留协议证据；实时投影只是界面缓存。普通缓存写入失败只记录projection_error，不中断模型；未知/损坏缓存读取不覆盖主任务结果。只有需要用户答复的权限请求必须先可显示，不能伪造授权继续。仅相关item事件更新投影，outputDelta不再导致无意义的反复写入。

`CodexRpc.cleanup_verified`在自身进程树和I/O线程确实退出后才设为true，区分业务错误和退出确认。保留旧JSON投影的只读兼容，不覆盖历史记录。

## 角色绑定与协议复用

TaskLauncher保存 `agents={planner,executor,reviewer}` 到已有context_json，无需数据库schema迁移。未带字段的旧任务默认Codex/WorkBuddy/Codex。绑定属于任务；同一请求的指纹包含选择，不能悄悄换Agent。ReviewJobs/PlanJobs/ExecutionJobs按相应角色选择后端和程序，缺少依赖时在发起模型前停止。

Codex继续复用原生App Server，并新增作为执行方的路径。其他Agent采用[openclaw/acpx](https://github.com/openclaw/acpx)已发布0.21.0包；官方[Agent说明](https://github.com/openclaw/acpx/blob/26849fd33785f85fb1ea8c6a1a189f816bf95d81/docs/agents.md)、[权限说明](https://github.com/openclaw/acpx/blob/26849fd33785f85fb1ea8c6a1a189f816bf95d81/docs/permissions.md)与[ACP Registry](https://github.com/agentclientprotocol/registry)用于核对范围。Rondo不实现第二套ACP客户端。

`integrations/acp/runtime.mjs`只适配Rondo的JSONL边界，关键调用为：

```js
const runtime = createAcpRuntime({ cwd, sessionStore, agentRegistry, /* host policies */ })
const handle = await runtime.ensureSession({ sessionKey, agent, mode: 'persistent', cwd })
const turn = runtime.startTurn({ handle, text, mode: 'prompt', requestId })
await turn.promptStarted
for await (const event of turn.events) emit(event)
const result = await turn.result
```

createAgentRegistry、installed inspect、会话保存、启动、ACP框架、文件/终端回调和原生认证均来自acpx。Python的acp.py保留有界日志、转交权限请求、等待真实result、解析结构化结果，并交给原有save_plan/save_review校验；不把乱码或自然语言输出自动当成功。

执行角色的领取/提交由Rondo持有凭证，不要求每一个Agent都安装Rondo MCP，也不把claim_token放到模型提示词。执行回合成功后再保存真实报告并接续固定快照审查。WorkBuddy原有MCP提交路径保留兼容。

## 权限和兼容范围

安装检测是只读的；不登录、不创建Agent会话、不下载适配器。自定义程序来自用户自己的结构化argv配置。ACP显式工具权限按原始选项交给用户；未答复、未知选项、取消和错误不会变成默许。执行任务授权工作区内文件/终端回调，规划/审查不启用写回调；这是客户端能力与路径边界，不是对Agent原生进程的OS沙箱。

原有模型/Skills/MCP由各Agent自身决定，不是Rondo把Codex环境复制给所有Agent。没有统一原生GUI路由的ACP后端只显示Rondo记录，不伪造Codex链接。纯GUI产品仍需要单独适配，不能宣称支持任意应用。

## 界面和分发

新任务增加独立规划/执行/审查选择，角色名称进入标题、计划、执行和审查动作；旧任务兼容默认角色。差异标签之前只刷新元数据，未加载patch，现改为实际读取并提供错误重试。达到规划上限时原生禁用重新生成按钮。

静态HTML改为127.0.0.1 HTTP预览，解决ES module的file://限制。使用Node标准库、随机路径前缀、真实路径边界、隐藏目录过滤及明确MIME；不执行项目脚本，不替代Vite构建或任意开发服务器。关闭Rondo时关闭其服务。

根目录npm run setup检测Node/Git/Python，在仓库内建虚拟环境并安装锁定依赖、构建桌面；npm start启动。Agent账号和本机安装由用户自己提供。当前没有将Python后端放进独立安装包，且本仓库尚无Git远端，没有自动发布或上传私人配置。

## 证据和学习路线

- 全量120项Python测试通过；之后增加的损坏投影回归等13项相关测试通过。
- ACP fixture真实经过acpx runtime、JSON-RPC、拒绝未知权限选项、人工答复、文件回调和三角色自动审查。fixture明确没有模型、网络或商业认证。
- 零模型Electron检查覆盖三种角色选择/保存、动态名称、差异标签、960px与深色；实际任务#4备份检查确认最新计划succeeded/current、工具记录存在、规划2/2禁用，未再调用模型。
- 本机任务#4恢复额外调用一次真实Codex，使用原153Skills/4项MCP配置；不是全部商业ACP账号兼容测试。
- 静态HTTP预览检查验证返回HTML、JS MIME、隐藏.git拒绝和服务随应用退出。常规构建/typecheck/lint通过。
- 干净源码副本不带原有.venv、node_modules或项目个人配置，npm run setup与check:setup均成功；使用副本自己的Electron/Python启动，连接副本数据库、发现25个MCP工具、加载三个角色选择与29个目录条目，无渲染错误、无模型调用。这证明当前Windows源码安装路径可用，不等于独立安装包或29个商业Agent均已验收。

建议先读agents.py与TaskLauncher的绑定，再看AgentPicker的选择如何传到start_task；随后读acp.py与runtime.mjs的事件/权限/完成信号，最后回到ExecutionJobs._managed_turn如何在真正完成后提交和审查。原始日志、投影、结果、检查与审查各自有自己的职责。
