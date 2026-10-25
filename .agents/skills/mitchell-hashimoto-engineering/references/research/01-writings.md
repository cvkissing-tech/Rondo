# 著作维度：快速调研

调研日期 2026-10-25。实际搜索并打开 5 篇本人文章，达到本维度最多 5 来源的上限；以下为归纳，不逐字转载正文。

| ID / 日期 / 一手来源 | 可核对发现 | 对本项目的推断与局限 |
| --- | --- | --- |
| S1 / 2026-02-05 / [My AI Adoption Journey](https://mitchellh.com/writing/my-ai-adoption-journey) | 通过重做工作校准工具能力；把重复失误转为 harness 反馈工具。本人描述的后台工作仍有任务筛选与并发限制。 | 本项目用固定样例和明确终态证明能力；不把文章中的个人工作比例、模型体验或并发偏好设为普遍规则。 |
| S2 / 2023-06-01 / [Building Large Technical Projects](https://mitchellh.com/writing/building-large-technical-projects) | 按可见进展安排小组件；不可视组件可用测试与 CLI 演示；先满足自己真实需要。 | 每轮选一个可运行交接增量，不先造完整工作台；演示不是可发布质量的证明。 |
| S3 / 2022-03-13 / [Contributing to Complex Projects](https://mitchellh.com/writing/contributing-to-complex-projects) | 先使用、构建，再追踪一条功能路径；从低层理解并通过实验改动验证。 | 对运行器从请求入口追到进程与协议；先复现再提交小改动，不需要通读全部源码。 |
| S4 / 2026-01-21 / [Tripwire](https://mitchellh.com/writing/tripwire) | 以故障注入执行少见清理路径，并断言资源和状态；真实修复应由回归检查保护。 | 在子进程已启动后触发失败，验证退出；不移植 Zig 专用库或无证据扩大故障框架。 |
| S5 / 2026-10-06 / [Program Status OSC 7501](https://mitchellh.com/writing/program-status-osc7501) | 反对从屏幕/静默猜测状态，提出由程序显式报告工作、阻塞、完成与错误。 | 使用 ACP/App Server 已有结构化事件；此文不证明 WorkBuddy 或任何本机程序支持 OSC 7501。 |

## 三重验证

- 模型 1 在新项目构建和进入现有复杂项目中复现；能生成“小型 CLI 先可运行”的项目选择。可演示反馈与不提前完成组件的组合有辨识度，但不是独创发明。
- 模型 2 在 Agent 提示/工具环境和 Zig 资源恢复中复现；能生成“断连/取消留下可运行检查”的方案。harness 与故障注入的关联是本技能的工程归纳。
- 模型 3 在陌生代码学习和 AI 能力校准中复现；能生成“从一条真实调用到下层机制，再对照实验”的路线。跨域证据仅两篇文章，不外推到本人所有决策。

## 取舍

把显式状态报告作为具体启发式，而非宣称具有多领域证据的独立心智模型；不依据个人工具体验排名 Agent。未复刻文章示例源码，也未运行作者项目，不能声称完成实现级验证。
