# Rondo

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

本机项目、独立Git工作目录、持久任务、检查与代码审查。可从空文件夹直接开始；普通保存目录已有文件时自动新建项目子文件夹，保留原文件，无新/已有项目模式选择。已有Git项目仍使用其提交基线。新建任务草稿在本机恢复。当前24个MCP工具，支持任务创建、恢复、计划、原生执行与审查。WorkBuddy 5.9.2 使用本机 RPC 创建专用会话，通过既有 MCP 提交结果，无需第三方 Open API 应用。Codex 与 WorkBuddy 各自消耗额度；准备和刷新任务不调用模型。

## Capabilities and Constraints

已有TaskLauncher、PlanJobs、ReviewJobs、版本绑定检查和Codex原生审查。显式计划生成、读取、取消与恢复已接入，代码变化时标记过期。任务主区显示当前阶段、角色分工与连续记录；元数据轮询反映实际领取和提交，历史作业展示有界概要，代码差异按需打开。ExecutionJobs 派发一次原生任务，只有对应执行者提交结果且回合结束才接续检查和审查；不明确的派发保存会话并停止，不自动重发。首次审查要求修改时，自动返修一次并复查；代码过期、取消、未产生改动、范围越界或次数用完时停止。重启恢复只读状态，不自动重放模型调用；未开始的交接可从当前审查显式发起。用户不以盈利为目的，重视有用开源产出和可解释代码，不希望反复确认与过量验证。桌面首版开发预览依赖本机Python虚拟环境；独立安装包的Python打包后续处理。

## Brand Commitments

Rondo为产品名；agent-review-loop保留为包、仓库目录及MCP连接名。简体中文，直接、清晰；不声称完整自动开发已实现。用户明确否定0.8.0墨绿表单界面，授权直接复用开源产品组件；当前界面直接移植Jean产品布局、T3 Code工作记录、Vibe Kanban计划组件与REA恢复的Codex输入容器，保留来源和适配记录。

## Product Principles

- 用户提出需求，产品统一组织Agent工作。
- 复用现成能力；保持一份真实任务状态。
- 每轮交付能使用的功能，不以工具数量和测试数量代替价值。
- 清楚区分已完成、等待人工操作、尚未接入。

## Evidence on Hand

真实SQLite/MCP/CLI、Git任务目录、一次真实Codex合成审查和一次真实Codex计划生成；WorkBuddy 原生 DeepSeek 执行、MCP 提交、固定检查与 Codex 自动审查已在隔离任务通过。0.12.0 的真实返修实验以明确预埋缺陷为起点，经真实 Codex 发现问题、WorkBuddy 返修和自动复查通过；首次审查自动交回的调度另有离线断言。界面无既有视觉资产，不伪造活跃任务、模型用量或成功记录。


## 0.14.0 会话工作台与原生环境

用户授权整体替换旧布局。当前采用244px任务栏、主区工具栏、T3会话列与常驻可调整的文件/改动/会话面板；完整WorkBuddy提交展开，工作区文件可阅读，有index.html时可打开浏览器运行。所有列表与报告来自保存的任务及真实文件；导航打开既有原生会话，不重发提示词。

Codex App Server从实际任务工作区启动，继承本机账号、模型、推理强度、MCP、Skills与执行/审批配置，不再覆盖baseInstructions或关闭MCP。新会话持久保存并命名。规划/审查通过任务指令要求不修改项目，且结束后核对Git tree；这不是文件系统只读沙箱。原生command/file审批与用户问题可在Rondo答复；其他客户端动态工具、权限扩展与MCP elicitation尚未实现，遇到会停止并说明，不伪造答复。Codex桌面专属连接器不等同于CLI环境。旧版本临时会话无法追补保存。

真实原生接入验收发现153个启用Skills与4项启用MCP配置，使用gpt-6.1-sol/high，读取ponytail并运行Get-Location；Codex原生读回同一持久会话及命令记录。此验收不代表4项MCP全部在线，也不代表桌面专属连接器接入。WorkBuddy会话get接口确认用户任务#3会话与工作区存在；其原生状态terminated表示该回合已结束，不表示当前仍在运行。
