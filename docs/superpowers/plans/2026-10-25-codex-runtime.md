# Codex Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 验证真实 Codex App Server 的本机协议入口，并补齐受控进程生命周期。

**Architecture:** 使用 Windows Job Object 及挂起创建，在恢复执行前把进程放入 Job；POSIX 使用独立进程组。标准库 JSON-lines 客户端按请求 ID 与事件交互。先做不生成模型内容的预检，再依据实际账号/能力决定一次有界真实审查，不更改用户登录或偷偷切换模型。

**Tech Stack:** Python 3.11+、CPython Windows `_winapi` 创建入口、ctypes 调用公开 Job API、Codex 0.164.0-alpha.11.1 的本地生成协议 schema。

**Spec:** 既有首版设计的进程树取消和真实客户端验收，以及第4课的固定审查包边界。用户已授权继续实现和必要验证，不新增确认环节。

## Global Constraints

- argv 明确，Windows 不经 shell；挂起创建→加入 Job→恢复，加入失败不允许执行。
- Job 不允许 breakaway，关闭时终止 Job，等待 ActiveProcesses=0；不按猜测 PID 杀进程。
- 仅保证正常子进程创建的同 Job 进程；外部系统服务启动的进程不是此机制的隔离承诺。
- 先验证合成子孙进程、超时、正常退出残留，再启动真实 App Server。
- 预检只 initialize/account/read(refreshToken=false)/model/list 等元数据，不打印邮箱、密钥或 token，不修改登录。
- 真实模型最多一次上层审查，不自动重试；180秒总期限，超时先协议中断，再清理进程；模型和费用未报告时为未知。
- WorkBuddy 本地接口需要注册应用与 OAuth；不读取或提取其私有账号数据，不把 CodeBuddy CLI 当同一客户端。

## Tasks

- [x] 新增受控进程模块及真实子孙进程检查，使用子进程启动记录作为同步依据。
- [x] 新增 App Server JSON-lines 请求/事件模块，覆盖分片、通知、错误、关闭和期限；使用模拟服务检查，不依赖模型额度。
- [x] 本机真实预检：固定 native codex.exe，握手、脱敏账号模式、模型元数据、正常关闭。
- [x] 满足条件则在合成审查包进行一次真实审查；不满足则保留明确错误并完成独立可推进事项。
- [x] 将女娲方法落到具体实验和验收，不将人物视角当作实际外部代码审查。
- [x] 补充第5课、执行相关回归并保存提交。

实际审查采用 thread/start + turn/start/outputSchema，而非内置 review/start，目的是直接匹配已实现的结构化审查契约。真实一次审查13.021秒、26303 token，费用未知；额外上下文开销待定位，本轮不再发起生成。WorkBuddy OAuth 代码和只读状态检查已独立完成。用户最新澄清尚未创建第三方应用，此前“已创建”记录作废；应用申请条件、权限和审核仍需确认，不将缺口简化为只差 ID/回调地址，也不阻塞核心开发。
