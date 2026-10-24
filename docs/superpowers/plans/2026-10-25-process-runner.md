# Process Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 实现并验证不依赖任何账号的本地进程执行模块，作为 Codex 审查的执行基础；后续衔接 WorkBuddy + DeepSeek 实现与修复，并验证超时及预算停止行为。

**Architecture:** 用一个共享执行函数接收参数列表和 stdin，将 stdout/stderr 分别写入新运行目录。返回明确的进程结果，同时保存 JSON 记录；通过真实但无模型的 Python 子进程验证。

**Tech Stack:** Python 3.11+，标准库 `subprocess`、`pathlib`、`json`、`dataclasses`、`unittest`。

**Spec:** `docs/superpowers/specs/2026-10-25-agent-review-loop-design.md`

## Global Constraints

- Python 3.11+，第一阶段仅标准库。
- 第一阶段不调用模型，不读取密钥，不安装全局软件。
- `argv` 是参数列表，`shell=False`，不得将用户任务拼成 shell 命令。
- `output_dir` 必须为未存在的路径，禁止覆盖上一轮证据。
- 第一阶段测试进程不创建子进程；接入真实 Agent 前完成目标平台的进程树取消验证。
- 先在本会话逐项实现；计划引用的执行技能若不可用，按下面清单继续，不安装替代技能，不自行启动子 Agent。
- 每项完成后记录检查结果；完成一个可运行阶段后再形成一个有意义的 Git 提交。

## Files

- `agent_review_loop/__init__.py`：包入口，保持为空。
- `agent_review_loop/runner.py`：结果类型、输入校验、执行、超时与记录。
- `tests/test_runner.py`：用 `sys.executable -c` 创建无网络测试进程。
- `examples/process_demo.py`：在临时目录运行三种场景，显示可核验结果。

## Task 1: 成功执行与持久记录

**Interfaces:** 产出设计中的 `run_process(...) -> RunResult`；字段与状态名严格采用设计。

- [x] 在 `tests/test_runner.py` 写第一个测试，临时目录使用含中文与空格的前缀：

```python
with tempfile.TemporaryDirectory(prefix="协作 空格 ") as root:
    base = Path(root)
    result = run_process(
        [sys.executable, "-c", "import sys; print(sys.stdin.read()); print('diagnostic', file=sys.stderr)"],
        base, "审查要求 & literal", base / "run-1", 10,
    )
    self.assertEqual(result.status, "completed")
    self.assertEqual(result.exit_code, 0)
    self.assertIn("审查要求 & literal", result.stdout_path.read_text(encoding="utf-8"))
    self.assertIn("diagnostic", result.stderr_path.read_text(encoding="utf-8"))
    self.assertEqual(json.loads((base / "run-1/result.json").read_text(encoding="utf-8"))["status"], "completed")
```

- [x] 运行 `py -3 -m unittest discover -s tests -v`，确认当前因缺少包或函数失败。
- [x] 在 `runner.py` 定义 `RunResult` dataclass；先检查目录和正数超时，再用 `mkdir(exist_ok=False)` 创建输出目录。
- [x] 实现成功分支：以二进制文件作为 stdout/stderr，`Popen(..., stdin=PIPE, shell=False, cwd=cwd)`，`communicate(input=prompt.encode('utf-8'), timeout=timeout_seconds)`；把结果转为 JSON 可序列化的路径字符串并保存。
- [x] 测试子进程参数加入 `-X utf8`，确保 Windows 管道输出与输入采用 UTF-8；运行上述测试确认通过。

## Task 2: 失败、超时与不覆盖证据

**Interfaces:** 扩展同一函数，不改变第一项的签名和返回字段。

- [x] 增加退出失败检查：命令为 `[sys.executable, '-c', 'raise SystemExit(7)']`，断言 `status == 'failed'`、`exit_code == 7`，JSON 与返回值一致。
- [x] 增加启动失败检查：使用临时目录下不存在的可执行文件路径，断言 `status == 'failed'`、`exit_code is None`，stderr 非空。
- [x] 增加超时检查：命令为 `[sys.executable, '-c', 'import time; time.sleep(60)']`，超时设为 `0.2`，断言 `status == 'timed_out'`，且测试在 10 秒内结束。
- [x] 增加覆盖保护检查：第一次完成后保存 `result.json` 字节；第二次使用同一输出目录应抛 `FileExistsError`，原记录字节不变。
- [x] 增加输入检查：不存在的 cwd 抛 `NotADirectoryError`；零或负超时抛 `ValueError`，且未创建运行目录。
- [x] 运行测试，确认新增用例暴露对应缺陷，再补齐分支：非零退出归为失败；启动 `OSError` 写诊断；`TimeoutExpired` 后 kill 并 wait，超时仍记为超时；诊断不记录环境变量。
- [x] 运行 `py -3 -m unittest discover -s tests -v`，全部通过；不把测试解释为真实 Agent 取消已经可用。

## Task 3: 可观察的学习示例

**Interfaces:** `examples/process_demo.py` 消费共享执行函数，不复制执行逻辑。

- [x] 编写可通过 `py -3 -m examples.process_demo` 启动的示例：临时目录中依次执行正常回显、退出码 7、短超时三个场景。
- [x] 每次打印状态、退出码和捕获的 stdout/stderr 摘要；临时目录退出后清理；示例开头明确没有模型调用。
- [x] 运行示例，检查三种结果分别为 `completed`、`failed`、`timed_out`。
- [x] 在 README 记录真实可运行命令和结果；将阶段 1 标为完成，阶段 2 保持未验证。
- [x] 最后检查 `git diff --check`、离线测试和示例；形成一次完整、可审查的阶段提交。

## 自检

本计划只实现进程执行模块。SQLite、真实 Agent、Git 快照、取消整棵进程树、修复循环、界面与 GitHub 发布由后续阶段分别交付，不用模拟测试替代真实接入验收。

## 执行记录（2026-10-25）

已在 Windows / Python 3.14.7 执行：首次检查因模块缺失失败，实施后 8 项检查通过；离线演示的成功、退出码 7 和超时均符合预期。此记录仅覆盖本地进程模块，不代表真实 Agent 调用、整棵进程树取消或完整协作产品已可用。
