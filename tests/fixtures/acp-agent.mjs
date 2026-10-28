// Deterministic ACP protocol fixture. No model, network, auth or real user files.
import readline from "node:readline";
import { appendFileSync } from 'node:fs';
const modelFixture=process.argv.includes('--models-fixture'),traceIndex=process.argv.indexOf('--trace-file');
let selectedModel='fixture-small';
const send = (value) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...value }) + "\n");
let cwd, promptId, schema, stage, userText;
function finish() {
  const properties = schema.properties;
  const plan = properties.plan?.anyOf[0]?.properties;
  const value = properties.reply
    ? { reply: userText.includes('为什么') ? '离线替身解释：不需要服务器，可以先验证玩法。' : '离线替身修订：移除联网功能，增加本地排行榜。',
        plan: userText.includes('为什么') ? null : {
          context_id: plan.context_id.enum[0], summary: '离线替身计划 V2：离线玩法与本地排行榜。',
          steps: [{title: '实现离线玩法', details: '无需服务器，使用本地存储保存排行榜。', files: ['fixture.txt'], verification: ['检查本地文件']}], assumptions: [] } }
    : properties.context_id
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
  if(traceIndex>=0&&message.method)appendFileSync(process.argv[traceIndex+1],JSON.stringify({method:message.method,model:message.params?.modelId})+'\n');
  if (message.method === "initialize")
    send({
      id: message.id,
      result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] },
    });
  else if (message.method === "session/new") {
    cwd = message.params.cwd;
    send({ id: message.id, result: { sessionId: "fixture-session", ...(modelFixture?{models:{currentModelId:selectedModel,availableModels:[{modelId:'fixture-small',name:'Small fixture'},{modelId:'fixture-large',name:'Large fixture'}]}}:{}) } });
  } else if(message.method==='session/set_model'&&modelFixture){
    if(!['fixture-small','fixture-large'].includes(message.params.modelId)){send({id:message.id,error:{code:-32602,message:'Unknown fixture model'}});return;}
    selectedModel=message.params.modelId;
    send({id:message.id,result:{}});
  } else if (message.method === "session/prompt") {
    promptId = message.id;
    const text = message.params.prompt.map((x) => x.text || "").join("");
    // The prompt embeds current message as structured context, before the output schema.
    userText = text.match(/"user_message"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1] || '';
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
