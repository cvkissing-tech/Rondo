// Fixture transport adapted from upstream test/native-desktop-trigger.test.ts at
// fbaaa2ef6d6cb59f48b953a1f27058202a81553f. No WorkBuddy or model is invoked.
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { RENDERER_BRIDGE } from './native-bridge.mjs'

class Port {
  start() {}
  close() { this.closed = true }
  postMessage(data) { queueMicrotask(() => { if (!this.closed && !this.peer.closed) this.peer.onmessage?.({ data }) }) }
}
class Channel {
  constructor() { this.port1 = new Port(); this.port2 = new Port(); this.port1.peer = this.port2; this.port2.peer = this.port1 }
}
async function fixture() {
  const requests = [], ports = [], sid = '11111111-1111-4111-8111-111111111111'
  const state = { cwd: 'C:/fixture', sessionId: sid, status: 'completed', model: 'fast' }
  let active = [], emitReceipt = true, clock = 0, ignoreModel = false
  class Clock extends Date { static now() { return clock } }
  const window = { postMessage(message, target, transfer) {
    assert.equal(message.type, 'workbuddy:open-local-daemon-transport-port')
    const port = transfer[0]; ports.push(port)
    port.onmessage = event => {
      const request = event.data.json; requests.push(request)
      let result
      switch (request.channel) {
        case 'workspace:initialize': result = { success: true }; break
        case 'session:create': Object.assign(state, request.args[0]); result = state; break
        case 'session:rename': result = {}; break
        case 'session:notifyListenerReady': result = {}; break
        case 'session:resolvePermission': result = true; break
        case 'daemon:getActiveSessions': result = active; break
        case 'session:get': result = state; break
        case 'config:getProductConfiguration': result = { models: [{ id: 'fast' }, { id: 'deep' }], availableModels: ['fast','deep'] }; break
        case 'session:updateConfig': if(!ignoreModel)Object.assign(state, request.args[1]); result = {}; break
        case 'session:cancel': result = {}; break
        case 'session:sendMessage': {
          if (emitReceipt) port.postMessage({ kind: 'message', json: { type: 'event', channel: 'session:event:' + sid,
            result: { sessionId: sid, update: { sessionUpdate: 'user_message_chunk' }, _meta: request.args[2] } } })
          result = { stopReason: 'end_turn' }; break
        }
        default: throw Error('Unexpected channel: ' + request.channel)
      }
      port.postMessage({ kind: 'message', json: { id: request.id, type: 'response', result } })
    }
    port.postMessage({ kind: 'open' })
  } }
  const context = vm.createContext({ window, MessageChannel: Channel, Date: Clock,
    setTimeout: (fn, delay) => setTimeout(() => { if (delay === 100) clock += 100; fn() }, delay === 100 ? 0 : delay), clearTimeout })
  await vm.runInContext(RENDERER_BRIDGE, context)
  return { bridge: vm.runInContext('globalThis.__rondoNativeBridgeV1', context), requests, state, sid,
    control: data => ports[0].postMessage({ kind: 'message', json: { type: 'event', channel: 'session:event:' + sid, result: { sessionId: sid, ...data } } }),
    update: update => ports[0].postMessage({ kind: 'message', json: { type: 'event', channel: 'session:event:' + sid, result: { sessionId: sid, update } } }),
    busy: () => { active = [{ sessionId: sid }] }, noReceipt: () => { emitReceipt = false }, ignoreModel:()=>{ignoreModel=true} }
}
test('native workspace/session creation preserves identity and does not prompt', async () => {
  const f = await fixture()
  const created = await f.bridge.createWorker('C:/fixture', f.sid, 'Rondo')
  assert.equal(created.sessionId, f.sid)
  assert.deepEqual(f.requests.map(r=>r.channel), ['workspace:initialize','session:create','session:rename','session:notifyListenerReady'])
})
test('one receipt prevents duplicate prompts; model changes stay on the dedicated session', async () => {
  const f = await fixture(), wake = 'wake-run-22222222-2222-4222-8222-222222222222'
  const receipt=await f.bridge.wakeIdle(f.sid, wake, 'fixture', 'deep')
  assert.equal(receipt.accepted, true)
  assert.equal(receipt.model, 'deep')
  assert.equal(f.state.model, 'deep')
  assert.equal((await f.bridge.wakeIdle(f.sid, wake, 'fixture')).accepted, true)
  assert.equal(f.requests.filter(r=>r.channel==='session:sendMessage').length, 1)
})

test('native model mismatch and unavailable model prevent sending the prompt', async () => {
  const f=await fixture();f.ignoreModel()
  const wake='wake-run-22222222-2222-4222-8222-222222222222'
  assert.equal((await f.bridge.wakeIdle(f.sid,wake,'fixture','deep')).accepted,false)
  assert.equal((await f.bridge.wakeIdle(f.sid,wake,'fixture','missing')).accepted,false)
  assert.equal(f.requests.filter(r=>r.channel==='session:sendMessage').length,0)
})
test('busy native sessions and pending permissions are not dispatched', async () => {
  const f = await fixture(); f.busy()
  assert.equal((await f.bridge.wakeIdle(f.sid,'wake-run-22222222-2222-4222-8222-222222222222','x')).accepted,false)
  assert.equal(f.requests.filter(r=>r.channel==='session:sendMessage').length,0)
  const g=await fixture();g.state.pendingPermissions=[{}]
  assert.equal((await g.bridge.inspect(g.sid)).state,'waiting_input')
})
test('uncertain submission is an error and never triggers a second send', async () => {
  const f=await fixture();f.noReceipt()
  await assert.rejects(f.bridge.wakeIdle(f.sid,'wake-run-22222222-2222-4222-8222-222222222222','x'),/uncertain/)
  assert.equal(f.requests.filter(r=>r.channel==='session:sendMessage').length,1)
})

test('terminated is idle only after native active sessions and outgoing calls clear', async () => {
  const f = await fixture(); f.state.status = 'terminated'
  assert.equal((await f.bridge.inspect(f.sid)).state, 'idle')
  f.busy()
  assert.equal((await f.bridge.inspect(f.sid)).state, 'busy')
})

test('owned worker publishes messages and tool progress, excludes reasoning and drains once', async () => {
  const f = await fixture()
  await f.bridge.createWorker('C:/fixture', f.sid, 'Rondo')
  f.update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'private thought' } })
  f.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Writing ' } })
  f.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'code' } })
  f.update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Write game.js', status: 'in_progress' })
  f.update({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'saved' } }] })
  await new Promise(resolve => setImmediate(resolve))
  const events = f.bridge.drainEvents(f.sid)
  assert.equal(events.length, 3)
  assert.equal(events[0].text, 'Writing code')
  assert.equal(events[2].text, 'saved')
  assert.equal(f.bridge.drainEvents(f.sid).length, 0)
  assert.equal(f.bridge.drainEvents('unowned').length, 0)
})

test('native permission events remain actionable even when session:get hides pending inputs', async () => {
  const f = await fixture()
  await f.bridge.createWorker('C:/fixture', f.sid, 'Rondo')
  const request = {toolCall: {title:'Clean fixture output',rawInput:{command:'fixture-clean'}}, options:[{optionId:'allow',kind:'allow_once',name:'允许这一次'},{optionId:'reject',kind:'reject_once',name:'拒绝'}]}
  f.control({type:'permissionRequest',requestId:'permission-1',request})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal((await f.bridge.inspect(f.sid)).state,'waiting_input')
  assert.equal(f.bridge.permissionRequest(f.sid).params.command,'fixture-clean')
  await assert.rejects(f.bridge.answerPermission(f.sid,'permission-1','allow_always'),/invalid/)
  assert.equal(f.requests.filter(r=>r.channel==='session:resolvePermission').length,0)
  assert.equal(await f.bridge.answerPermission(f.sid,'permission-1','allow'),true)
  const call=f.requests.find(r=>r.channel==='session:resolvePermission')
  assert.deepEqual(Array.from(call.args),[f.sid,'permission-1','allow'])
  assert.equal(f.bridge.permissionRequest(f.sid),null)
  assert.equal((await f.bridge.inspect(f.sid)).state,'idle')
  await assert.rejects(f.bridge.answerPermission(f.sid,'permission-1','allow'),/expired/)
  assert.equal(f.requests.filter(r=>r.channel==='session:sendMessage').length,0)
})

test('native resolution and confirmed cancellation clear owned input waits', async () => {
  const f=await fixture()
  await f.bridge.createWorker('C:/fixture',f.sid,'Rondo')
  f.control({type:'questionRequest',toolCallId:'question-1',request:{}})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal((await f.bridge.inspect(f.sid)).state,'waiting_input')
  assert.equal(f.bridge.permissionRequest(f.sid),null)
  f.control({type:'questionResolved',toolCallId:'question-1'})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal((await f.bridge.inspect(f.sid)).state,'idle')
  f.control({type:'permissionRequest',requestId:'native-1',request:{options:[]}})
  await new Promise(resolve=>setImmediate(resolve))
  await f.bridge.cancelWorker(f.sid)
  assert.equal((await f.bridge.inspect(f.sid)).state,'idle')
  assert.equal(f.requests.filter(r=>r.channel==='session:cancel').length,1)
})
