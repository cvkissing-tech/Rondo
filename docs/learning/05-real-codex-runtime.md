# 第5课：真实 Codex 审查与进程生命周期

2026-10-25，本轮从模拟交接进入一次真实 Codex 审查。实现使用 Python 标准库、Windows 原生 Job Object 和官方 Codex App Server；没有更换已有 SQLite/MCP 核心，也没有把 WorkBuddy 换成 DeepSeek API 或 CodeBuddy CLI。

## 实际交付

本机离线59项检查通过：原有39项、进程树5项、RPC传输5项、审查适配5项、WorkBuddy OAuth/只读接口5项。Windows/Python 3.14 实测；Linux 和 Python 3.11 CI 仍未实跑。真实预检和唯一一次模型审查另列，不混入离线检查数量。

- processes.py：Windows 挂起创建、加入 Job 后恢复；关闭时终止组并等待退出。POSIX 提供独立进程组路径，尚未在本机实测。
- codex_rpc.py：按请求 ID 区分响应与通知；读写各有有界队列，写入卡住也不能绕开请求期限；未知交互请求不被自动批准。
- codex_review.py：读取固定审查包的完整 before/after 文本，进行一次独立结构化审查。最终文本、协议 completed、包完整性、意见结构必须分别满足；失败不自动重试。
- workbuddy.py：正式 OAuth 地址、回调 state/地址校验、令牌交换接口与只读在线状态。尚未真实授权，不能把 online 当成执行成功。

## 本机真实结果

服务：Codex CLI 0.164.0-alpha.11.1，Windows 10.0.26200 x86_64。预检读取官方 account/read(refreshToken=false) 与 model/list，没有打印账户邮箱或令牌，也没有模型生成。最新预检证据：`.agent-review-loop/codex-preflight/91774b166b7e451e8a5071840a8e598c/`。

真实审查证据：`.agent-review-loop/codex-reviews/c9b9c53352424159b91cf0b79e2fab29/`，包含请求、事件、原始最终文本、结果和服务 stderr。原始目录忽略于 Git，本课只记录合成样例事实。

| 项目 | 实际观察 |
| --- | --- |
| 上层审查次数 | 1；不等于承诺底层模型请求恰好一次 |
| 模型 | 服务实际返回 gpt-6.1-sol，provider=openai |
| 会话 | 新建 ephemeral，会话与原开发对话独立 |
| 权限 | 服务返回 readOnly，networkAccess=false；本轮无工具执行事件 |
| 外部 MCP | 本次进程逐项禁用现有 4 个服务，原配置不变 |
| 完成证据 | 匹配 thread/turn 的 completed 事件与最终 assistant JSON |
| 实际意见 | calculator.py，after 第2行，return a-b 违背求和要求；P1、static |
| 保存 | 通过现有 save_review 验证，review_id=7e788c3a35c1fad417e25c12bbcddb8af05890707b0710d4bdd54522f78c5598 |
| 耗时 | 13.021 秒，包含连接/配置/审查/关闭 |
| 服务报告用量 | inputTokens=26057，outputTokens=246，totalTokens=26303；费用未报告 |
| 退出 | 受控进程组关闭成功 |

原始意见的关键内容：输入 add(2,3) 时表达式会给出 -1，任务要求是 5；模型明确说明这是静态判断、未执行项目测试。这里是很容易的已知缺陷样例，只证明真实链路和该次定位，不能推出一般审查质量、误报率或修改能力。

## 成本发现

输入样例很小，但服务报告了 26057 个输入 token。当前只能确认额外上下文开销存在，尚未定位其具体来源；config/read 中没有可直接解释它的 instruction 字符字段。不能把“我们拼出的 prompt 很短”当作“完整模型输入很短”。

当前适配的限制为：最多一次上层 turn，不自动重试，等待期限180秒，内联输入最多64 KiB。64 KiB 只是本项目构造的输入限制，**不是完整模型上下文或费用硬上限**。连接和清理也可能增加墙钟耗时。后续应先定位默认上下文并用协议元数据评估，再比较受控小实验；本轮完成一次真实审查后没有再发起模型生成。

## 关键代码：为什么挂起创建

如果先普通启动、再加入 Job，程序可能在加入前就创建子进程。因此 Windows 顺序是：

```python
process_handle, thread_handle, pid, thread_id = _winapi.CreateProcess(
    executable, command_line, None, None, True,
    0x4 | subprocess.CREATE_NO_WINDOW, env, cwd, startup,
)
kernel.AssignProcessToJobObject(job, process_handle)
kernel.ResumeThread(thread_handle)
```

这是实际实现的缩写。0x4 是 CREATE_SUSPENDED。真实代码检查所有返回值，加入失败就终止尚未执行的进程，不降级为不受管理的启动。CPython 的 Windows 标准库内部创建入口用于保留主线程句柄；公开 ctypes Job API 管理组生命周期。CPython 3.14 已实测，3.11 路径仍需 CI 实跑。

Job 配置 KILL_ON_JOB_CLOSE、不启用 breakaway。退出时查询 ActiveProcesses=0，并等待主进程句柄完成，最后关闭本进程的管道与文件。它管理通常由该组进程创建的子孙进程，不提供文件访问沙箱，也不覆盖外部系统服务另行启动的进程。

实际检查包括父进程正常退出但子进程仍存活，以及父/子/孙都已开始后取消。对子孙先取得指向其进程对象的同步句柄，再验证退出，避免用可能复用的 PID 猜测。第一次检查发现 ActiveProcesses 归零后文件句柄仍有退出竞态，补充主进程等待后通过。

## 协议终态与保存

```python
if params['turn']['status'] != 'completed':
    raise RpcError('Review did not complete')
review = json.loads(final_text)
verify_package(package_dir)
receipt = save_review(package_dir, review)
```

只有收到最终文字不算通过，部分输出、断线、interrupted/failed、格式错误、位置错误、包被改动、关闭失败都不能返回 review_saved。原始格式错误文本保留，方便修复契约；不会把模型输出直接当作命令运行。

本轮使用 thread/start + turn/start/outputSchema，让最终结果遵循已有审查契约；没有冒称使用内置 review/start 模式。独立审查包以文本内联方式提供；当前拒绝二进制和过大包，完整代码仓库的受控工具审查仍待实现。只读设置来自服务回报与本轮无写工具事实，不代表本轮已进行恶意权限逃逸测试。

## 开发中实际修复的问题

1. `-c mcp_servers={}` 会合并现有设置，不能据此证明服务全部关闭。第一次尝试在生成前停止，turns_started=0。
2. 该版本 CLI 的点路径覆盖没有按预期处理带引号的键，配置失败。第二次仍在生成前停止，turns_started=0。改为受格式检查的服务名，逐项 enabled=false，再读取有效配置核对，成功后才开始唯一一次审查。
3. Python 模拟协议服务默认 GBK 解码导致中文乱码；模拟器显式启用 UTF-8。真实 Rust 服务已使用 UTF-8。
4. 同步 stdin 写入可能卡住请求期限，改为有界写队列和独立工作线程；“服务不读取大请求”的实际进程检查验证能超时关闭。
5. 关闭失败不得沿用先前设好的成功状态；预检和审查结果均显式改为失败，并增加故障注入检查。

## 运行入口

元数据预检，不发起模型生成：

```powershell
.venv/Scripts/python.exe -X utf8 -m examples.codex_preflight
```

一次真实审查会消耗已登录 Codex 的额度，需显式执行：

```powershell
.venv/Scripts/python.exe -m agent_review_loop review-codex --package <审查包绝对路径> --output <新运行目录绝对路径>
```

工作台以后自动调用同一函数。默认 unittest/CI 不发起真实模型调用。原有 run_process 仍保留其直接子进程语义；新的真实 App Server 适配明确使用 ProcessTree。

## 女娲方法技能的实际作用

项目内 `.agents/skills/` 下已生成 Mitchell Hashimoto 和 Simon Willison 两份快速技能，分别包含6个/7个已核对来源及自包含研究记录。采用的具体方法是：做可演示增量、把重复错误变为反馈、验证实际产物、区分声明与证据。它们用于补强故障注入、子孙退出、协议终态和成本记录，没有代替官方协议或实际测试，也不是本人参与审查。

两份技能的女娲结构检查通过；skill-creator quick_validate 也通过。为了运行后者，只在忽略目录安装 PyYAML 6.0.3 wheel，没有增加产品依赖。完整六维调研、人格盲测与外部独立代码审查均未完成。

## WorkBuddy 的下一步

用户最新澄清（2026-10-25）：尚未创建第三方应用，此前“已创建”的记录作废。当前缺少开发者应用及所需权限，不再将缺口描述为仅差 Client ID/redirect_uri。`workbuddy-authorize` 可生成官方授权入口和本地 state 记录；交换函数先检查回调位置、重复参数及 state，再请求令牌。Client Secret 和访问令牌不进入聊天、Git 或报告。目前尚无真实授权或消息发送，不声称已经接通执行方。

再次核对[第三方应用文档](https://open.workbuddy.cn/docs/third-party-app)与[Buddy 应用文档](https://open.workbuddy.cn/docs/buddy-app)：平台存在应用类型、权限申请和审核流程；硬件接入与 Buddy 应用不能简单当作普通个人应用免审核注册。本项目当前账号能否申请并获得本地助理权限尚未验证，不要求用户先搭建整套行业应用，也不把平台批准作为核心开发的前置条件。WorkBuddy 保持候选适配；后续优先验证正式、本地可调用的 Agent 入口和通用交接流程，不擅自把另一个 CLI 或直接模型 API 标记成 WorkBuddy。

在线状态接口即使返回 true，也仅表示本地助理在线。后续还需用只读合成任务确认指定目录、结果关联和完成/停止语义，之后才能执行真实修改。

## 参考

- [官方 Codex App Server](https://learn.chatgpt.com/docs/app-server)：生命周期、turn/start/outputSchema 与完成事件。
- [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)：组继承、终止与边界。
- [Microsoft 创建标志](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)：挂起创建。
- [WorkBuddy Open API](https://open.workbuddy.cn/docs/openapi)：OAuth 和本地助理接口。
