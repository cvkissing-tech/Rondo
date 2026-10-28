import assert from 'node:assert/strict'
import { nativeSessionNotice } from '../src/shared/sessionAccess.ts'
assert.match(nativeSessionNotice({ status: 'running' }, 'codex'), /打开不会停止任务/)
assert.match(nativeSessionNotice({ status: 'running' }, 'workbuddy'), /打开不会重新派发任务/)
assert.equal(
  nativeSessionNotice({ status: 'running', phase: 'waiting_input' }, 'workbuddy'),
  undefined
)
assert.equal(nativeSessionNotice({ status: 'succeeded' }, 'codex'), undefined)
assert.equal(nativeSessionNotice({ status: 'failed' }, 'workbuddy'), undefined)
console.log('Native session notices: 5 assertions passed; no app/model calls')
