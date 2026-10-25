# 第6课：把审查变成可等待、可取消的后台作业

2026-10-25，版本0.5.0。目标是让 WorkBuddy 在同一对话内使用独立 Codex 审查。WorkBuddy 执行代码修改，再调用本地 MCP；本项目接管审查的启动、状态和证据。无需先申请 WorkBuddy 第三方应用。

这次复用已有任务库、快照、意见校验和 Codex 受控进程，没有引入 Web 服务、消息队列、桌面框架或新的运行依赖。ponytail 指导复用和简化；项目的 Hashimoto/Willison 技能提供公开方法的参考，不代表两位本人参与、审查或认可代码。

## 先看实际结果

| 证据 | 本轮观察 | 能说明的范围 |
| --- | --- | --- |
| 全部离线检查 | Windows、Python3.14，71项通过，69.218秒 | 代码及本机协议/进程行为；不是模型质量 |
| 两个 MCP 服务 | 真实 stdio + 官方SDK，分别使用新版和兼容模式 | 跨进程共享、竞争、重试与恢复 |
| 离线异步演示 | 10个工具，目录6728 UTF-8字节；开始及重复请求合计约0.02秒 | 此合成样例迅速返回，不是时延保证或token计量 |
| 意见 | 12条合成意见，每页5条；改代码后旧结果stale | 分页与版本失效机制 |
| 取消/异常 | cancelling→cancelled；所有者异常退出后interrupted | 取消与终态分开，无自动重跑 |
| 安装 | editable版本0.5.0，pip check通过 | 当前本机依赖一致 |
| WorkBuddy V5.9.2 | 已通过原生编辑器保存条目，保存后JSON与准备文件一致、旧条目保留 | 当前待首次信任；尚未证明工具发现/调用 |
| 真实模型调用 | 本轮0次 | 不增加 Codex 审查用量；第5课的真实样例另计 |

GitHub CI 配置包含 Windows/Linux 和 Python3.11/3.14，增加异步离线演示；远程尚未运行。此前59项基础上增加迁移1、进程所有者死亡1、RPC取消1、适配取消1、后台管理5、真实MCP审查交接3，共12项。

## 1. 为什么要先返回作业编号

一个客户端请求如果等完整模型审查结束，会把网络期限、客户端等待与模型运行混在一起。连接断开时，客户端也难以判断是否应重试。现在把“受理请求”和“审查完成”分开：

```text
WorkBuddy → start_review → 返回 job_id
                         ↘ 后台：固定代码 → Codex审查 → 保存意见
WorkBuddy → get_review_status(job_id) → preparing/running/终态
WorkBuddy → read_review(job_id) → 意见及快照新旧状态
```

重要代码在 `agent_review_loop/review_jobs.py` 的 start_review：先在事务内写入记录并取得所有者锁，然后启动线程。线程复用 create_review_package 与 run_codex_review。前台不用等待模型响应。

这是一个本地、低并发的工具。每个数据库同时一个审查，不增加自动队列；忙时明确返回 REVIEW_BUSY。用标准库线程已能覆盖当前目标。

## 2. 重试为什么不会再启动一个模型

数据库保存 UNIQUE(task_id, request_id)。start_review 最先查这个键：

```python
if previous:
    if previous['fingerprint'] != fingerprint:
        raise StoreError('IDEMPOTENCY_CONFLICT', ...)
    return self._public(self._reconcile(db, previous))
```

fingerprint 包含仓库路径、基础版本和任务要求。相同键、相同参数返回同一作业；参数不同则报冲突。它表示“同一个已受理请求”，即使后来代码改了也不会偷偷启动新审查。修复后的复查需要明确使用新 request_id。

跨进程也必须成立，因此 SQLite 的 BEGIN IMMEDIATE 和唯一索引负责最终约束，不能只依靠一个 Python 对象里的 threading.Lock：

```sql
CREATE UNIQUE INDEX one_active_review_job ON review_jobs((1))
WHERE state IN ('preparing','running','cancelling');
```

常量1让所有活动作业竞争同一个索引键。每任务累计最多两次尝试，失败、取消和中断都占次数；幂等重放不增加次数。这是上层执行次数限制，不是token或费用硬上限。

## 3. 为什么不用 PID 判断服务还活着

PID 会重用，超时也不能证明进程死亡。本次使用系统文件锁：工作线程持有 owner.lock，正常退出释放，进程异常结束由操作系统释放。观察者尝试取得锁，只有成功时才把遗留活动记录标为 interrupted。

Windows 使用 msvcrt.locking，POSIX 使用 flock；文件句柄不继承给审查子进程。观察到中断后保留原记录，不恢复生成、不自动重试。本机测试实际让一个合成 MCP 服务 os._exit，另一个服务确认中断，重试同请求仍返回同一记录。

锁判断只负责“谁还拥有工作”；Windows Job Object 负责原生审查进程及其后代的关闭。独立测试保留原生子进程句柄，让所有者进程异常结束，再验证子进程实际退出。POSIX 原生进程组路径尚未在这台 Windows 机器验收。

## 4. 取消必须落实到执行者

cancel_review 事务内保存 cancel_requested，并返回 cancelling。CodexRpc 在短周期接收循环检查标记：

```python
if not ignore_cancel and self._cancel_check and self._cancel_check():
    raise ReviewCancelled('Review cancellation requested')
```

适配层尝试 turn/interrupt，随后退出受控进程上下文。只有退出已确认，后台才记录 cancelled；无法确认清理则 failed/CLEANUP_UNVERIFIED。interrupt 收尾允许忽略取消标记，否则会被自己刚设置的标记立刻阻断。

服务正常关闭也请求取消并等待工作线程，最多等待20秒。准备 Git 审查包期间在阶段边界检查取消；单个 Git 命令还有自身60秒超时。极端情况下关闭可能报告清理未确认，不能声称“点取消就立即结束”。

## 5. 为什么读取意见仍检查当前代码

模型结果属于一个固定 snapshot_id。read_review 复用 review_status 重新校验保存的包、意见位置和当前仓库，再分页返回。默认5条、最多10条，避免把全部审查历史塞回模型上下文。服务保存全量历史不等于模型一次读取全量历史。

```python
checked = review_status(package, review_id, repo)
page = checked['review']['findings'][after_index:after_index + limit]
```

freshness=stale 表示当前代码已变化。review_approved 仅表示该审查批准当前快照，不能推出项目测试通过。当前 checks 仍为 not_run；执行方自己的测试报告与审查结果分别展示。

## 6. 自己运行一次

在项目目录运行：

```powershell
.venv/Scripts/python.exe -X utf8 -m examples.async_review_demo
```

你应看到 connected、start_returned、review_read、new_code、cancel_requested、cancel_finished 和 complete。complete 明确标记 model_calls=0、real_workbuddy_verified=false，并打印本次产物目录。

演示使用 tests/fixtures/review_service.py 中明确标记的合成后端：Git仓库、数据库、MCP传输是真实运行，意见内容不是模型生成。正式CLI没有把fixture冒充Codex的开关。演示最初记录位于本机忽略目录 `.agent-review-loop/async-demos/d9b102fcd43841e988d940fc3da88abe/`，运行后会生成新目录。

可跟着做两个实验：把代码改掉再读旧意见，观察stale；在等候作业中调用cancel_review，先看cancelling，再查询终态。不要为了练习启动真实 start_review，否则会用到Codex额度。

## 7. WorkBuddy 已到哪一步

examples.prepare_workbuddy 读取原配置，生成备份与合并文件，不直接修改原文件。我们随后在 WorkBuddy 原生 JSON 编辑器保存新条目，保存后检查相等；没有改动原连接器内容。备份与机器绝对路径配置均忽略于 Git。

连接方向是 WorkBuddy→本地MCP→Codex。正式第三方OAuth相关代码保留为可选路径；本流程不依赖应用申请，也不会读取桌面端私有登录凭据。

首次交付时 WorkBuddy 停在本条目的“信任”按钮，未启用；用户随后亲自完成，后续结果见下节。交接Skill位于 integrations/workbuddy/skills/review-handoff，尚未证明被实际客户端导入。

本轮没有验证真实 WorkBuddy 开发→审查→用户选择修复闭环，也没有解决第5课发现的额外模型输入开销。下一步先完成真实客户端的最小只读验收，再用明确指定的合成仓库做一次有预算的完整实验。

## 8. 后续：真实 WorkBuddy 只读连接验收

2026-10-25约20:06（北京时间），用户回复“已点击”后继续检查。此节更新前面的初始待接入状态，不代表完整开发闭环已通过。

- 客户端 MCP 管理页显示 agent-review-loop 绿色状态和10/10工具启用；展开可见全部10个工具名。
- 使用界面所示 Deepseek-V4.1-Flash 发起一次只读请求，要求仅调用本服务 list_tasks(limit=1, after_id=0)，不创建任务、不启动Codex。
- 展开执行过程，实际工具轨迹含“搜索工具”与“list tasks”；进一步展开后可见输入为 `{"parameters":{"limit":1,"after_id":0}}`。不是仅凭最终回复中的“调用成功”判定。
- 最终回复展示 `{"items":[],"has_more":false,"next_after_id":null}`。独立读取本项目 workbuddy.sqlite3，tasks=0、review_jobs=0，与空列表及未创建审查相符。
- 客户端显示“已完成25s”，以及“共消耗0.48”；后者计量单位未核实，不换算成金额、token或Codex用量。此检查使用了一次WorkBuddy模型交互，Codex审查启动次数为0。

证据范围是原生客户端可见的工具执行轨迹、参数、最终输出与独立数据库核对；未导出WorkBuddy原始协议帧，界面模型名也不是服务端模型身份鉴证。只读连接成立，不推出开发目录选择、技能导入、真实审查和修复已成功。

Computer Use 仅用于这次实际客户端验收，因为当前没有可直接控制WorkBuddy对话的已验证官方接口。本项目核心通过stdio MCP工作，运行不依赖界面坐标或Computer Use；代码开发和协议测试也无需这一路径。界面操作到此停止。
