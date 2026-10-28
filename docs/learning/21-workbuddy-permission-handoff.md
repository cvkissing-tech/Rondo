# WorkBuddy 为什么写了代码却一直不交付

2026-10-28，用户任务 7 的作业 dff0f37d7525443396ac74db5c49714a。

## 已确认的卡点

原生会话 cf27b978-df90-4885-b4cd-5dfd89caeea8 的历史中有游戏源码、测试和浏览器检查记录。最后一条工具调用包含关闭浏览器、清理临时文件和最终检查，但没有对应的工具返回。

daemon.log 在 `2026-10-27T16:54:32.424Z` 发出了 permissionRequest，requestId 为 call_49d94ed9a342445ea4a58ba3，并将任务通知状态改为 pending。这证明它在等确认，不能仅凭“没有工具返回”断定命令一直在运行。随后作业达到 60 分钟上限，原生停止回执已确认，未 submit_result，也没有自动审查。

原桥接只处理 `data.update.sessionUpdate` 中的消息和工具更新，丢掉了同一个事件通道上的 `data.type = permissionRequest`。原生 session:get 又会在任务历史被标记为终态时隐藏 pendingPermissions。两个缺口叠加，把真实等待误显示成持续执行。

原生桌面历史提前显示 cancelled 是另一个状态投影问题；此次没有修改 WorkBuddy 私有数据库，也不宣称其原生历史已被修复。

## 优先复用的部分

- 继续使用 [codex-workbuddy-gateway 的固定源码](https://github.com/dudu555-djiao/codex-workbuddy-gateway/blob/fbaaa2ef6d6cb59f48b953a1f27058202a81553f/src/native-desktop-trigger.ts) 中的 MessageChannel、专用会话绑定、忙闲检查与派发收据。GitHub 当前文件 blob 仍为 34979b126142e8be7b60e991eda34d2b2a4ade8c，现成实现没有处理这类控制事件。
- 对照 [workbuddy-acp-bridge](https://github.com/Kxiandaoyan/workbuddy-acp-bridge/blob/3f2f52e7a03b32c455b1718ad43730177472e2ff/acp_live_send.py)，保留不为发送提示词预先加载整份历史的处理。不复制未知状态下的重新派发。
- 复用 Rondo 已有的 `interactive_request`、SQLite 会话投影、`answer_native_request`、ACP 权限选项和 `NativeEvents` 确认按钮，没有再建一套权限窗口。

## 修复后的调用链

```text
WorkBuddy permissionRequest（原生 requestId + 实际 options）
  → native-bridge 记录指定会话的控制事件
  → native-driver 发出 permission_request
  → execution.py 使用现有 interactive_request 发布 pending
  → Rondo 展示命令与原生确认选项
  → 用户答复经 answer_native_request 写入当前请求的答复文件
  → 同一个 helper 收到 answer_permission
  → session:resolvePermission(sessionId, 原生 requestId, optionId)
  → 继续原来的执行回合，提交结果后再进入现有检查与审查
```

这里有两个不同的 ID：界面答复使用 Rondo 的一次性请求 ID，原生答复使用 WorkBuddy 的 requestId。二者由当前 helper 的一次请求关联，不用“再发一次需求”充当确认。

控制事件按原生请求 ID 去重；只接受该请求实际提供的选项。等待答复超时或用户取消时，先停止原生回合并等确认，再关闭 helper，避免只退出辅助进程而把后台执行留下。

## 验证边界

8 项 Node 桥接测试包含：历史投影隐藏 pending 时仍识别等待、正确 requestId/optionId 回传、拒绝无效/重复答复、输入消除和取消、消息/工具流、防重复派发。

17 项 Python 执行/进度测试包含：权限展示后经现有答复入口继续提交；同一个真实辅助子进程接收答复而不重新启动任务；权限超时先发送取消并等待停止回执。

本机已安装的 WorkBuddy 升至 5.9.3，实际本地握手和 revision6 注入成功，没有发送模型提示词。新一轮商业模型完整开发尚未作为本次回归的一部分运行；离线替身和连接握手不能冒充真实模型交付验收。
