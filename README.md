# Rondo

一个本地运行的学习型开源项目：把一项 Git 修改交给不同 Agent 实现、审查，再由用户选择是否修复。

产品运行时，在成本与限额约束下组织角色：**WorkBuddy + DeepSeek 实现与修复，Codex 强模型负责关键审查，自动化检查提供可复现证据**。不要求先运行全 Codex 对照。用户负责需求取舍与最终接受；具体模型版本和质量由接入实验记录，不承诺这一组合必然省钱或保持同等质量。

当前版本：**0.13.0，支持直接从保存位置创建项目。** 在 Rondo 提需求、准备独立工作区并生成 Codex 计划，点击“执行并审查”后，在 WorkBuddy 专用桌面会话中完成修改、通过 MCP 提交，再由 Rondo 接续检查及 Codex 审查。界面继续复用 Jean、Vibe Kanban、T3 Code、REA 恢复的 Codex 输入样式及 Pierre Diffs。首次审查要求修改时，自动在同一任务和工作区返修一次，再检查、复查；复查仍有问题时停止。

本机已通过真实任务验证“计划 → 原生执行 → MCP 提交 → 固定检查 → Codex 审查”。本地通道不需要第三方 Open API 应用；适配 WorkBuddy 5.9.2 的原生 RPC，后续版本需要核对兼容性。接入说明见 [WorkBuddy 本地接入](integrations/workbuddy/README.md)。

准备新任务时直接选择项目文件夹或保存位置：已有Git项目沿用现有版本，空文件夹自动初始化；普通目录已有文件时，Rondo创建独立项目子文件夹，保留原文件。无需先配置Git身份，也不需要选择新/已有项目模式。表单草稿会保存在本机。

## 现在可以运行

### 打开桌面工作台

已有本地环境可双击根目录 `Start-Desktop.cmd`。新环境先完成下文 Python 环境安装，再运行：

```powershell
npm --prefix desktop ci
npm --prefix desktop run build
npm --prefix desktop start
```

需要 Node 24+ 和 Python 3.11+。这是依赖源码环境的 Windows 开发预览，还不是独立安装包。默认数据库为 `.agent-review-loop/workbuddy.sqlite3`。创建和刷新任务不调用模型；生成计划使用 Codex 额度，“执行并审查”使用 WorkBuddy 和 Codex 各自额度。未配置 `--check-config` 时固定检查明确记录为 `not_run`，不会声称通过。运行配置见 [第9课](docs/learning/09-desktop-workbench.md)，本次接入及真实结果见 [第14课](docs/learning/14-workbuddy-native-execution.md)。

0.8.1 使用 [Jean](https://github.com/coollabsio/jean) 固定提交的真实侧栏、输入组合、分栏和控件源码，提供任务筛选、Ctrl+B 收起导航、键盘/鼠标调整分栏与持久化浅深主题。来源和适配见 [第10课：直接移植产品 UI](docs/learning/10-reuse-product-ui.md) 及 [源码记录](desktop/src/renderer/src/vendor/jean/NOTICE.md)。根目录启动器把界面偏好保存在忽略于 Git 的 `.agent-review-loop/desktop-profile/`；任务仍保存在 SQLite。

### 执行计划

准备任务后，从当前阶段的主按钮或“Codex · 执行计划”记录显式生成；此操作消耗 Codex 额度，刷新与恢复不再生成。计划和审查互斥，每任务分别最多两次，失败/取消也计入。计划中的验收方式不会自动执行。真实调用、上下文边界与成本记录见[第11课](docs/learning/11-codex-planning.md)。

### 一次开始任务

执行Agent调用 `start_task(repo, title, instructions, acceptance, request_id)`，即可取得task_id、workspace、base_commit、需求及下一步。默认从HEAD提交建立独立工作目录，不复制源目录未提交的改动。Agent在workspace中实现；换对话时用 `get_task_context(task_id)` 恢复。完成后调用 `start_task_review(task_id, request_id)`，服务直接使用已保存的目录与基础提交，无需再次手填。

也可从CLI使用：

```powershell
.venv/Scripts/python.exe -X utf8 -m agent_review_loop start --db 'C:/your/local/tasks.sqlite3' --repo 'C:/your/git/project' --title '实现需求' --instructions '具体修改要求' --acceptance '验收条件' --request-id 'feature-001'
.venv/Scripts/python.exe -X utf8 -m agent_review_loop context --db 'C:/your/local/tasks.sqlite3' 1
```

替换示例路径，第二条使用第一条实际返回的任务编号。相同开始请求和内容复用原任务，换内容须换request_id；开始任务不调用模型，也不替换宿主应用当前会话或编辑器。默认工作目录位于 `~/.agent-review-loop/tasks/`，start/serve/config可用--task-root指定。详见[第8课：一键开始任务](docs/learning/08-start-task.md)。

在 Windows PowerShell 中：

```powershell
Set-Location 'C:/Users/cvkis/Documents/ChatGPT/GitHub/agent-review-loop'
py -3 -m venv .venv
.venv/Scripts/python.exe -m pip install -e .
.venv/Scripts/python.exe -m unittest discover -s tests -v
.venv/Scripts/python.exe -m examples.task_demo
.venv/Scripts/python.exe -m examples.process_demo
.venv/Scripts/python.exe -X utf8 -m examples.review_demo
.venv/Scripts/python.exe -X utf8 -m examples.async_review_demo
.venv/Scripts/python.exe -X utf8 -m examples.checked_review_demo
```

本机已准备好 `.venv`，可以直接运行检查与演示。新环境先创建虚拟环境并安装。其他系统使用 Python 3.11+，把 `py -3` 换为 `python3`，后续解释器路径换为 `.venv/bin/python`。当前只实际验证了本机 Windows；Windows/Linux 的 CI 配置已添加，尚未在 GitHub 运行。

任务演示使用真实 stdio MCP 进程：两个客户端创建与领取任务，第二次领取被拒绝，提交后重复调用得到同一回执，服务重启后仍可读取。没有模型调用，不修改现有应用配置。

### 服务与客户端配置

```powershell
.venv/Scripts/python.exe -m agent_review_loop config --db "$((Get-Location).Path)/.agent-review-loop/acceptance.sqlite3"
.venv/Scripts/python.exe -m agent_review_loop config --db "$((Get-Location).Path)/.agent-review-loop/acceptance.sqlite3" --format codex
```

第一条生成 mcpServers JSON；第二条生成 Codex TOML。两边指定同一数据库绝对路径。配置命令只打印结果，不修改客户端、不创建数据库。安装为 editable 包后，服务也能从其他目录启动。

早期接入准备放在项目的 `.codex/config.toml` 和 `.workbuddy/mcp.json`，均已忽略于 Git。本轮另经 WorkBuddy 原生配置编辑器保存用户级 `~/.workbuddy/mcp.json`：保留原条目，修改前已备份，保存后与准备文件核对一致。用户完成首次信任后，客户端实际发现10个工具，只读调用轨迹与返回已核对。产品主流程中，由 WorkBuddy 在同一对话内发起与读取审查，用户无需在两个应用之间手动传递任务。

十八个工具：规划入口 `start_task_plan`、`get_plan_status`、`read_plan`、`cancel_plan`；常用入口 `start_task`、`get_task_context`、`get_task_changes`、`start_task_review`；原任务工具 `create_task`、`get_task`、`list_tasks`、`claim_task`、`renew_claim`、`submit_result`；原审查工具 `start_review`、`get_review_status`、`read_review`、`cancel_review`。默认领取900秒，可选30–3600秒；长期任务需提前续期。submit_result重试保留原request_id和内容。submitted只表示报告已保存。旧create_task没有幂等键，新开发任务优先用start_task。已有宿主客户端需要自行重新加载服务才会发现新增工具。

只面向本机同一可信用户。领取凭据不出现在列表和详情里，owner 是显示标签。服务使用 stdio，不监听网络；任务工具不调用模型，显式调用 start_review 会使用本机已登录 Codex 的额度。

### 后台审查

start_review 接收 task_id、repo绝对路径、base_ref 和 request_id，先返回 job_id，再准备固定审查包并调用既有 Codex 适配。停止执行方写入后再开始。相同任务/请求/参数重复调用返回原作业，不再次消耗预算；不同参数复用请求标识报冲突。每个数据库同时一个活动审查，每个任务最多两次尝试，失败和取消也计入，无自动排队或重试。

用 get_review_status 查询作业；succeeded 后 read_review 默认返回5条意见，最多10条，附快照新旧状态。cancel_review 先返回 cancelling，确认执行退出后才为 cancelled。服务进程丢失所有者锁时记录 interrupted，不自动重跑。准备 Git 包期间在阶段边界处理取消，各 Git 命令自身有超时；不能承诺点击后立即结束。

审查目录默认位于 `~/.agent-review-loop/runs/<数据库路径摘要>/`。serve/config支持--review-root和--codex-executable绝对路径；产物目录必须在被捕获仓库之外。SQLite schema1/2自动增量迁移到3，原任务、领取、提交和审查数据保留。

examples.async_review_demo 使用真实 MCP 传输和明确标记的 fixture 后端，验证两客户端、重复请求、意见分页、过期和取消；模型调用为0。它不能代替真实 WorkBuddy/Codex 闭环，见 [第6课](docs/learning/06-async-review-mcp.md)。

### 检查后再审查

serve/config支持 `--check-config <本机JSON绝对路径>`，JSON含argv（绝对可执行程序及参数数组）和timeout_seconds（有限正数，最多180秒）。serve启动时读取并固定配置，MCP不接收任意检查命令，不自动执行仓库配置。未配置仍明确返回not_run。

配置后，服务在固定包的副本after中执行检查，保存退出码、用时、日志和内容摘要；重新校验文件后，将证据绑定到最终snapshot_id。失败、超时、取消、输出超限或文件改变都停止审查，状态附checks摘要与check_evidence_path；每流日志最终最多保存1MiB，运行时可能短暂超过，不是磁盘硬配额。CLI直接审查也拒绝未通过的检查记录。

副本无.git，不安装依赖，不能在包内生成文件；Python缓存默认关闭，临时目录在副本外。须核对实际导入位置，cwd不能保证依赖全部来自副本。进程仍有本机用户权限，副本不提供权限沙箱。详见[第7课](docs/learning/07-snapshot-checks.md)。

examples.checked_review_demo 使用真实unittest和MCP，展示错误代码检查失败且审查器调用0次、修复后通过才进入明示fixture审查、日志篡改后读取被拒绝。模型调用0，不证明真实WorkBuddy完整闭环。本轮没有修改WorkBuddy个人配置或重启其连接。

### 固定代码与审查

运行 `examples.review_demo` 会自动创建一次性 Git 仓库和独立工作区，保存合成改动，记录预先写好的审查意见，模拟修复并验证旧审查过期。原仓库保持不变；全程模型调用为 0。产物保留在本机 `.agent-review-loop/review-demos/`，末行给出具体路径。

CLI 提供 `workspace`、`package`、`record-review`、`review-status`；各命令可加 `--help` 查看参数。包使用现有数据库的任务要求，不包含领取 token。包内有完整 before/after 文件、支持二进制的 changes.patch、检查状态和带内容标识的 manifest。审查可定位新增和删除的文本行，也支持二进制的文件级意见。

快照来自 Git 的规范内容，遵循其文本规范化规则；未跟踪且被忽略的文件不纳入。每个版本最多 5000 文件、两个版本共 100 MiB；首版明确拒绝子模块、符号链接/reparse point、稀疏工作区和自定义 Git filter（含 LFS）。导出的目录没有 .git；依赖 Git 的项目检查需要后续运行环境支持。创建产物必须使用源工作目录之外的新路径。

审查前后会校验文件集合、内容和意见位置；对照当前代码时返回current/stale，没有对照则unchecked。`review_approved`只指该审查记录批准当前代码，**不等于项目检查通过或用户最终接受**；checks单独记录，未配置时为not_run。包是可写的本地文件，校验用于检测变化，不能代替权限隔离或数字签名。捕获前须停止执行方写入，连续两次捕获一致也不是跨文件的系统原子快照。

### 真实 Codex 审查（显式调用会消耗额度）

`examples.codex_preflight` 只检查官方服务握手、账号模式、模型元数据和退出，不生成模型内容。`review-codex --package <绝对路径> --output <新目录绝对路径>` 才会发起一次真实审查。默认使用现有 Codex 配置的模型，记录服务返回的实际模型和用量；无自动重试、等待期限180秒、初始内联文本上限64 KiB，二进制暂不支持。默认测试/CI 不调用模型。

当前审查路径使用官方 thread/start + turn/start/outputSchema，新建独立 ephemeral 会话。Windows 受控启动先挂起、加入 Job、再恢复；关闭时终止同组进程并等待退出。真实审查本轮未调用工具，服务返回只读且网络关闭，本次进程禁用继承的 MCP，不修改原配置；这不是已经验证的完整个人环境继承。

真实合成审查耗时13.021秒，准确指出第2行的加减法错误；服务报告总用量26303 token，其中输入26057，费用未知。小样例仍有明显额外上下文开销，来源尚未定位；64 KiB 限制不等于完整模型上下文或费用上限。详见第5课，不据一次简单样例宣称一般审查质量。

WorkBuddy 的 `workbuddy-authorize` 命令只生成授权入口与本地 state，不需要 Client Secret，不代表已经授权。后续令牌交换和只读在线状态已实现；用户目前尚未创建第三方应用，应用申请条件、所需权限和审核尚待确认。WorkBuddy 保持候选适配，不将获批作为核心开发的前置条件；不会提取桌面端私有凭据，0.11.0 的本机原生通道单独实现任务派发，与本节 Open API 授权路线无关。

演示依次显示 `completed / 0`、`failed / 7`、`timed_out / 非零退出码`。超时退出码取决于操作系统，不要求固定数值。演示只运行自带 Python 程序，不访问网络和模型，临时输出在演示结束后清理。

`run_process` 将任务通过 stdin 送入程序，把 stdout、stderr 分开写入日志，另存 `result.json`。相同输出目录不能重复使用；进程退出为零并不证明 Agent 完成了代码任务。

## 第一条完整流程

1. 用户指定任务、验收要求和一个用于实验的 Git 仓库。
2. 实现 Agent 在独立工作目录中修改代码。
3. 工具记录基础提交、修改快照、检查命令与结果。
4. 独立审查 Agent 针对固定快照提供意见，区分已复现问题、静态疑点和未执行的检查。
5. 用户选择意见，发起一次修复；产生新快照后，旧审查标为过期。
6. 工具保留运行状态和可检查的证据，由用户决定接受成果。

## 从哪里开始

- [设计与验收标准](docs/superpowers/specs/2026-10-25-agent-review-loop-design.md)
- [第一阶段实施计划](docs/superpowers/plans/2026-10-25-process-runner.md)
- [开源借鉴与复用清单](docs/superpowers/specs/2026-10-25-open-source-reuse.md)
- [第二阶段实施与验收计划](docs/superpowers/plans/2026-10-25-shared-task-mcp.md)
- [第 2 课：代码讲解、实验与验收过程](docs/learning/02-shared-task-mcp.md)
- [第 3 课：自动调度实验、实测结果与下一步](docs/learning/03-automatic-runtime-probe.md)
- [第 4 课：固定代码版本、审查包与过期检查](docs/learning/04-review-package.md)
- [第 5 课：真实 Codex 审查、进程树与成本记录](docs/learning/05-real-codex-runtime.md)
- [第 6 课：异步审查、幂等、取消与 WorkBuddy 接入](docs/learning/06-async-review-mcp.md)
- [第 7 课：固定版本的自动化检查与审查门槛](docs/learning/07-snapshot-checks.md)
- [第 8 课：一键开始任务与接续开发](docs/learning/08-start-task.md)
- [Hashimoto 项目方法技能](.agents/skills/mitchell-hashimoto-engineering/SKILL.md)与[Willison 项目方法技能](.agents/skills/simon-willison-agent-engineering/SKILL.md)

按下面的里程碑推进，每次完成一个可运行的版本：

| 阶段 | 可交付结果 | 理解的重点 |
| --- | --- | --- |
| 1（完成） | 启动本地测试进程、记录输出、处理失败与超时；8 项检查通过 | 进程、标准输入输出、退出码 |
| 2（协议与 WorkBuddy 只读连接完成） | 本地 MCP、共享任务、过期领取、并发与重启验证；完整开发交接待验收 | 协议、事务、版本、幂等、配置 |
| 3（快照/契约与 Codex 合成审查完成，WorkBuddy 待接入） | 固定 before/after、差异、任务要求；校验意见与版本 | Git、上下文、版本与状态 |
| 4（历史/过期检查完成，用户修复流程待接入） | 持久化审查，代码变化后旧审查过期 | 持久化、恢复、验收证据 |
| 5 | 整理安装说明、示例、必要测试及 CI | 可复现交付与开源协作 |

## 开发方式

以下是开发本工具的方式，与产品内执行 Agent/审查 Agent 的分工分开管理。

- Python 3.11+、Git、SQLite，优先使用标准库。
- 第一阶段只运行项目自带的测试进程，不访问模型服务、不使用账号。
- MCP 保存共享任务，运行适配负责自动调用 Agent；先确认接入、目录和模型配置，再运行真实代码任务。手动调用用于独立排查连接，不是产品主流程。
- 每轮说明目标、实现一小段、预测结果、主动制造失败、验证实际行为。
- 模拟检查通过、真实模型调用通过、真实代码任务通过分别记录。

### 负责人推进规则

- 每轮只推进一个明确任务：目标、输入输出、改动范围、验收命令、当前限制写清后再实现。
- 后台审查及 WorkBuddy 原生执行已接入；后续在真实需求上继续验证，并实现审查意见的有界返修。
- MCP 是正式协议边界，采用官方 SDK；不自行拼出简化版协议，也不提前增加桌面壳、账户体系或云服务。
- 自动化检查离线可运行；真实模型检查单独记录，涉及实际调用时再明确目标、权限和预算。
- 每阶段交付可运行示例、检查结果与一个能解释的技术点。涉及全局环境或现有应用配置的变化单独说明。
- 开源前补充经过验证的安装说明、跨平台 CI 与许可证；贡献上游时先核对其规则、重复问题和复现证据。

### 第一阶段验证记录（2026-10-25）

先运行检查确认缺少模块而失败，随后实现并通过 8 项检查：中文任务与空格目录、stdout/stderr 分离、非零退出、启动失败、超时、输出覆盖保护、非法超时、非法目录及参数。部分行为合并在同一检查中。

此处原进程模块只终止直接子进程。0.4.0 的真实 Codex 适配使用另行验收的 ProcessTree；数据库、MCP 和真实合成审查在后续阶段加入。第一阶段没有模型调用，模拟检查不能替代实际产品验收。

### 第二阶段验证记录（2026-10-25）

共 19 项检查通过：原进程 8、共享存储 7、MCP/CLI 4。实际启动两个服务进程，验证领取竞争、并发重复提交、服务退出与重启后的回执恢复。协议模式分别为 2026-07-28 与 2025-11-25；工具目录实测 4359 UTF-8 字节，不等同于 token 数。`pip check` 通过。

开发中修复了 SQLite 测试连接未关闭、Windows 重定向 JSON 编码、SDK 结构化输出以及续期可能缩短期限的问题。详见学习文档。此为第二阶段记录；代码快照与审查契约在 0.3.0 加入，真实 Agent 验收仍待完成。

## 接入与贡献边界

2026-10-25 已核对官方材料：

- Codex 提供非交互执行及 JSONL 输出：https://learn.chatgpt.com/docs/non-interactive-mode
- WorkBuddy 支持本地 stdio MCP 连接器：https://open.workbuddy.cn/docs/connector
- 0.11.0 验证原生执行与审查；0.12.0 增加一次自动返修和复查，真实返修实验见第15课。
- WorkBuddy 另有经应用注册和用户授权调用本地助理的 Open API；首版不以开通该接口为前置条件：https://open.workbuddy.cn/docs/openapi
- 本机已确认 WorkBuddy V5.9.2，安装于 `C:/Users/cvkis/AppData/Local/Programs/WorkBuddy`；本服务用户级配置已备份、保存并由用户信任。客户端只读验收使用界面所示 Deepseek-V4.1-Flash，执行轨迹包含工具搜索和 list tasks；未启动 Codex 审查。详见第6课的后续验收记录。

当前贡献路线是发布独立开源工具和经过验证的 Agent 接入示例；有可复现问题时按各上游项目规则反馈。代码尚未发布到 GitHub；公开发布前再选定许可证并检查日志中是否含私人资料。

## 默认审查规则

- 审查会话先独立阅读需求、代码和相关调用链，不默认接收实现者整段推理；必要的项目约束与已知事实保持共享，不能仅看 diff。
- 审查意见需关联快照、文件位置、触发条件、影响和依据；不能只输出“通过”或泛泛建议。
- 用户选定意见后，原实现 Agent 修改；有争议的问题先尝试最小复现，不按审查意见数量自动改代码。
- 测试结果是独立证据；检查通过不等于没有缺陷，Agent 自述通过也不等于检查实际运行。
- 缺陷修复尽可能留下修复前失败、修复后通过的检查；不能通过删除、跳过或削弱验收断言换取通过。
- 同模型不同会话仍可能有共同盲点；不同品牌也不证明审查更好。使用带已知缺陷和无缺陷对照的固定样例，比较有效发现、误报、复现证据和修复后回归，再选择角色。
- 首版一次发起至多进行一轮修复，继续审查由用户明确发起。

## 成本与限额规则

- 同一任务默认一次 Codex 完整审查，修复后至多一次针对修改部分及相关影响的复查。审查与复查合计上限为两次上层执行，不自动重试、不无限互评。
- 大量执行、普通错误定位、测试运行与修复由 WorkBuddy + DeepSeek 完成；Codex 的方案检查只用于跨模块或高影响决策，单独记录其预算。
- 提交审查前先运行已声明的自动化检查，明显失败先修复；测试通过不是正确性保证。
- 审查包包含需求、基础版本、修改和相关检查，允许审查者继续读取必要上下文，不反复传递全部聊天历史。
- 每次审查记录耗时、退出原因及平台可报告的用量；未报告的费用与剩余额度记为未知，不从字符数或调用次数伪造。
- 一次上层执行可能包含多次模型请求；调用上限不等于 token 或费用上限。接入阶段另设进程超时，并验证平台可用的轮数或用量约束。
- 达到上限、没有进展或出现限额错误时保存现有结果并停止；关键问题未解决时标为未完成，不静默换模型继续消费。

0.9.1 UI 复用记录：[第12课：产品界面移植与 REA](docs/learning/12-product-ui-reuse.md)。Jean 产品布局、Vibe Kanban 计划组件与 Codex 发布包输入 CSS 的来源及适配边界分别记录在各 vendor 目录。

0.10.0 工作记录：[第13课：任务页面围绕开发过程组织](docs/learning/13-task-work-records.md)。状态断言：`node desktop/scripts/flow-check.mjs`；桌面默认 smoke 不调用模型。

0.11.0 原生执行：[第14课：从 Rondo 指挥 WorkBuddy 并自动交给 Codex 审查](docs/learning/14-workbuddy-native-execution.md)。

0.12.0 返修：[第15课：把审查问题自动交回执行者](docs/learning/15-bounded-repair.md)。新增 `start_task_repair`，工具共23个；普通刷新不发起模型调用。
