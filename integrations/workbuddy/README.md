# WorkBuddy 本地接入

不需要 Open API 第三方应用。WorkBuddy 作为任务入口，主动调用本地 stdio MCP；本服务后台启动 Codex 审查，WorkBuddy 查询并读取结果。

## 本机准备

在已安装本项目的虚拟环境中运行 `python -m examples.prepare_workbuddy`。脚本读取 `~/.workbuddy/mcp.json` 并生成备份和合并后的 JSON，只增加 agent-review-loop，遇到同名不同配置拒绝覆盖；脚本不写 WorkBuddy 原文件。每次输出使用独立目录，生成内容不加入 Git。

在 WorkBuddy「专家·技能·连接器 → 连接器 → 自定义连接器 → 添加 MCP」的 JSON 编辑器，合并生成条目后保存。Windows 本机配置使用既有 Python 解释器、明确 cwd/db/review-root 和 Codex 原生可执行文件；更新 Codex 后旧可执行路径失效时重新生成/核对配置。保留其他连接器。

首次连接会出现本地 MCP 信任提示。由用户在 WorkBuddy 完成该操作；文档或文件存在都不代表已启用。0.7服务提供13个工具，新开发任务从start_task开始，以get_task_context恢复、start_task_review交接审查；原10个工具保留。已有连接需重新加载服务才发现新增工具。

当前 `review-handoff/SKILL.md` 为接入说明，位于 skills 子目录。需要由实际客户端按其技能入口导入或引用，不声称放进仓库就自动可见。它不含密钥。

## 第一项真实客户端验收

2026-10-25本机已完成：用户信任后显示10/10工具启用，使用界面所示Deepseek-V4.1-Flash调用 list_tasks(limit=1, after_id=0)。已展开执行轨迹核对工具与参数，最终返回空列表，与本地数据库一致；未创建任务或启动Codex审查。客户端显示完成25秒、消耗0.48（计量单位未知）。详细证据及限制见[第6课后续记录](../../docs/learning/06-async-review-mcp.md#8-后续真实-workbuddy-只读连接验收)。

之后再用用户明确指定的合成仓库验证一次后台审查。普通 unittest 和 async_review_demo 使用明示 fixture 后端，不调用真实模型，也不能代替真实 WorkBuddy 验收。

0.6新增可选--check-config启动参数：由本机配置检查命令，失败时不进入Codex。配置方式、限制和零模型演示见[第7课](../../docs/learning/07-snapshot-checks.md)。已有连接需使用相应启动参数并重启服务才采用检查配置；本轮未替用户修改全局连接或验证WorkBuddy中的新检查流程。

官方依据：[连接器文档](https://open.workbuddy.cn/docs/connector)。它支持本地 stdio，建议普通请求在30秒内响应；本服务因此将长审查放到后台。
