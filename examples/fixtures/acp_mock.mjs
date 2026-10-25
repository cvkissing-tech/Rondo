// Experiment fixture only: no model, no shell, no arbitrary file access.
// SDK usage informed by openclaw/acpx test/mock-agent.ts at 36b4253e.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const [installRoot, stateRoot, role] = process.argv.slice(2);
if (!installRoot || !stateRoot || !['executor', 'reviewer'].includes(role)) {
  throw new Error('Explicit install root, private state root and mock role required');
}
const require = createRequire(path.join(installRoot, 'package.json'));
const { AgentSideConnection, PROTOCOL_VERSION, ndJsonStream } = await import(
  pathToFileURL(require.resolve('@agentclientprotocol/sdk')).href
);
const statePath = path.join(stateRoot, `${role}-sessions.json`);
const auditPath = path.join(stateRoot, 'mock-events.ndjson');
let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const pending = new Map();
function audit(event, data = {}) {
  appendFileSync(auditPath, JSON.stringify({ event, role, pid: process.pid, ...data }) + '\n');
}
function save() { writeFileSync(statePath, JSON.stringify(state)); }
audit('process_started');
// The fixture cannot remain alive indefinitely even if a probe fails.
const safetyTimer = setTimeout(() => { audit('safety_exit'); process.exit(93); }, 45000);

class MockAgent {
  constructor(connection) { this.connection = connection; }
  async initialize() {
    return { protocolVersion: PROTOCOL_VERSION, authMethods: [], agentCapabilities: { loadSession: true } };
  }
  async authenticate() { throw new Error('This fixture must never authenticate'); }
  async newSession({ cwd }) {
    const sessionId = randomUUID();
    state[sessionId] = { cwd, turn: 0 };
    save();
    audit('new_session', { sessionId, cwd });
    return { sessionId };
  }
  async loadSession({ sessionId, cwd }) {
    // A new process must load the SAME session, not invent replacement context.
    state = JSON.parse(readFileSync(statePath, 'utf8'));
    if (!state[sessionId] || state[sessionId].cwd !== cwd) throw new Error('Unknown session or wrong cwd');
    audit('loaded_session', { sessionId });
    return {};
  }
  async prompt({ sessionId, prompt }) {
    const session = state[sessionId];
    if (!session) throw new Error('Unknown session');
    const instruction = JSON.parse(prompt.filter(item => item.type === 'text').map(item => item.text).join(''));
    const controller = new AbortController();
    pending.set(sessionId, controller);
    audit('prompt_started', { sessionId, action: instruction.action });
    try {
      if (instruction.action === 'crash') {
        await this.message(sessionId, 'partial output before synthetic crash');
        process.exit(17);
      }
      if (instruction.action === 'sleep') {
        const cancelled = await new Promise(resolve => {
          const timer = setTimeout(() => resolve(false), 20000);
          controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(true); }, { once: true });
        });
        if (cancelled) { audit('cancelled', { sessionId }); return { stopReason: 'cancelled' }; }
      }
      if (!['echo', 'review', 'sleep'].includes(instruction.action)) throw new Error('Unsupported fixture action');
      session.turn += 1;
      save();
      const result = {
        role, session_id: sessionId, cwd: session.cwd, turn: session.turn,
        echo: instruction.text ?? null,
        reviewed_artifact: instruction.action === 'review' ? instruction.artifact : null,
      };
      await this.message(sessionId, JSON.stringify(result));
      audit('completed', { sessionId, turn: session.turn });
      return { stopReason: 'end_turn' };
    } finally { pending.delete(sessionId); }
  }
  async message(sessionId, text) {
    await this.connection.sessionUpdate({ sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } });
  }
  async cancel({ sessionId }) {
    audit('cancel_received', { sessionId });
    pending.get(sessionId)?.abort();
  }
}

const stream = ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin));
const connection = new AgentSideConnection(agentConnection => new MockAgent(agentConnection), stream);
await connection.closed;
clearTimeout(safetyTimer);
audit('connection_closed');
