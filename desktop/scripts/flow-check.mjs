import assert from 'node:assert/strict'
import { taskFlow } from '../src/renderer/src/taskFlow.ts'
const context = { task: { status: 'ready' } }
const state = (status) => ({ job_id: 'fixture', status })
const plan = { freshness: 'current' }
const review = { freshness: 'current', verdict: 'pass', checks: { status: 'failed' } }
assert.equal(taskFlow(context).action, 'plan')
assert.equal(taskFlow(context, state('running')).action, 'plan-record')
assert.equal(taskFlow(context, state('succeeded')).action, 'refresh')
assert.equal(taskFlow(context, state('succeeded'), plan).action, 'execute')
assert.equal(
  taskFlow(context, state('succeeded'), plan, undefined, undefined, '+already planned').action,
  'execute'
)
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
assert.equal(
  taskFlow(context, undefined, undefined, undefined, undefined, undefined, {
    ...state('running'),
    phase: 'waiting_input'
  }).label,
  'WorkBuddy 等待你处理权限或输入'
)
assert.equal(
  taskFlow(context, undefined, undefined, undefined, undefined, undefined, {
    ...state('failed'),
    phase: 'dispatch_unknown'
  }).label,
  '执行状态需要核对'
)
const rejected = { ...review, verdict: 'changes_requested' }
const submitted = { task: { status: 'submitted' }, activity: [] }
assert.equal(
  taskFlow(submitted, undefined, undefined, state('succeeded'), rejected).action,
  'repair'
)
assert.equal(
  taskFlow(submitted, undefined, undefined, state('succeeded'), rejected, undefined, {
    ...state('running'),
    mode: 'repair'
  }).label,
  'WorkBuddy 正在返修'
)
assert.equal(
  taskFlow(submitted, undefined, undefined, state('succeeded'), rejected, undefined, {
    ...state('succeeded'),
    mode: 'repair'
  }).action,
  'review-record'
)
assert.equal(
  taskFlow(submitted, undefined, undefined, state('succeeded'), rejected, undefined, {
    ...state('failed'),
    mode: 'repair',
    summary: 'No progress'
  }).label,
  'WorkBuddy 返修未完成'
)
assert.equal(
  taskFlow(
    {
      ...submitted,
      activity: [
        { id: 'first', kind: 'review' },
        { id: 'fixture', kind: 'review' }
      ]
    },
    undefined,
    undefined,
    state('succeeded'),
    rejected
  ).action,
  'review-record'
)
console.log('Task flow: 21 state assertions passed; no model calls.')
