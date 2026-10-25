---
name: review-handoff
description: 在 WorkBuddy 中按用户要求完成代码后，通过本地 agent-review-loop MCP 发起一次独立 Codex 审查、查询结果和处理用户选择的修复。不要求 WorkBuddy 第三方 OAuth 应用。
---

# 本地执行与审查交接

只有用户明确要求对指定实验仓库执行开发并审查时才启动本流程。start_review 会消耗已登录 Codex 的额度；普通连接检查只调用 list_tasks，不启动审查。

1. 确认用户的Git仓库、具体需求和验收要求，调用start_task(repo,title,instructions,acceptance,request_id)一次准备任务与独立工作目录。保存task_id，使用返回的workspace；默认从HEAD提交开始，不复制原目录未提交改动。请求重试保留相同request_id/内容，不猜测目录。
2. 换会话或需要恢复时调用get_task_context(task_id)，取得目录、基础提交、需求和下一步。需要时按原工具约定领取、续期、提交执行报告。领取token不写进提示、公开日志或审查意见。
3. 在任务目录完成用户要求的改动后停止写入。0.6服务若由本机启动配置指定检查，会在固定包副本中执行，并将结果绑定版本；未配置为checks.not_run，不能改写成通过。执行方自己运行的检查另行说明，不能替代服务记录。
4. 对start_task准备的任务，调用start_task_review(task_id,request_id=本次审查的稳定唯一标识)，服务使用保存的目录与基础提交。保留返回job_id，回复丢失时复用相同request_id。旧的手动任务才使用start_review显式指定repo/base_ref，不用新建请求来等待。
5. 通过 get_review_status 查询，建议间隔约2秒，遇到等待可逐步放缓。preparing/running/cancelling 都不是成功终态。不要用输出安静或窗口标题猜状态。CHECK_FAILED表示未启动审查；有check_evidence_path时，可按需少量读取其中result.json与日志（先最多约4KiB），报告真实原因，不自动重发付费请求。
6. succeeded 后调用 read_review，默认每页5条，使用 next_after_index 读取剩余意见。检查 freshness：stale 表示代码已变化；review_approved 不等于项目检查通过或用户最终接受。
7. 展示有依据的意见，由用户选择是否修复。用户选择后，在原任务目录进行一次修复；需要复查时使用新 request_id。每任务最多两次尝试，失败和取消也计入；预算用尽、失败、interrupted 或限额后停止并保留记录，不创建新任务绕过预算，不静默切换模型。
8. 用户要求停止时调用 cancel_review，并继续查询到终态。收到 cancelling 只表示取消请求已保存，不表示实际运行者已停止。

本技能是本地 MCP 使用说明，不会替换 WorkBuddy 的模型、Skills 或登录，也不代表独立桌面端能直接控制 WorkBuddy。当前 Codex 审查只处理有界文本包，拒绝二进制/过大输入，不执行任意外部工具。只做连接检查时，不把SDK/模拟演示当作真实双 Agent 完成。
