# 第15课：把审查问题自动交回执行者

Rondo 0.12.0 在现有执行流程中增加一次返修。没有新建调度框架，仍使用 ExecutionJobs、ReviewJobs、SQLite、原生 WorkBuddy 驱动和现有 MCP 领取/提交。

## 1. 开源组件实际用在哪里

从 `badgids/pi-pr-repair-loop` 固定提交直接移植两个纯函数到 [`repair.py`](../../agent_review_loop/repair.py)：`path_matches_contract` 判断文件是否匹配精确路径或目录前缀，`unauthorized_changed_files` 找出范围之外的改动。诊断、复现、聚焦修复及报告检查的提示结构也作了适配。来源、blob SHA、MIT 声明见[REPAIR-NOTICE](../../integrations/workbuddy/REPAIR-NOTICE.md)。

Aider 的反馈循环提供了另一个可借鉴的规则：达到修改轮数就停止。Rondo 使用自己的持久作业实现这个规则，固定最多一次返修，不依赖 Aider 运行时。Patchloop 的 PR 自动化也读过源码，但它的 GitHub 轮询、发布和额外状态系统不适合当前本机需求，没有加入。完整[调研记录](../research/2026-10-26-repair-source-survey.md)区分了直接移植、行为借鉴和未采用内容。

## 2. 为什么返修不是重新创建任务

第一次执行后任务已经 submitted，不能直接再领取。简单改成 ready，再创建作业，会留下一个时间窗口：如果作业创建失败，任务却已被重新开放。

这次在原有 ReviewJobs 的作业创建事务中增加一个小钩子：

```python
metadata = self._prepare_start(db, task, repo, request_id)
# 同一个 SQLite 事务内 INSERT execution_jobs，写入 metadata。
```

ExecutionJobs 的钩子核对最新审查、当前代码、剩余次数后，才更新任务状态和版本。任何一步失败，整个事务回滚。旧的提交不删除，`get_task` 改为按 rowid 倒序读取最新提交，历史仍在 submissions 中。

返修标识固定为 `repair-<source-review-job-id>`。相同来源重复请求返回原作业；页面恢复不会获得一个新的修改机会。

## 3. 自动交接在哪里发生

读 [`execution.py`](../../agent_review_loop/execution.py) 的 `_continue_after_review`：

```python
if review['verdict'] == 'approved':
    details['phase'] = 'completed'
elif details['mode'] == 'repair':
    details['phase'] = 'needs_attention'
else:
    repair = self.start_repair(details['review_job_id'])
    details.update(phase='repairing', repair_job_id=repair['job_id'])
```

首次审查需要修改时才交回；返修后的审查无论结果如何，都不会再进入下一轮修改。检查失败、取消、派发不明确、未产生代码改动、范围外改动、过期审查及次数耗尽也都会停止。

源审查的全部 findings（最多20项）会进入固定返修上下文，不只使用 UI 当前展示的一页。返修只允许改动审查定位的文件，执行结束后比较输入/输出 Git tree，范围外修改保留并报告，停止自动审查。这个检查不是文件系统沙箱；不声称它能在写入前阻止 WorkBuddy 的所有操作。

## 4. 实际验证到什么程度

离线检查使用真实 SQLite、Git 工作区和作业管理，模型部分明确使用 fixture：验证首次审查后自动交回、只返修一次、重复请求复用、保留两次提交并读取最新提交、复查仍拒绝时停止、没有进展或范围外改动不再消耗审查额度、代码过期不重开任务。

真实本机验收独立进行：任务 #2「Rondo 返修验收：合并全部连续空白」。初始代码是明确预埋的缺陷样例，不是 WorkBuddy 的首次实现。原始代码的基本测试通过，但 `.replace(" ", "-")` 不能合并连续空白、tab 或换行。

- 真实 Codex 审查 `42cea60ea5a947b9bff0db78a10c358a` 返回 `changes_requested`，提出1项具体问题。
- 显式发起原生返修 `ce26886b40274f6697775f5e98af0f2e`，WorkBuddy 使用 `deepseek-v4.1-flash` 复现并只修改 `slug.py`，通过 MCP 提交。
- Rondo 自动创建复查 `d6e3f4fb87b4473393162e1938a868c9`，固定副本的2个原有测试通过，真实 Codex 返回 `approved`。
- 独立运行2个连续空白/纯空白回归断言通过，最终快照新鲜度为 `current`。额外验收命令使用 `python -B`，避免生成新的未跟踪字节码改变工作区。

这次真实验证覆盖“真实审查问题 → 原生返修 → 自动真实复查”。从首次执行自动交回返修的分支另有离线验证，没有把预埋样例说成 Agent 实际写出的缺陷，也没有再次调用模型制造一个缺陷。

原始证据：忽略于 Git 的 `.agent-review-loop/repair-live-657f3bd068/evidence.json`，附验收前数据库备份。普通测试108项通过；前端状态断言20项；lint、typecheck、build及零模型 Electron smoke 通过。真实验收使用2次 Codex 审查和1次 WorkBuddy 返修；未报告的费用仍记为未知。

## 5. 用户界面与当前边界

沿用 Jean/T3 WorkLog：显示返修结果、原生会话和来源审查；完成后摘要默认折叠。已保存作业显示执行/返修与审查计数，两次审查用完时禁止再点新审查。历史作业为有界元数据，不是假装完整聊天回放。

自动交接需要当前 Rondo 服务持续运行。关闭时停止未完成作业；重启恢复只读取记录，不自动重放付费调用。旧任务或尚未发生的交接可从当前审查显式发起唯一一次返修。需要扩大改动文件范围的复杂修复、本机其他 WorkBuddy 版本、跨平台和独立安装包尚待后续工作。
