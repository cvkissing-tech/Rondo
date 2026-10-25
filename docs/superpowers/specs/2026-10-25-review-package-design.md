# 固定代码快照与审查包

这是用户已批准的继续开发路线的第一项交付，沿用单人、本地、Python 3.11+ 的约束。复用 Git 命令和 Python 标准库；不新增模型请求、网络服务或前端。

## 方案与边界

采用临时 Git index + write-tree 捕获工作目录，再从 Git blob 导出基础版本与目标版本。相比复制活动目录，它能提供确定的内容标识；相比创建临时提交，不需要改变分支历史。保留用户 HEAD、分支、真实 index 和未提交内容。Git 对象库会新增无分支引用的 tree/blob，但审查包自带内容，不依赖对象永久保留。

调用方在捕获前应停止写入。用两个独立临时 index 连续捕获并比较 tree，发现变化拒绝交接；这不是跨文件的操作系统原子快照。导出的副本来自已捕获 tree，之后源目录变化不会改变副本。

包含新增、修改、删除、重命名对应的内容变化和二进制。按 Git 规则排除未跟踪的忽略文件；已经跟踪的文件不会因 .gitignore 排除。首版明确拒绝子模块、符号链接/Windows reparse point、稀疏工作区和自定义 clean/smudge filter，不静默漏掉。只支持能跨 Windows 处理的 UTF-8 相对路径；每个版本最多 5000 个文件、基础加目标共 100 MiB Git blob 内容，工作目录在写入 Git 前也检查 100 MiB 上限，超限失败。Git LFS 的 filter 因此也不支持。

## 产物和接口

- `prepare_workspace(repo, output_dir, base_ref='HEAD')`：解析并固定基础提交，创建 detached worktree；原目录允许有未提交改动，工作区只包含指定基础提交。输出目录必须新建且位于源工作目录之外。保留工作目录，不自动删除、不自动提交。
- `create_review_package(repo, base_ref, task, output_dir)`：任务取现有 TaskStore 的 task_id/title/instructions/acceptance，不复制领取凭据或提交者的叙述。生成 manifest.json、changes.patch、before/、after/ 和可读说明。manifest 最后写入，缺少它的目录不是完成的包。
- `verify_package(package_dir)`：检查内容标识、文件集合、逐文件 SHA256 和差异文件；发现文件被改、缺失、新增或链接时拒绝使用。
- `save_review(package_dir, review)`：验证审查结构与位置并保存幂等历史记录。审查必须关联正确 snapshot_id；意见含文件、before/after、行号或文件级定位、优先级、触发条件、影响和证据类型。字段有长度/数量上限。不会执行意见中的文字。
- `review_status(package_dir, review_id, repo=None)`：验证包和审查记录，重新捕获同一 Git 仓库的当前内容。freshness 为 current/stale/unchecked；只有 approved 且 current 才返回 review_approved=true。它不表示任务最终接受或检查通过。没有 repo 时不得报告当前版本已通过。

manifest 的 snapshot_id 是除标识自身以外规范 JSON 的 SHA256，包含任务要求、基础提交、目标 tree、文件元数据、差异 SHA256 和检查状态。基础和目标副本都可供审查定位。审查包是本地可写文件，完整性校验用于发现变化，不是签名或恶意用户防护；Git 工作目录不提供进程权限隔离。

## 本轮检查与后续接口

本轮不运行任意项目测试命令，manifest 明确记录 checks.status=not_run。现有 runner 尚不承诺真实 Agent/测试命令的整棵进程树取消；运行器验收后再添加绑定快照的检查执行。不得把没有检查包装成通过。

CLI 新增 workspace/package/record-review/review-status，复用现有任务数据库读取任务。包和审查历史持久化为本地文件；本轮不扩张 SQLite schema 或 MCP 工具集。恢复只读取历史，不自动重放模型请求；完整工作流中断恢复仍待后续实现。

验收使用一次性 Git 仓库和合成任务，覆盖暂存区/分支不变、新增/删除/二进制、忽略文件、固定副本、内容篡改、错误意见定位、重新读取历史、新代码使审查过期、未知新版本状态、越界输出/路径和不支持文件类型。离线自动演示完成建工作区→合成改动→审查包→合成审查→新改动→过期，无需用户切换 Agent 或复制任务编号。

## 参考

- [Clodex workflow](https://github.com/9thLevelSoftware/Clodex/blob/acde0309a15489e22929517b05bf3d7adb1afeac/clodex/workflow.py)：借鉴差异绑定与审查失败不放行；不复制其全流程。
- [Emdash worktree](https://github.com/generalaction/emdash/blob/e21cd3d84fd025546bdd4c4aef879336c7a91a20/packages/core/src/runtimes/workspace-registry/node/create-worktree.ts)：参考分阶段创建和失败行为。
- [Git write-tree](https://git-scm.com/docs/git-write-tree)、[read-tree](https://git-scm.com/docs/git-read-tree)、[cat-file](https://git-scm.com/docs/git-cat-file)：实际运行能力由原生 Git 提供。
