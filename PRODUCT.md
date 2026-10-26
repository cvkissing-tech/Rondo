# Agent Review Loop

<!-- impeccable:product-schema 1 -->

## Platform

web

Electron桌面应用中的本地Web界面，首版目标Windows。

## Stack

delegated: 用户已接受Electron、React、TypeScript桌面模板和现有Python/SQLite/MCP核心的路线，并授权继续开发。直接复用官方模板、SDK和独立组件。

## Users

使用多个AI开发Agent的个人开发者；当前用户通过AI开发开源产品并学习代码。

## Product Purpose

用户在自己的产品中选择Git项目、提出需求；后台由Codex拆解和审查，WorkBuddy执行和修改。产品负责调度与结果展示，用户不在两个应用之间复制任务。

## Operating Context

本机项目、独立Git工作目录、持久任务、检查与代码审查。当前已具备18个MCP工具及CLI；Workbench首版连接真实任务创建、恢复、查看。WorkBuddy外部派发尚未接通，不能用模拟进度显示为完成。Codex模型调用会使用额度，准备任务本身不调用模型。

## Capabilities and Constraints

已有TaskLauncher、PlanJobs、ReviewJobs、版本绑定检查和Codex原生审查。显式计划生成、读取、取消与恢复已接入，代码变化时标记过期。任务主区显示当前阶段、角色分工与连续记录；元数据轮询反映实际领取和提交，历史作业展示有界概要，代码差异按需打开。WorkBuddy需要正式执行接入及授权，当前无第三方应用。用户不以盈利为目的，重视有用开源产出和可解释代码，不希望反复确认与过量验证。桌面首版开发预览依赖本机Python虚拟环境；独立安装包的Python打包后续处理。

## Brand Commitments

Agent Review Loop为当前项目名。简体中文，直接、清晰；不声称完整自动开发已实现。用户明确否定0.8.0墨绿表单界面，授权直接复用开源产品组件；当前界面直接移植Jean产品布局、T3 Code工作记录、Vibe Kanban计划组件与REA恢复的Codex输入容器，保留来源和适配记录。

## Product Principles

- 用户提出需求，产品统一组织Agent工作。
- 复用现成能力；保持一份真实任务状态。
- 每轮交付能使用的功能，不以工具数量和测试数量代替价值。
- 清楚区分已完成、等待人工操作、尚未接入。

## Evidence on Hand

真实SQLite/MCP/CLI、Git任务目录、一次真实Codex合成审查和一次真实Codex计划生成；WorkBuddy只读调用已观察。界面无既有视觉资产，不伪造活跃任务、模型用量或成功记录。
