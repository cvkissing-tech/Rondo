# ACP runtime reuse

Rondo imports the published `acpx@0.21.0` dependency, pinned in desktop/package-lock.json.
Upstream: https://github.com/openclaw/acpx (MIT).
Reference documentation inspected at commit 26849fd33785f85fb1ea8c6a1a189f816bf95d81.

Reused APIs: createAgentRegistry (including inspect), createRuntimeStore,
createAcpRuntime, ensureSession, startTurn, promptStarted/events/result,
onPermissionRequest, getStatus, cancel and shutdown.

Rondo's adapter only handles its JSONL boundary, role binding, user permission
answers, bounded event projection, structured result validation and existing
job lifecycle. It does not reimplement ACP framing, agent launch registry,
filesystem/terminal callbacks or authentication. Installed is not authenticated.
Agent packages are never auto-downloaded by Rondo discovery or dispatch.

The official agentclientprotocol/registry was researched as a compatibility
index, not imported as an executable auto-install feed. Each adapter's model,
Skills, MCP and account behavior remains that adapter's responsibility.
