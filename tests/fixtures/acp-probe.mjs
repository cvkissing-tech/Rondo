// Offline handshake fixture. A session/prompt would fail the test and never call a model.
import readline from 'node:readline'
import { appendFileSync } from 'node:fs'
readline.createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line)
  appendFileSync(process.argv[2], JSON.stringify(message) + '\n')
  if (message.method === 'initialize') process.stdout.write(JSON.stringify({
    jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
  }) + '\n')
  else if (message.id) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Only initialize allowed' } }) + '\n')
})
