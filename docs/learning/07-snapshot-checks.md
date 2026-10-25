# 第7课：先检查固定代码，再花额度审查

2026-10-25，版本0.6.0。本轮扩展已有后台审查链路，使用Python标准库和现有ProcessTree，不增加第三方依赖，不操作WorkBuddy界面，不调用真实模型。

## 为什么先做这一项

此前已验证共享任务、固定版本、独立Codex审查，以及WorkBuddy实际发现工具和只读调用。但manifest.checks一直是not_run，执行Agent说“测试通过”并没有成为服务验证过的事实。

按项目Hashimoto技能的方法，本轮选择一条可演示增量：固定包→真实检查→失败停止/通过后审查。按Willison技能的方法，分别验证退出码、文件完整性、进程清理和日志，不把Agent自述当证据。两套技能是公开方法的参考，不能替代本项目的实际验证，也不代表本人参与。

## 真实调用链

```text
start_review
  → create_review_package：固定需求与代码
  → run_checks：复制包，在副本after中执行本机配置命令
  → verify_package：核对副本及原包
  → bind_check_evidence：结果、日志与快照绑定
      ├─ 非passed：保存失败/取消状态，Codex调用0次
      └─ passed：沿用run_codex_review，意见属于最终snapshot_id
```

没有配置检查命令时保留not_run兼容行为；不能把它显示成通过。失败作业仍计入原来每任务两次尝试的上限；两次尝试并非两次真实模型调用，也不是token或金额上限。

## 1. 命令由本机配置决定

新增启动参数--check-config，JSON仅含argv与timeout_seconds。解释器或程序必须是绝对路径，参数为数组，不把任务文字拼成shell命令。服务启动时读取和复制配置，MCP工具不接受自选检查命令，也不自动执行仓库中的配置。

例如，用本机项目虚拟环境解释器运行一个平面Python实验项目：

```json
{
  "argv": ["C:/path/to/project/.venv/Scripts/python.exe", "-m", "unittest", "discover", "-s", ".", "-p", "test_*.py"],
  "timeout_seconds": 30
}
```

这是格式示例；替换为真实解释器绝对路径，并把本机配置保存在忽略目录。serve/config可以传入该JSON的绝对路径。config只生成连接配置，不读取该文件、不启动程序；serve才校验和载入。启动后修改JSON不会改变当前进程已固定的配置，需重启服务。

配置身份加入请求指纹。换检查命令后用同一个request_id启动会得到IDEMPOTENCY_CONFLICT，不能把两个不同操作当同一次重试。

## 2. 为什么在副本中检查

checks.py先复制完整审查包，再以workspace/after为工作目录启动受控进程：

```python
shutil.copytree(package, workspace)
verify_package(workspace)
process = ProcessTree(config['argv'], workspace / 'after', stderr_path, env=env)
```

这样，正常工作目录内的写入不会改写用户源仓库或原始审查包。环境禁用Python字节码缓存，临时目录在副本外；检查结束后重新验证副本的文件集合、内容和模式。新增缓存文件也会使完整性校验失败，不能忽略后宣称通过。

副本无.git，也不自动安装依赖。首版面向依赖已经准备好、从副本路径导入代码的命令。src布局、editable安装、继承的搜索路径或外部服务可能让检查访问副本以外的代码；必须核对实际导入位置，不能仅靠cwd证明所有依赖都来自固定版本。构建会写产物的项目需要把输出放到副本外或调整命令。

工作目录副本不是权限沙箱；配置的程序仍有本机用户权限。这个版本不支持不可信仓库自动执行任意脚本。复制完整包最多增加一份约100MiB的固定文件，换取复用既有完整性验证，暂不增加缓存/增量复制框架。

## 3. 退出0为什么还不够

passed要求：退出码0、进程树清理完成、原包与副本完整、日志未超限。否则记录failed、changed、timed_out、cancelled、output_limit、start_failed、cleanup_failed或io_failed。

```python
verify_package(workspace)
verify_package(package)
```

检查脚本若先改代码再退出0，结果仍是changed。本轮实际测试改写了副本code.py，并确认用户仓库的原文件保持不变。

stdout经有界写入线程保存，stderr经现有进程管理写文件；轮询超限后停止进程。每流最终最多保存1MiB并记录是否截断。stderr在运行时可能短暂超过上限，再截断保存；这是留存上限，不是磁盘硬配额。检查超时最多配置180秒，清理耗时另计。

## 4. 检查如何与版本绑定

result.json保存输入snapshot_id、实际argv、退出码、耗时、清理标记、代码完整性及日志长度/SHA256。将结果和两个日志复制到原包checks/，manifest.checks只放有界摘要：

```python
manifest['checks'] = summary
identity = {key: value for key, value in manifest.items() if key != 'snapshot_id'}
manifest['snapshot_id'] = digest(canonical(identity))
```

最终snapshot_id同时代表需求、文件、差异与检查摘要。verify_package会还原检查前输入身份，核对result.json绑定，再校验日志及摘要；换一份其他快照的报告会被拒绝。只改日志也会得到PACKAGE_CHANGED。

Codex只自动接收检查摘要，原始命令和日志留在本机。模型提示也改为依据checks描述检查证据，不能自称亲自运行了测试。状态返回check_evidence_path，执行Agent可按需少量读取result.json/stdout.log/stderr.log，避免把完整日志塞入上下文。日志与参数可能含项目私有信息，不自动发布。

这些哈希用于检测内容变化，不是签名；能重写全部本地文件的同一用户也能重算哈希。检查通过也不能证明测试充分或没有缺陷，独立审查仍有价值。

## 5. 两个实际发现并修复的问题

**公共入口必须同样拦截。** 只在ReviewJobs阻止失败检查，还能从CLI直接调用Codex适配。新增回归先失败，随后在run_codex_review公共入口拦截非not_run/passed状态；现在CLI和MCP走同一规则。not_run仍是明确的兼容路径。

**期限必须在判定完成之前检查。** 查询取消状态变慢时，旧循环先发现进程退出0，会把超时检查判为passed。实际用一个变慢的取消查询和短期限复现，结果错误地passed；将期限检查前移后得到timed_out。这个检查保留在test_checks.py。

首轮还发现运行目录同时含workspace/tmp，不能当作最终包中只允许三个文件的checks目录验证。绑定阶段明确识别运行目录，导出后的证据目录仍只允许result.json和两个日志，没有放宽最终包的文件约束。

## 6. 自己运行演示

```powershell
.venv/Scripts/python.exe -X utf8 -m examples.checked_review_demo
```

真实执行过程如下：

1. 创建独立合成Git仓库：add使用减法，unittest断言2+3=5。
2. 通过真实MCP调用开始检查：unittest退出1，模拟审查器调用0次。
3. 在合成仓库改为加法，用新request_id发起第二次尝试。
4. unittest通过，明确标记的fixture审查器保存批准意见，freshness=current。
5. 故意篡改包中的检查日志，再读意见被PACKAGE_CHANGED拒绝。

本机演示输出包含failed_check_blocked_reviewer、passed_check_then_fixture_review、tampering_detected、complete。模型调用为0，real_workbuddy_verified=false。本轮最终演示目录是 `.agent-review-loop/checked-demos/d94d91d3bf49497292af4f8dcc3ccae2/`；最后一个包因演示主动篡改而不再有效，这是预期验收结果。

真实MCP检查还验证了失败状态的退出码与证据路径、成功后摘要回传、通过后日志篡改拒绝；旧的无配置任务流程继续回归。最终Windows/Python3.14完整85项检查通过，耗时78.239秒。相对原71项增加：检查执行/完整性10、后台门槛2、真实MCP检查交接1、公共Codex入口拒绝失败包1。editable安装更新为0.6.0，pip check通过，交接Skill结构校验通过，git diff --check通过。远程CI尚未运行。

## 7. 下一步的具体边界

本轮没有重启WorkBuddy连接、导入交接Skill或修改其个人配置。0.6.0检查能力通过官方SDK连接服务验收；不能据此宣布真实WorkBuddy开发→检查→Codex→用户选择修复已完成。

下一项产品验收应固定一个有明确测试命令的小实验仓库，核对执行环境/导入位置，让WorkBuddy完成一次需求修改，再用单次有预算的Codex审查读回意见。随后只做用户选定的一轮修复与回归。先验证这条有用流程，再扩展其他Agent接入和界面；第5课中的额外模型输入开销仍待定位。
