import assert from 'node:assert/strict'
import { taskFlow } from '../src/renderer/src/taskFlow.ts'
const context = { task: { status: 'ready' } }
const state = (status) => ({ job_id: 'fixture', status })
const plan = { freshness: 'current' }
const review = { freshness: 'current', verdict: 'pass', checks: { status: 'failed' } }
assert.equal(taskFlow(context).action, 'plan')
assert.equal(taskFlow(context, state('running')).action, 'plan-record')
assert.equal(taskFlow(context, state('succeeded')).action, 'refresh')
assert.equal(taskFlow(context, state('succeeded'), plan).label, '计划就绪，等待执行接入')
assert.equal(taskFlow(context, state('succeeded'), { freshness: 'stale' }).action, 'changes')
assert.equal(
  taskFlow({ task: { status: 'claimed', owner: 'external executor' } }).label,
  '执行任务已领取'
)
assert.equal(taskFlow({ task: { status: 'submitted' } }).action, 'review')
assert.equal(
  taskFlow(context, undefined, undefined, undefined, undefined, '+changed').action,
  'review'
)
assert.equal(taskFlow(context, undefined, undefined, state('running')).action, 'review-record')
assert.equal(taskFlow(context, undefined, undefined, state('failed')).label, '审查尚未完成')
assert.equal(
  taskFlow(context, undefined, undefined, state('succeeded'), review).label,
  '审查结果已返回'
)
assert.match(
  taskFlow(context, undefined, undefined, state('succeeded'), review).detail,
  /检查 failed/
)
assert.equal(
  taskFlow(context, undefined, undefined, state('succeeded'), { ...review, freshness: 'stale' })
    .action,
  'changes'
)
console.log('Task flow: 13 state assertions passed; no model calls.')
