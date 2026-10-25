# 第 4 课：让审查对应确定的代码版本

本轮交付 0.3.0：独立任务工作目录、代码审查包、结构化意见验证、历史记录和过期判断。开发使用现有 Python、Git 和标准库，没有增加运行依赖。真实 Agent 尚未接入。

## 先看实际行为

在项目根目录运行一条命令：

```powershell
.venv/Scripts/python.exe -X utf8 -m examples.review_demo
```

它自动创建合成 Git 仓库和任务记录，随后完成：

```text
创建独立工作目录
→ 写入一个故意的减法错误和一个中文新文件
→ 保存审查包
→ 写入预先准备的审查意见
→ 模拟修复
→ 发现旧审查过期
→ 保存新快照与合成批准
→ 再增加一个文件，批准随即失效
```

所有审查内容都是固定实验数据，不是模型生成的结论；修复也是演示脚本执行，不代表已经实现真实用户选择或 Agent 修复调度。原始合成仓库的文件保持不变。末行显示 `model_calls: 0`、`real_agents_verified: false` 和证据目录。

本轮实际演示目录：`.agent-review-loop/review-demos/5363cba966e84df48a487bc8c045211d/`。包 1 的 after/calculator.py 仍保留减法版本；工作目录中的同名文件已修复。这就是“固定交接内容”的可见证据。

## 为什么不能只发送 git diff

普通 git diff 可能漏掉新文件。即使发送了完整差异，审查者继续读取正在变化的源目录，也可能读到另一个版本。因此包同时包含：

```text
review-1/
  manifest.json       任务、版本、逐文件信息、差异哈希、检查状态
  changes.patch       包含二进制变化的差异
  README.txt          审查入口说明，也在校验范围内
  before/             完整基础版本，包括后来删除的文件
  after/              完整目标版本，包括新文件
  reviews/<id>.json   经过结构验证的审查历史
```

`before/after` 来自 Git 对象中的内容，遵循 Git 文本规范化规则；它们不包含 .git，也不包含未跟踪且被忽略的文件。自定义 filter、LFS、链接/reparse、子模块、稀疏工作区在首版明确拒绝。每个版本最多 5000 文件，两个版本的 Git blob 合计不超过 100 MiB。

## 关键代码 1：保护用户的暂存区

Git 的 index（暂存区）记录下一次提交准备包含的文件。用户可能已暂存版本 A，同时工作目录已经变成版本 B；我们的捕获应读取 B，又不能把用户暂存的 A 改掉。

`agent_review_loop/snapshots.py` 为捕获单独指定一个临时 index：

```python
env['GIT_INDEX_FILE'] = str(index)
```

然后在这个临时 index 上运行：

```python
_git(repo, 'read-tree', 'HEAD', index=index)
_git(repo, 'add', '-A', '--', '.', index=index)
tree = _git(repo, 'write-tree', index=index).decode().strip()
```

read-tree 先载入基线，add -A 捕获实际工作文件及删除，write-tree 生成确定的目录树对象。它不创建提交，不移动分支。Git 对象库会增加 tree/blob；原真实 index、HEAD 和文件保留。

测试故意让暂存区与工作文件不同，捕获前后逐字节比较真实 index，并验证包内是工作目录内容。调用 Git 时也清除继承的 GIT_DIR、GIT_INDEX_FILE 等重定向变量；本次命令禁用仓库 hooks 和 fsmonitor，不改全局配置。

## 关键代码 2：内容标识与固定副本

文件通过 Git cat-file --batch 一次批量读取，先写磁盘缓冲，避免为每个文件启动一个进程。基础和目标都从确定的 tree 导出，不从活动工作目录复制。

包清单包含文件 SHA256、字节数、文本行数和二进制标记。清单自身再生成 snapshot_id：

```python
manifest['snapshot_id'] = digest(canonical(manifest))
```

canonical 使用固定排序、固定分隔符的 UTF-8 JSON；同样的清单得到同样的标识。任务要求、基础提交、源仓库身份、文件与差异信息均包含在内，不仅是一个 diff 哈希。manifest 最后写入，异常中断的半成品不会通过验证。

调用方须在捕获前暂停执行者写入。我们用两个全新的临时 index 连续捕获并比较 tree，检测到变化就拒绝；它仍不是跨文件的系统原子快照。快照副本是可写文件，前后校验负责发现变化，不等于提供只读权限隔离。

## 关键代码 3：验证意见的位置

`agent_review_loop/reviews.py` 要求每条意见提供：

```json
{
  "id": "F1", "path": "calculator.py", "side": "after", "line": 2,
  "priority": 1, "trigger": "调用 add(2, 3)",
  "impact": "任务要求求和，代码却执行减法",
  "evidence": "固定合成样例的静态检查，未执行项目测试",
  "evidence_kind": "static"
}
```

意见必须关联该包的 snapshot_id，文件必须在对应 before/after 中，行号必须落在文本范围。删除的代码定位到 before；二进制或文件级意见使用 line=null。布尔值 true 虽在 Python 中属于 int 的子类，也不能被误当作行号 1，因此检查用 `type(line) is int`。

最多 20 条意见；优先级 0–3；证据类型 reproduced/static/not_run。未知字段、错误位置、重复 ID、空意见却要求修改等结构矛盾会被拒绝。证据类型只记录审查者的声明，工具并未据此证明缺陷已复现。

历史记录以规范内容的 SHA256 命名，相同内容重复保存得到同一 review_id。重新启动程序后仍可读取，不依赖进程内字典。

## 关键代码 4：不把未知状态算作通过

```python
freshness = 'current' if current_tree(repo) == manifest['target_tree'] else 'stale'
review_approved = freshness == 'current' and review['verdict'] == 'approved'
```

没有提供当前仓库时，freshness 是 unchecked，review_approved=false。提供了仓库，还需确认它属于同一个 Git 对象库，不能用另一个相似目录冒充。每次状态查询先检查包内容和审查记录的完整性。

current 表示当前代码与已审查目标一致；stale 表示不同。如果将代码完全恢复到同一个 tree，原审查可再次对应这一内容。这个状态是按内容重新判断，而不是不可逆的时间标签。

review_approved 只是审查者对该代码版本的意见，不等于项目检查通过或用户最终接受。本轮没有运行目标项目的测试，checks.status 明确为 not_run。任意项目检查和真实 Agent 的整棵进程树取消尚未验收，因此不把普通 runner 包装成已经安全完成这部分。

## CLI 与学习实验

`python -m agent_review_loop --help` 可查看 workspace/package/record-review/review-status。package 从既有 TaskStore 获取任务要求，不复制领取 token、owner 或执行者的提交叙述。命令的组合以后由运行层完成；当前的一键演示已经自动完成组合，无需在应用间手传任务编号。

可以做三个小实验：

1. 打开演示包的 after/calculator.py，对照工作区文件，观察它们属于不同版本。
2. 修改包内任意源码，再读取审查状态，预期 PACKAGE_CHANGED；不要把包的可写属性当成可信任。
3. 查看 reviews 中的意见，改错行号后重新提交，预期 INVALID_REVIEW；修改已有记录后读取其原 ID，预期 INVALID_RECORD。

这些实验只对自带合成目录操作；保留原始记录便于比较。

## 验收与未完成范围

2026-10-25 本机 Windows、Python 3.14.7、Git 2.56.0.windows.1 实测：全套 39 项检查通过，37.307 秒。其中原进程/存储/MCP 共 19 项，快照 12 项，审查及新增 CLI 8 项。task_demo 双协议与重启检查通过；review_demo 一键流程通过；pip check 未发现依赖冲突。CI 已加入 review_demo，但尚未在 GitHub 运行；Linux 和 Python 3.11 未实测。

本轮新增真实 Git 集成检查，而不是只模拟 Git 命令返回值：暂存区保护、新增/删除/二进制、忽略规则、export-ignore 不漏文件、工作区隔离、包篡改、非法路径/类型、体积限制、变化检测、审查位置、历史、跨仓库拒绝及 CLI 从外部目录运行。

运行全套检查：

```powershell
.venv/Scripts/python.exe -X utf8 -m unittest discover -s tests -q
.venv/Scripts/python.exe -X utf8 -m examples.task_demo
.venv/Scripts/python.exe -X utf8 -m examples.review_demo
.venv/Scripts/python.exe -m pip check
```

自查按单人本地使用情形，补充了超大未跟踪文件在 Git add 前拒绝、命名 Git 超时错误、错误 UTF-8 审查文本和跨目录 CLI 检查。本轮不是独立模型或外部人员审查。

未完成：真实 Codex/WorkBuddy、模型/Skills/权限继承、绑定快照的项目检查、用户意见选择与真实修复调度、工作流中断恢复、桌面端、GitHub 发布与 CI 实跑。acpx Windows 关闭问题仍保留在第 3 课，不因本轮离线检查通过而宣称已修复。下一个开发重点是运行适配和真实执行入口验证。
