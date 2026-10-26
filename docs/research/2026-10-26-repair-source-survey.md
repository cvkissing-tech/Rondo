# Rondo 返修环节的源码借鉴

本次目标是现有本机原生执行流程的一次返修，不增加云服务、账号、GitHub PR 发布或完整 Agent 框架。2026-10-26 通过已连接 GitHub 工具搜索并读取以下固定提交的源码。

| 项目 | 固定提交与实际阅读 | 采用方式 |
| --- | --- | --- |
| badgids/pi-pr-repair-loop | `4c417231160f00d47c074c0510eca888c3c1181f`：src/policy.js、prompts.js、state.js、LICENSE | 将路径契约两个纯函数直接移植为 Python；按具体 findings 诊断、修复、报告验收的提示结构作必要适配。保留 MIT 声明。 |
| Aider-AI/aider | `5dc9490bb35f9729ef2c95d00a19ccd30c26339c`：aider/coders/base_coder.py，尤其933–944行 | 借鉴有上限的反馈修改循环；Rondo固定最多一次返修，保持两次审查预算，不引入Aider运行时。 |
| ZhuLinsen/patchloop | `03eb09b2248b60be2205dee6db33e2a80f20aae6`：目录、openreview/agent/core.py | 作为PR自动化对照；当前不需要其GitHub轮询、发布与额外状态系统，没有复制代码。 |

Rondo 继续直接复用上一轮的原生 RPC、WorkBuddy 会话创建/激活、SQLite 领取与提交、ReviewJobs 固定快照与检查。核心新增点：在同一 SQLite 事务中恢复任务可领取状态并创建返修作业；旧提交保留，读取最新提交；按审查来源生成稳定的 `repair-<review-job-id>` 标识。

路径契约来自审查定位的文件，执行后核对实际改动。它可以阻止范围外改动自动进入下一轮审查，但不是文件系统沙箱；范围外文件保留用于用户检查，不自动回滚或删除。需要修改其他文件时，本轮停止并说明。原生权限仍由 WorkBuddy 管理。

完整来源、blob SHA 与许可证见 [`REPAIR-NOTICE.md`](../../integrations/workbuddy/REPAIR-NOTICE.md)。
