# 第8课：一个入口开始任务

0.7.0把已经存在的任务与Git工作目录能力串成直接可用的入口，不新增框架和依赖。

## 用户现在怎么用

在已连接新版MCP的Agent对话里提出：

> 用agent-review-loop在我指定的Git项目开始任务：说明修改要求和验收条件。调用start_task准备工作目录，在返回的workspace中开发；完成后用start_task_review提交审查。

Agent只需保存task_id。换会话调用get_task_context即可恢复需求、目录、基础提交、已有任务状态和下一步，不必搬运全部聊天历史。开始、恢复都不调用模型；明确发起审查才进入既有检查/Codex流程。

工具流程：

```text
start_task → 返回task_id与workspace
    ↓ Agent使用自己的文件/终端工具实现需求
get_task_context(task_id) → 随时恢复
    ↓ 完成并停止写入
start_task_review(task_id, request_id) → job_id
    ↓
get_review_status / read_review
```

返回路径用于Agent的文件与终端工具，不自动切换WorkBuddy窗口、编辑器目录或启动另一个桌面应用。

## 具体复用了什么

- 独立工作目录：直接复用snapshots.prepare_workspace，其底层是[Git原生worktree](https://git-scm.com/docs/git-worktree)，无需再引入GitPython或复制完整仓库。工作目录拥有自己的HEAD/index，共享仓库对象库；不是权限沙箱。
- 任务：复用TaskStore，抽取_create_task让任务记录与开始回执在同一SQLite事务提交。新增一张小表task_launches，schema1/2增量迁移到3，原任务与审查保留。
- 工具接口：继续使用已经安装的官方MCP SDK。新增三个工具，不更换协议、不搭建Web服务。
- 审查：直接调用既有ReviewJobs，配置检查、预算、意见和过期处理沿用原实现。

## 关键代码

task_launch.py的核心连接是：

```python
workspace = prepare_workspace(Path(repo), directory, base_ref)
task_id = self.store._create_task(db, title, instructions, acceptance)['task_id']
```

同一事务保存request_id、内容指纹和任务上下文；相同请求重试返回原任务，不重复准备目录。不同要求复用同一request_id会冲突。task.json保存在工作目录旁边，记录任务与需求，不混入要审查的代码。

start_task_review从保存的上下文取workspace/base_commit，再调用已有审查入口；执行Agent无需重新猜测路径与基础版本。默认HEAD只在开始时解析成固定提交，后来源分支移动不改变任务基线。

## 这一版的取舍

默认从提交建立工作目录；源目录未提交的改动保持原样，不会自动复制。基于现有快照能力，子模块、LFS、自定义filter等限制保持不变。工作目录为detached HEAD，工具不自动提交或合并成果。

本机单用户的开始操作用SQLite写事务串行化Git准备；大型仓库可能让其他写操作等待。当前不增加后台开始队列。中途退出可能留下未完成目录；目录保留，重试报TASK_START_INCOMPLETE，不自动删除或覆盖。数据库事务不等于文件系统事务。

新版服务提供13个工具。已有WorkBuddy连接需重新加载MCP服务后才出现新增工具；本轮不操作其界面、不声称客户端已经加载0.7.0。

本轮必要回归一次通过：本机Windows/Python3.14共89项，81.834秒；新增启动/重试/CLI/迁移用例及一条真实MCP“开始任务→修改独立目录→按任务审查”用例，后者使用明示fixture审查器。安装已更新0.7.0，pip check与Skill结构检查通过。没有新增模型调用；远程CI未运行。
