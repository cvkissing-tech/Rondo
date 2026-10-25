---
version: 1
slug: "desktop-src-renderer-src-app-tsx"
primary_target: "desktop/src/renderer/src/App.tsx"
related_targets: []
---

# 桌面任务工作台

Mode: Operate。首版Windows开发预览，1360×900主窗口，最小960×680。用户在桌面输入需求，已可用能力为真实任务创建、恢复和审查；自动执行未接入时清楚展示。

## Direction contract

THESIS: 用一份任务贯穿需求、独立目录、改动与审查。界面以实际工作和明确下一步为中心，不显示虚构活跃任务。

OWN-WORLD: 建筑事务所项目册的克制层次：白色工作页、偏冷灰底、墨绿导航与动作，细分隔、紧凑标签和清晰状态。全部控件保持常见桌面工具语法，不模仿纸张纹理或实物装订。Segoe UI/微软雅黑用于操作，等宽仅用于路径和代码。

STORY: 先选择项目与描述需求，准备后进入任务详情；任务列表可恢复。详情内切换任务、代码改动、审查。签名行为是准备完成后自动进入同一任务，而非要求用户手动传递编号。

FIRST VIEWPORT: 224px左导航含品牌、新任务和真实任务列表；顶部项目/服务信息；主工作区的需求表单与右侧角色和阶段说明并列。主动作位于表单末尾。详情以任务标题、目录与操作条为首，再按标签呈现内容。无巨幅营销标题、指标卡或假进度。

FORM: 自有候选第4项“事务所项目册”，seed:4bff21d959efec25。其他候选为任务日志、时刻表、剪辑表、实验交接本、出版校样、图书目录。用户已授权直接开发与工程选型，本次沿用已确认事实，不再发起重复选择轮。挑战方向中暖色消费界面保留易懂文案原则，曝光记录方向不采用叠层和纹理；操作可读性优先。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Scope

可用：本地目录选择、真实MCP连接状态、开始任务、任务恢复、工作目录打开、代码差异、显式Codex审查/查询/取消。创建任务不调用模型，审查按钮明确额度行为。WorkBuddy显示未连接，不自动发送消息。没有浏览器模式的假后端；浏览器预览只能提示需桌面连接。

无装饰图片。图标统一采用lucide-react。错误为可读文字，保留用户输入，允许重试；键盘焦点、表单标签和窄窗口布局必须可用。
