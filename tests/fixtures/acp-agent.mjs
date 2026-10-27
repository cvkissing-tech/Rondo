// Deterministic ACP protocol fixture. No model, network, auth or real user files.
import readline from "node:readline";
const send = (value) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...value }) + "\n");
let cwd, promptId, schema, stage;
function finish() {
  const properties = schema.properties;
  const value = properties.context_id
    ? {
        context_id: properties.context_id.enum[0],
        summary: "ACP fixture plan",
        steps: [
          {
            title: "Write fixture",
            details: "Write fixture.txt with the ACP file capability.",
            files: ["fixture.txt"],
            verification: ["Read fixture.txt"],
          },
        ],
        assumptions: [],
      }
    : properties.snapshot_id
      ? {
          snapshot_id: properties.snapshot_id.enum[0],
          verdict: "approved",
          summary: "Offline ACP fixture, not a model review",
          findings: [],
        }
      : {
          summary:
            "Offline ACP fixture wrote fixture.txt through the ACP file capability.",
        };
  send({
    method: "session/update",
    params: {
      sessionId: "fixture-session",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: JSON.stringify(value) },
      },
    },
  });
  send({ id: promptId, result: { stopReason: "end_turn" } });
}
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize")
    send({
      id: message.id,
      result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] },
    });
  else if (message.method === "session/new") {
    cwd = message.params.cwd;
    send({ id: message.id, result: { sessionId: "fixture-session" } });
  } else if (message.method === "session/prompt") {
    promptId = message.id;
    const text = message.params.prompt.map((x) => x.text || "").join("");
    schema = JSON.parse(text.slice(text.lastIndexOf("schema:\n") + 8));
    if (
      schema.properties.summary &&
      !schema.properties.context_id &&
      !schema.properties.snapshot_id
    ) {
      stage = "permission";
      send({
        id: "permission",
        method: "session/request_permission",
        params: {
          sessionId: "fixture-session",
          toolCall: {
            toolCallId: "write-fixture",
            title: "Write fixture.txt",
            kind: "edit",
            status: "pending",
          },
          options: [
            {
              optionId: "allow",
              kind: "allow_once",
              name: "Allow fixture write once",
            },
            {
              optionId: "reject",
              kind: "reject_once",
              name: "Reject fixture write",
            },
          ],
        },
      });
    } else finish();
  } else if (message.id === "permission") {
    if (message.result?.outcome?.optionId !== "allow") {
      send({ id: promptId, result: { stopReason: "refusal" } });
      return;
    }
    stage = "write";
    send({
      id: "write",
      method: "fs/write_text_file",
      params: {
        sessionId: "fixture-session",
        path: cwd + "/fixture.txt",
        content: "ACP fixture output\n",
      },
    });
  } else if (message.id === "write") {
    if (message.error) throw Error(JSON.stringify(message.error));
    finish();
  } else if (message.method === "session/cancel")
    send({ id: promptId, result: { stopReason: "cancelled" } });
});
