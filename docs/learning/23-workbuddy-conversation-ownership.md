# WorkBuddy 会话为什么显示中断

Rondo 为任务创建单独的 WorkBuddy 会话。原实现通过底层 `session:create` 和
`session:sendMessage` 发送请求，而 WorkBuddy 桌面界面用自己的 conversation SDK
管理会话与请求。观察到的现象是底层工作仍在进行时，SDK 会话状态却是 idle，
原生界面因此不能可靠反映该任务。一次实际任务的记录最终包含取消请求；仅凭记录
不能判断是谁触发的取消，也不能证明所有中断都由这一问题引起。

现在的调用链：

1. 用 `wb:conversations:create` 创建专属于该任务的会话，检查工作目录和所选模型。
2. 用 `wb:conversations:sendPrompt` 只派发一次，并等待提交凭据；不确定时不重发。
3. 通过 SDK 的请求历史投影文字及工具进展，通过待处理请求提供权限选项。
4. 原生会话入口仍打开同一会话；需要权限时由用户选择，不自动授权。

实际验证使用本机 WorkBuddy 5.9.3 和 DeepSeek 模型的独立临时会话。验证覆盖会话
创建、模型读回、短消息请求及工具和回复进展回传；权限选项通过模拟测试，尚未完成
真实权限弹窗验收。完整的执行、提交和审查链路也尚未完成实测。内部接口
可能随 WorkBuddy 版本改变，这不是其他版本均已验证的承诺。原任务不会自动重发，
已产生的文件与记录会保留。

实现位于 `integrations/workbuddy/native-bridge.mjs` 和 `native-driver.mjs`。
SDK 接入方式参考 [agent-lab](https://github.com/narutoZed/agent-lab/blob/ca7e45d4a1137cea401e39ff5c747e3aabf21d53/scripts/workbuddy-desktop.mjs)
及 [LazyMind](https://github.com/LazyAGI/LazyMind/blob/1af0e3a637ce9062d4b522bfc13b5fa16a416845/integrations/workbuddy-workflow/connector/src/sdk.ts)。
