# 第 2 课：让两个 Agent 共用任务状态

本轮日期：2026-10-25。对应可运行版本：0.2.0。

## 这次实际做出了什么

一个本地 MCP 服务，提供六个工具：创建、读取、列表、领取、续期、提交结果。程序启动时连接指定 SQLite 文件；两个客户端可以各自启动服务进程，只要数据库路径相同，就能看到相同任务。

这次使用官方 Python SDK 的两个客户端进行验收。服务进程和协议通信是真实的，任务内容是合成的。没有调用模型，没有证明 Codex 或 WorkBuddy 产品已经接通，更没有完成代码快照与审查。

## 一次调用怎样经过代码

```text
Agent 选择 claim_task
    ↓ stdio：标准输入和标准输出中的 MCP 消息
官方 SDK 解析消息、检查参数类型
    ↓
server.py：claim_task 工具函数
    ↓
store.py：检查版本和领取状态，开启 SQLite 写事务
    ↓
数据库保存本次尝试，返回领取凭据与新版本
    ↓
SDK 把字典编码为 MCP 结果，客户端继续工作
```

阅读顺序：先看 `agent_review_loop/server.py` 的 `create_task`，再看 `store.py` 的同名方法，最后看 `tests/test_mcp.py` 中真实客户端怎样调用。

## 代码 1：协议处理交给 SDK

取自 `agent_review_loop/server.py`：

```python
@server.tool(structured_output=True)
def get_task(task_id: TaskId) -> dict[str, Any]:
    """Read one task, its current version, claim summary and submitted report."""
    return _invoke(store.get_task, task_id)
```

`@server.tool(...)` 把普通 Python 函数注册成 MCP 工具。`TaskId` 限定它必须是正整数，而且不能把 `True` 当作任务 1。函数返回字典，SDK 负责协议格式。

`structured_output=True` 明确要求结构化结果，应用程序可以读取字段。首次集成检查发现只拿到了非结构化结果，我们补充了明确的结构化声明和返回值类型，随后重新验证两个协议模式。

业务失败经 `_invoke` 转为 SDK 的 `ToolError`。客户端收到的是 `isError` 结果，例如 `TASK_CLAIMED`，而不是一条伪装成功的“操作失败”文本。

## 代码 2：为什么不用 Python 的锁

取自 `store.py` 的连接管理：

```python
if write:
    db.execute("BEGIN IMMEDIATE")
else:
    db.execute("BEGIN")
yield db
db.commit()
```

`BEGIN IMMEDIATE` 在事务开始时获取数据库写锁。两个独立服务进程共用文件，写操作必须依次检查和修改状态。先读取后再分别写入，就有可能让两个进程都认为任务无人领取。

`yield db` 是上下文管理器把连接交给业务代码的位置。业务代码发生异常时，连接管理器回滚；成功时提交；最后显式关闭连接。普通 `with sqlite3.connect(...)` 只管理事务，不会替我们关闭连接，这在本轮 Windows 临时数据库清理中实际暴露过。

数据库还有第二道约束：

```sql
CREATE UNIQUE INDEX one_active_attempt
ON attempts(task_id) WHERE state = 'active';
```

它要求每个任务最多一条 active 尝试。事务保证领取流程完整，索引约束保证存储状态不出现两个 active 尝试。借鉴来源是 rhizome 的领取机制和跨进程测试；具体实现采用当前项目的 sqlite3。

## 代码 3：任务、尝试、版本为什么分开

任务是“做什么”；尝试是“这一次谁在做”；版本表示任务记录已经推进了几步。

示例：创建任务得到版本 1；第一次领取得到版本 2；提交后得到版本 3。如果领取者断开且期限已过，下一次领取生成全新的 attempt_id，旧尝试不能继续提交。

```python
if row["version"] != expected_version:
    raise StoreError("VERSION_CONFLICT", "Task changed; read the current version")
```

这里的版本是任务状态版本，尚不是代码版本。后续 Git 快照会有自己的标识，不能用任务版本替代代码内容。

存储层只保存任务的 ready/submitted；展示出的 claimed 来自尚未过期的 active 尝试。因此进程退出后，不需要一个永久运行的清扫程序来把显示状态改回 ready。过期尝试在下一次领取事务中标记 expired。

## 代码 4：领取凭据与续期

领取成功会返回 `attempt_id`、随机 `claim_token`、版本和到期时间。列表与读取工具不返回 token，数据库只保存其 SHA-256 摘要。提交和续期时，服务检查它与当前尝试是否匹配。

这只保护本地协作尝试；同一可信用户能访问数据库，不构成远程多人身份认证。`owner` 是显示标签。

默认领取 900 秒，允许 30–3600 秒。Agent 长时间工作需要在过期前调用 `renew_claim`。续期不能把原来的更长期限缩短：

```python
expires_at = max(attempt["expires_at"], now + lease_seconds)
```

丢失领取凭据时不把 token 暴露到公共读取接口。当前版本需等待过期后重新领取；检查点式恢复属于后续工作。

## 代码 5：为什么提交有 request_id

设想服务已经保存结果，但回复途中客户端退出。客户端无法只凭“没收到回复”判断是否提交成功。如果它重试，不应再新增一条结果。

```python
if previous:
    if previous["fingerprint"] != fingerprint:
        raise StoreError("IDEMPOTENCY_CONFLICT", ...)
    return json.loads(previous["response"])
```

上面是核心条件的节选，完整可运行代码在 `store.py`。同一 task_id、attempt_id、request_id 对应同一次业务提交。相同内容重试返回原回执；不同内容复用同一个 ID 报冲突。

任务状态更新、尝试完成、提交回执在同一 SQLite 事务提交。所以进程重启之后仍能识别这个请求。借鉴 Relay 的重放作用域，但当前实现使用持久记录。这里只保证这次数据库提交的去重，不宣称模型或外部副作用严格只执行一次。

`create_task` 当前没有幂等键。创建后回复丢失时，先检查列表，不应盲目重复创建。

## 自己运行一遍

在仓库根目录的 PowerShell：

```powershell
.venv/Scripts/python.exe -m examples.task_demo
```

它会启动两个 MCP 服务进程，然后关闭它们，再启动第三个读取结果。使用临时数据库，结束后清理，不接触个人项目和账号。

本轮实际输出的关键事件：

```text
connected: 两个客户端，协议 2026-07-28 与 2025-11-25
tools: 六个工具，目录 JSON 为 4359 字节
created: task_id=1, version=1
claimed: version=2
second_claim_rejected: TASK_CLAIMED
submitted: version=3
duplicate_submission: same_receipt=true
restart_verified: status=submitted, same_receipt=true
complete: model_calls=0, real_agent_clients_verified=false
```

4359 是本机实测的 UTF-8 字节数，不能直接当作 token 数。

运行检查：

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -v
.venv/Scripts/python.exe -m pip check
```

## 建议动手做的三个实验

1. 阅读 `test_two_independent_processes_have_one_claim_winner`：预测两个进程会得到什么，再运行 `test_store.py`。它使用启动屏障让两个领取请求真正竞争。
2. 阅读 `test_expiry_reclaim_and_renewal`：把可控时钟推进到到期前后，观察 ready、claimed 与旧尝试提交错误的变化。测试不需要真的等 15 分钟。
3. 阅读 MCP 集成检查中的 `asyncio.gather`：两个独立进程同时提交完全相同请求，观察为什么只会得到同一个回执。把第二份 summary 改掉时，应当产生冲突，而不是覆盖第一份结果。

修改实验前创建自己的 Git 分支；每次只改一条规则，预测结果再运行。检查失败时先定位是传输、类型、状态还是资源释放，不直接降低断言要求。

## 已验证与尚未验证

已在本机 Windows / Python 3.14 验证：共 19 项检查（原有进程模块 8、共享存储 7、MCP 与命令入口 4），真实双服务进程、两个协议模式、并发领取与提交、重启重试、过期旧尝试、错误凭据、分页和不相关数据库保护。依赖检查通过。

本轮新增的跨平台 CI 配置尚未在 GitHub 执行。Codex/WorkBuddy 产品工具调用、Git 快照、自动审查返修、主动唤醒其他应用、真实 Agent 进程树取消尚未验收。submitted 只是工作报告已保存，不能标记代码通过验收。

## 下一步：真实客户端接入

安装为 editable 包后，下面的命令生成本机配置，不会修改任何客户端设置，也不会创建数据库：

```powershell
.venv/Scripts/python.exe -m agent_review_loop config --db "$((Get-Location).Path)/.agent-review-loop/acceptance.sqlite3"
.venv/Scripts/python.exe -m agent_review_loop config --db "$((Get-Location).Path)/.agent-review-loop/acceptance.sqlite3" --format codex
```

第一份是 mcpServers JSON，可按 WorkBuddy 的 MCP 配置入口填写 command、args 和 cwd；第二份是 Codex TOML 配置片段。保留客户端已有配置，只添加该服务；两边必须指定同一数据库绝对路径。当前会话不会因生成文件而自动拥有新工具。

接通后先创建无文件修改的合成任务：一方创建，另一方读取、领取、提交，再由第一方读取。记录客户端版本、工具名称和实际结果，独立于 SDK 检查留证。完成这一步，再实现代码快照。

## 参考资料

- [官方 MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)：本轮直接使用 mcp==2.3.0。
- [SDK 结构化输出](https://py.sdk.modelcontextprotocol.io/servers/structured-output/)：按实际安装版接口与集成结果核验。
- [WorkBuddy 连接器](https://open.workbuddy.cn/docs/connector)：本地 stdio 配置与字段。
- [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp)：客户端配置。
- [固定提交的开源复用清单](../superpowers/specs/2026-10-25-open-source-reuse.md)：业务机制与改写差异。
