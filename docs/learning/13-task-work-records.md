# 第13课：让任务页面围绕开发过程组织

0.10.0 保留 Jean 工作台外壳，把任务主区改为连续工作记录。
用户打开任务后先看到当前阶段、规划/执行/审查分工和一个下一步动作；
需求全文、验收与工作区路径按需展开，代码差异作为可收起的侧面板。

## 实际复用了什么

新增直接移植 T3 Code 的 `apps/web/src/components/chat/WorkLog.tsx`，
固定 commit `3de45c6254345f968fbdc64db7b149bf4f429855`，
原始 blob `90a42a68f0cede3999b40aa75fcc7a9f10cd5c5b`。
本地位于 `desktop/src/renderer/src/vendor/t3code/`，保留 MIT 许可证与来源。
只把 cn import 和次级文字 token 映射到现有 Jean 主题；未增加依赖。

WorkLog 的 Block/List/Button/Row/Details 是上游实际产品组件。
需求、工作区、规划、执行、审查这些内容由本项目真实状态填入。
Vibe 计划组件保留原结构与操作，背景/边界映射现有中性主题，
去掉整块橙色的视觉竞争。差异继续使用 Pierre Diffs。

## 当前阶段如何决定

`taskFlow.ts` 是一个纯函数，读取 context、规划作业、审查作业、
已验证结果和用户显式读取的代码差异；它本身不调用网络或模型。

```ts
if (context.task.status === 'claimed') {
  // 显示真实领取者；领取不等于完成，也不证明它就是 WorkBuddy。
}
if (context.task.status === 'submitted') {
  // 显示“执行结果已提交”，下一步可以显式发起审查。
}
```

- 规划/审查作业在准备、进行、停止时分别显示对应状态。
- 计划返回后显示“等待执行接入”，不会自动把步骤标成完成。
- 代码有改动但没有提交时，只说明检测到文件变化。
- 审查返回不等于检查通过，阶段说明保留检查状态；旧快照提示重新核对。
- 失败、取消、中断进入查看记录，不自动重试。
- 按钮明确标注生成/审查会消耗额度；查看详情、刷新与恢复不会生成。

## 如何保留记录和更新界面

现有 `get_task_context` 增加 `activity` 与 `activity_truncated`，
读取 tasks 的创建时间和 plan_jobs/review_jobs 的既有记录。
字段只包含 id、类型、状态、创建/更新时间与错误码；不暴露请求指纹、
claim token、运行目录或整份作业输入。最多返回最近10条模型作业概要，按时间展示。
SQLite 仍为 schema4，没有新增数据表或后台队列。

这是已有作业记录的只读投影，不是完整的事件溯源系统。
主区展开最近的计划/审查结果；更早作业在“已保存作业记录”显示概要。
执行区使用已有任务领取状态、领取者和真实提交摘要。

桌面每5秒读取一次所选任务的元数据，领取和提交可自动反映到当前阶段。
后台轮询不创建 Git 快照、不调用模型；用户刷新记录或打开差异时，
再校验已保存计划与审查的代码新鲜度。所有异步回复在切换任务时有失效保护。

## 本轮验证

```powershell
node desktop/scripts/flow-check.mjs
.venv/Scripts/python.exe -m unittest tests.test_task_launch tests.test_mcp
npm --prefix desktop run lint
npm --prefix desktop run build
npm --prefix desktop run smoke
```

状态推导13项断言、任务/MCP相关8项测试通过。
桌面 smoke 在隔离仓库中真实运行脚本、领取任务和提交结果，
验证元数据轮询会显示“已领取”和“已提交”；执行者明确是验收脚本，未调用 WorkBuddy。
既有真实计划从缓存重读，验证步骤键盘折叠、恢复、过期提示和浅深主题。
本轮桌面验收没有新增计划/审查模型调用。

WorkBuddy 自动派发与返修仍未接入，界面如实显示。
当前结果只覆盖本机 Windows 桌面开发预览，未制作独立安装器或验证其他平台。
