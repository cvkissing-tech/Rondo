// Rondo's stdio boundary around the reused WorkBuddy native RPC bridge.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'
import { RENDERER_BRIDGE } from './native-bridge.mjs'

const port = Number(process.env.ARL_WORKBUDDY_CDP_PORT || 18493)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid WorkBuddy local port')
const executable = path.resolve(process.env.ARL_WORKBUDDY_EXECUTABLE ||
  path.join(process.env.LOCALAPPDATA || '', 'Programs/WorkBuddy/WorkBuddy.exe'))
const emit = value => process.stdout.write(JSON.stringify(value) + '\n')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
function windowsQuery(script) {
  const powershell = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  return execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', timeout: 6000, windowsHide: true }).trim()
}
function assertOwner() {
  if (process.platform !== 'win32') throw Error('This driver currently supports Windows')
  const owner = windowsQuery(`$wbListeners=@(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue); if($wbListeners.Count -eq 0){exit 0}; if(@($wbListeners | Where-Object {$_.LocalAddress -notin @('127.0.0.1','::1')}).Count -gt 0){throw 'Non-loopback listener'}; $wbIds=@($wbListeners.OwningProcess | Sort-Object -Unique); if($wbIds.Count -ne 1){throw 'Ambiguous owner'}; (Get-CimInstance Win32_Process -Filter "ProcessId = $($wbIds[0])").ExecutablePath`)
  if (!owner || path.resolve(owner).toLowerCase() !== executable.toLowerCase())
    throw Error('WORKBUDDY_NOT_CONNECTED: local port is absent or is not owned by WorkBuddy')
}
export class NativeClient {
  sequence = 0
  pending = new Map()
  async connect() {
    assertOwner()
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(4000), redirect: 'error' })
    if (!response.ok) throw Error('Cannot inspect WorkBuddy local transport')
    const targets = await response.json()
    const expected = path.join(path.dirname(executable), 'resources/app.asar/renderer/index.html').toLowerCase()
    const target = targets.find(item => {
      try { return item.type === 'page' && fileURLToPath(item.url).toLowerCase() === expected }
      catch { return false }
    })
    if (!target?.webSocketDebuggerUrl) throw Error('WorkBuddy main page is not ready')
    const url = new URL(target.webSocketDebuggerUrl)
    if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || Number(url.port) !== port)
      throw Error('WorkBuddy returned a foreign transport endpoint')
    this.socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('WorkBuddy transport timed out')), 5000)
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('WorkBuddy transport failed')) }, { once: true })
    })
    this.socket.addEventListener('message', event => {
      let message
      try { message = JSON.parse(event.data) } catch { return }
      const call = this.pending.get(message.id)
      if (!call) return
      this.pending.delete(message.id); clearTimeout(call.timer)
      const remoteError = message.error?.message || message.result?.exceptionDetails?.exception?.description || message.result?.exceptionDetails?.text
      if (remoteError) call.reject(Error(String(remoteError).slice(0, 1200)))
      else call.resolve(message.result?.result?.value)
    })
    this.socket.addEventListener('close', () => {
      for (const call of this.pending.values()) { clearTimeout(call.timer); call.reject(Error('WorkBuddy transport closed')) }
      this.pending.clear()
    })
    await this.evaluate(RENDERER_BRIDGE)
  }
  evaluate(expression, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error('Native request timed out; do not replay a submitted prompt')) }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
  }
  call(method, ...args) {
    if (!['inspect', 'wakeIdle', 'createWorker', 'listModels', 'setModel', 'rpc'].includes(method)) throw Error('Unsupported native operation')
    return this.evaluate(`globalThis.__rondoNativeBridgeV1[${JSON.stringify(method)}](...${JSON.stringify(args)})`, 55000)
  }
  close() { this.socket?.close() }
}

async function main(input) {
  const client = new NativeClient()
  try {
    await client.connect()
    if (input.command === 'status') {
      const models = await client.call('listModels')
      emit({ event: 'connected', connected: true, models: models.models })
      return
    }
    const sid = input.session_id
    if (typeof sid !== 'string' || !/^[a-f0-9-]{36}$/.test(sid)) throw Error('Invalid session identity')
    if (input.command === 'inspect') { emit({ event: 'state', ...await client.call('inspect', sid) }); return }
    if (input.command === 'cancel') {
      await client.call('rpc', 'session:cancel', [sid])
      emit({ event: 'cancel_requested' }); return
    }
    if (input.command !== 'run' || !path.isAbsolute(input.workspace) || !existsSync(input.workspace) || typeof input.prompt !== 'string' || input.prompt.length > 80000)
      throw Error('Invalid native execution request')
    const result = await client.call('createWorker', input.workspace, sid, `Rondo · ${input.title.slice(0, 100)}`)
    emit({ event: 'session_created', session_id: result.sessionId, workspace: result.workspace })
    const receipt = await client.call('wakeIdle', sid, input.wake_id, input.prompt, input.model || undefined)
    if (!receipt?.accepted) throw Error(receipt?.error || 'WorkBuddy session is busy or requires input; prompt was not dispatched')
    emit({ event: 'dispatched', receipt: receipt.receipt, model: input.model || null })
    const commands = readline.createInterface({ input: process.stdin })
    let cancelling = false
    commands.on('line', line => {
      try {
        if (JSON.parse(line).command === 'cancel' && !cancelling) {
          cancelling = true
          client.call('rpc', 'session:cancel', [sid]).then(() => emit({ event: 'cancel_requested' }), () => emit({ event: 'cancel_unknown' }))
        }
      } catch { /* Invalid input cannot start another prompt. */ }
    })
    for (;;) {
      const state = await client.call('inspect', sid)
      emit({ event: 'state', ...state })
      if (state.state === 'idle') { emit({ event: cancelling ? 'cancelled' : 'turn_ended' }); break }
      await pause(1500)
    }
    commands.close()
  } finally { client.close() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lines = readline.createInterface({ input: process.stdin })
  lines.once('line', async line => {
    lines.close()
    try { await main(JSON.parse(line)); process.exitCode = 0 }
    catch (error) { emit({ event: 'error', error: String(error.message).slice(0, 1400) }); process.exitCode = 1 }
  })
}
