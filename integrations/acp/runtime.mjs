// Rondo transport adapter; session/runtime/protocol handling is acpx 0.21.0.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import readline from "node:readline";
const require = createRequire(
  new URL("../../desktop/package.json", import.meta.url),
);
const {
  createAcpRuntime,
  createRuntimeStore,
  createAgentRegistry,
  inspectAgentModels,
} = await import(pathToFileURL(require.resolve("acpx/runtime")).href);
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
async function registry() {
  let overrides = {};
  const config =
    process.env.RONDO_AGENTS_CONFIG || join(homedir(), ".rondo", "agents.json");
  try {
    const data = JSON.parse(await readFile(config, "utf8"));
    if (!data.agents || Object.keys(data.agents).length > 40)
      throw Error("Invalid agents config");
    for (const [id, argv] of Object.entries(data.agents)) {
      if (
        !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id) ||
        !Array.isArray(argv) ||
        !argv.length ||
        argv.length > 24 ||
        !argv.every((x) => typeof x === "string" && x.length < 4096)
      )
        throw Error("Agents require a name and structured argv");
    }
    overrides = data.agents;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  return createAgentRegistry({ overrides });
}
const agents = await registry();
if (process.argv.includes("--list")) {
  emit({
    agents: agents.list().map((id) => {
      const info = agents.inspect(id);
      return {
        id: "acp:" + id,
        name: id + " (ACP)",
        available: info?.launch.kind === "installed",
        requirements:
          info?.launch.kind === "missing"
            ? info.launch.requirements.map((r) => r.name)
            : [],
        roles: ["planner", "executor", "reviewer"],
        protocol: "ACP",
        auth: "not_checked",
      };
    }),
  });
} else if (process.argv.includes("--models")) {
  const id = process.argv[process.argv.indexOf("--models") + 1],
    info = agents.inspect(id);
  if (info?.launch.kind !== "installed")
    throw Error("ACP adapter is not installed; no package was downloaded");
  const state = await inspectAgentModels({
    agentCommand: info.launch.argv,
    cwd: process.cwd(),
    timeoutMs: 20000,
  });
  emit({
    agent: "acp:" + id,
    models: (state?.availableModelIds || []).map((id) => ({
      id,
      name: state?.availableModels?.find((m) => m.modelId === id)?.name || id,
    })),
    default_model: state?.currentModelId,
    ...(!state?.availableModelIds?.length
      ? {
          unsupported_reason:
            "此 Agent 未通过 ACP 提供可选模型，请在原客户端配置模型。",
        }
      : {}),
  });
} else if (process.argv.includes("--probe")) {
  const id = process.argv[process.argv.indexOf("--probe") + 1];
  if (
    !agents.list().includes(id) ||
    agents.inspect(id)?.launch.kind !== "installed"
  )
    throw Error("ACP adapter is not installed");
  const runtime = createAcpRuntime({
    cwd: process.cwd(),
    agentRegistry: agents,
    probeAgent: id,
    permissionMode: "approve-reads",
    permissionPolicy: { defaultAction: "deny" },
    nonInteractivePermissions: "fail",
    fs: false,
    terminal: false,
  });
  try {
    emit(await runtime.doctor());
  } finally {
    await runtime.shutdown();
  }
} else {
  const lines = readline.createInterface({ input: process.stdin });
  let runtime, turn, input, handle;
  const pending = new Map();
  async function run(value) {
    input = value;
    if (
      !input.agent?.startsWith("acp:") ||
      !agents.list().includes(input.agent.slice(4))
    )
      throw Error("Unknown ACP agent");
    const id = input.agent.slice(4),
      inspected = agents.inspect(id);
    if (inspected?.launch.kind !== "installed")
      throw Error(
        "ACP adapter is not installed; no package was downloaded: " + id,
      );
    runtime = createAcpRuntime({
      cwd: input.cwd,
      sessionStore: createRuntimeStore({
        stateDir: join(input.output, "acpx"),
      }),
      agentRegistry: agents,
      permissionMode: input.writable ? "approve-all" : "approve-reads",
      permissionPolicy: { defaultAction: "deny" },
      nonInteractivePermissions: "fail",
      timeoutMs: input.timeout * 1000,
      onPermissionRequest: async (request, { signal }) => {
        if (["read", "search"].includes(request.inferredKind))
          return { outcome: "allow_once" };
        const requestId = crypto.randomUUID();
        const decision = await new Promise((resolve) => {
          pending.set(requestId, resolve);
          signal.addEventListener(
            "abort",
            () => {
              pending.delete(requestId);
              resolve(null);
            },
            { once: true },
          );
          emit({
            event: "permission",
            id: requestId,
            params: {
              reason: request.raw.toolCall?.title || "Agent 请求执行工具",
              options: request.raw.options,
            },
          });
        });
        return decision
          ? { outcome: "selected", optionId: decision }
          : { outcome: "cancel" };
      },
    });
    handle = await runtime.ensureSession({
      sessionKey: input.session_key,
      agent: id,
      mode: "persistent",
      cwd: input.cwd,
      ...(input.model ? { sessionOptions: { model: input.model } } : {}),
    });
    const configured = await runtime.getStatus({ handle });
    if (input.model && configured.models?.currentModelId !== input.model)
      throw Error(
        "Agent did not confirm the requested model; no prompt was sent",
      );
    emit({
      event: "session_created",
      session_id: handle.backendSessionId || handle.acpxRecordId,
      agent_session_id: handle.agentSessionId,
      model: configured.models?.currentModelId,
    });
    turn = runtime.startTurn({
      handle,
      text: input.prompt,
      mode: "prompt",
      requestId: input.session_key,
      timeoutMs: input.timeout * 1000,
    });
    await turn.promptStarted;
    emit({ event: "dispatched" });
    for await (const event of turn.events)
      emit({ event: "update", update: event });
    const result = await turn.result;
    const status = await runtime.getStatus({ handle });
    emit({
      event: "result",
      ...result,
      usage: status.usage,
      agent_session_id: status.agentSessionId,
      model: status.models?.currentModelId,
    });
  }
  lines.on("line", (line) => {
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      return;
    }
    if (!input)
      run(value)
        .catch((error) =>
          emit({ event: "error", error: error.message, code: error.code }),
        )
        .finally(async () => {
          await runtime?.shutdown();
          lines.close();
        });
    else if (value.command === "answer") {
      pending.get(value.id)?.(value.answer);
      pending.delete(value.id);
    } else if (value.command === "cancel") {
      for (const reply of pending.values()) reply(null);
      pending.clear();
      turn?.cancel({ reason: "Rondo user cancellation" }).catch(() => {});
    }
  });
}
