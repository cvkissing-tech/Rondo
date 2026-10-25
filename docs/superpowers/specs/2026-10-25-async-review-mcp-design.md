# WorkBuddy 主动调用的异步审查

用户批准继续既定本地 MCP 路线。无需第三方 OAuth 应用；WorkBuddy 是任务入口，本服务创建固定代码包并调用既有 Codex 适配。既有任务工具保留，真实 WorkBuddy 导入和模型行为单列验收。

## 接口

- start_review(task_id, repo, base_ref, request_id)：快速持久化请求并返回 job_id，后台准备快照和审查。repo 必须是绝对路径；task 来自既有数据库。不接收可执行命令或自选模型。调用会消耗 Codex 额度。
- get_review_status(job_id)：短状态、快照标识、是否请求取消。不返回原始提示、账号或日志。
- read_review(job_id, limit=5, after_index=0)：成功后验证包、记录和当前代码，分页读取意见、verdict、freshness、检查与实际用量。未知、过期或没有检查不被当成通过。
- cancel_review(job_id)：请求停止并返回 cancelling；实际完成清理后才进入 cancelled。已经终结的任务不被覆盖。

请求幂等以 task_id + request_id 为键，同键不同参数拒绝；同键重试返回原 job_id。一个数据库最多一个 preparing/running/cancelling；一项任务最多两次尝试，失败/取消也计入。没有自动排队、重试、模型切换或预算重置。

## 持久化与运行

SQLite schema 1→2 事务迁移，新增 review_jobs 表和唯一活动审查索引，保留原任务/领取/提交。日志和包放在应用拥有的目录；默认 ~/.agent-review-loop/runs/<数据库路径哈希>/，可以通过 serve --review-root 显式指定。路径不在被捕获的仓库内部。

每个后台审查持有一个 OS 文件锁，锁文件路径与该 job 绑定并存库。Windows 使用 msvcrt，POSIX 使用 flock。不用 PID 或超时猜进程死亡；另一个服务实例只有成功取得锁才能把失去所有者的活动记录标为 interrupted。不会自动重放。原生 Job Object 在 Windows 服务进程被终止时关闭并终止通常的子孙进程；这不是 POSIX 硬终止清理的已测保证。

后台线程负责快照/审查，服务生命周期关闭时请求取消并等待退出。取消在 Git 准备阶段按阶段检查，在 Codex 协议等待期间按短间隔检查；尽量发送 turn/interrupt，再关闭受控进程组。中断请求失败不被包装成协议已确认中断。任务状态与模型返回、进程退出、包 freshness 分开。

## 范围与验收

本轮不默认发起真实生成。使用测试专用入口运行模拟审查后端，标记 backend=fixture，实际启动两个 MCP 服务进程验证：快速返回、跨服务幂等、并发争用、跨服务取消、完成/失败、服务退出恢复、服务突然终止后 interrupted、旧包过期和预算。模拟器不能在正式 CLI 参数中冒充真实 Codex。

WorkBuddy 安装材料包含本机配置和简短使用 Skill；生成文件不等于导入、导入不等于工具被正确调用。实际客户端接入尽量自主验证，有真实阻碍时报告具体入口与现状。
