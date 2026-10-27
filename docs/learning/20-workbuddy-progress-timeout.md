# WorkBuddy有任务却看不见进展：一次真实排查

用户任务#4的执行作业为8f01d61da4ad455fb404ace3029bf524，原生会话为45e36f95-9c3e-4c3f-8f40-91b7f80f48dc。只创建任务、不真正执行是最初怀疑；实际读取原生历史后，证据否定了这个推测。

## 查到的事实

- WorkBuddy接收了需求，读取Rondo任务、领取、写内核和测试、实现HTML/CSS/游戏页面并写README。
- 工作区已有index.html、style.css、src/snake.mjs、src/game.mjs、tests/snake.test.mjs、README.md。单独运行原有Node内核测试19项通过；不是浏览器验收或整体任务完成。
- 作业cancel_requested=0，持续903.77秒后cancelled，符合旧900秒上限自动取消。原生历史末尾的Interrupted by user是取消协议的表现，并不证明用户手动点了停止。
- 原生记录显示本次模型为glm-5.3-flash，来自WorkBuddy默认fast-model路由；不能把它标为DeepSeek。
- 原先桥接层只收用户提示词回执，丢弃其余公开进度；Rondo也没写WorkBuddy进度投影。所以界面长期没有工具/回复记录。
- 原生get返回terminated且active列表为空，旧inspect仍判busy。它并非执行成功证明，但不应该永久显示忙碌。
- 日志中原生界面在11:41:14读取history-no-projectable-requests，用户输入随后才写入。旧代码在session_created立即打开空壳，存在早读历史的时序问题；不能把没有消息的初始界面当作Agent未启动。

## 修改的调用链

`native-bridge.mjs` revision4仅为Rondo创建的worker收集agent_message_chunk、tool_call、tool_call_update。相邻文本块合并、队列有界、读取后清空，不收思维链、不收其他会话。`native-driver.mjs`每次轮询同时drainEvents并发送progress。

`execution.py`把公开事件交给workbuddy_progress.project_update，继续复用现有SQLite投影和界面的工具记录区，不另建界面。展示最近60项、文本有界、工具按ID更新；交接凭证从文本中隐藏。缓存失败不会杀掉真实执行。

terminated仅在原生active/outgoing/待输入检查都清除后视为空闲。自然结束后仍必须验证Rondo执行者提交，才能自动审查，不能把空闲当完成。窗口自动激活改到第一条公开进度或待输入；没有回执/进度时不把空任务窗口当成执行证据。

原生WorkBuddy的固定执行上限从15分钟调整为60分钟，初始任务租约同步为3600秒，并仍要求长任务续约。取消回执明确区分timeout和user_cancelled；停止后说明改动保留、尚未提交/审查。这个改动不延长ACP/Codex执行上限，也不自动重发任何作业。

## 这次如何恢复

只读核对已保存会话与工作区，解析指定本机原生历史中的公开assistant消息及工具名称/状态，排除reasoning、用户上下文和原始工具凭证。将47项可展示记录补入该作业的SQLite显示缓存；保留原取消状态、任务与尝试次数。主数据库先备份，再根据已确认的超时证据补充停止解释。没有更改WorkBuddy的私有历史数据库，没有调用模型、重派任务或伪造submit_result。

这让用户看见已经产生的代码和真实过程；仍不能把未提交作业说成已经验收。游戏可从Rondo文件区打开index.html，通过已有HTTP预览查看。

## 验证范围

原生桥fixture覆盖消息/工具流、排除reasoning、队列清空、terminated与active冲突、回执防重放，共6项。Python回归覆盖原生JSONL的会话/工作区边界、消息合并/工具更新/上限/凭证隐藏、真实子进程超时确认、执行投影和缓存失败不断执行。真实只读inspect确认该已结束会话从错误busy变为idle；此次没有再消费商业模型验证新的一轮开发。

重要代码：先读native-bridge的progress队列与drainEvents，再看native-driver轮询，最后看execution.py的event回调、workbuddy_progress.py的投影与历史恢复。任务状态、Agent执行、UI显示和结果提交必须分别确认。


本轮结果：17项相关Python回归通过；最后日志格式调整后12项执行/进度回归再次通过；6项Node桥fixture通过，构建/typecheck/lint通过。隔离桌面证据`.agent-review-loop/workbuddy-progress-ui-zrjNNq/result.json`确认47项、cancelled、实际模型、静态HTML及JS MIME、无页面异常和零模型调用。三张浅色/960px/深色捕获经过独立界面审查，disposition为ship，范围仅为恢复记录的可读性、导航及状态真实性，不认证未来商业执行链。现有游戏内核测试19项通过，仍不等于提交或整体交付。
