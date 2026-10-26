import type { Context, PlanResult, Review, ReviewStatus } from '../../shared/types'

export const terminal = new Set(['succeeded', 'failed', 'cancelled', 'interrupted'])
export type TaskAction =
  'plan' | 'review' | 'refresh' | 'changes' | 'guide' | 'plan-record' | 'review-record'
export function taskFlow(
  context: Context,
  planJob?: ReviewStatus,
  plan?: PlanResult,
  reviewJob?: ReviewStatus,
  review?: Review,
  patch?: string
) {
  if (planJob && !terminal.has(planJob.status))
    return {
      label:
        planJob.status === 'cancelling'
          ? '正在停止规划'
          : planJob.status === 'preparing'
            ? '正在准备规划'
            : 'Codex 规划作业进行中',
      detail: '本次生成在后台进行；不会自动重试。',
      action: 'plan-record' as TaskAction,
      button: '查看规划状态'
    }
  if (reviewJob && !terminal.has(reviewJob.status))
    return {
      label:
        reviewJob.status === 'cancelling'
          ? '正在停止审查'
          : reviewJob.status === 'preparing'
            ? '正在准备审查'
            : 'Codex 审查作业进行中',
      detail: '正在处理本次审查作业；执行与审查记录分开保存。',
      action: 'review-record' as TaskAction,
      button: '查看审查状态'
    }
  if (reviewJob?.status === 'succeeded' && !review)
    return {
      label: '正在读取审查结果',
      detail: '读取已保存的结果，不会再次生成。',
      action: 'refresh' as TaskAction,
      button: '刷新记录'
    }
  if (review) {
    if (review.freshness !== 'current')
      return {
        label: '代码变化，审查需要重新核对',
        detail: '已有意见针对旧快照，不能作为当前代码的验收结论。',
        action: 'changes' as TaskAction,
        button: '核对代码改动'
      }
    return {
      label: '审查结果已返回',
      detail: `结论 ${review.verdict} · 检查 ${review.checks.status}；仍需核对问题与验收条件。`,
      action: 'review-record' as TaskAction,
      button: '查看审查结果'
    }
  }
  if (reviewJob && terminal.has(reviewJob.status))
    return {
      label: '审查尚未完成',
      detail: '查看失败、取消或中断原因，再决定是否重新发起。',
      action: 'review-record' as TaskAction,
      button: '查看审查记录'
    }
  if (context.task.status === 'claimed')
    return {
      label: '执行任务已领取',
      detail: `领取者：${context.task.owner || '未提供名称'}。领取状态不等于执行完成。`,
      action: 'refresh' as TaskAction,
      button: '刷新执行记录'
    }
  if (context.task.status === 'submitted')
    return {
      label: '执行结果已提交',
      detail: '提交结果与代码检查、Codex 审查分别记录。',
      action: 'review' as TaskAction,
      button: '发起 Codex 审查（消耗额度）'
    }
  if (patch?.trim())
    return {
      label: '检测到工作区改动',
      detail: '差异来自当前文件；尚未收到执行完成提交。可核对后发起审查。',
      action: 'review' as TaskAction,
      button: '发起 Codex 审查（消耗额度）'
    }
  if (planJob?.status === 'succeeded' && !plan)
    return {
      label: '正在读取执行计划',
      detail: '读取已保存的结果，不会再次生成。',
      action: 'refresh' as TaskAction,
      button: '刷新记录'
    }
  if (plan) {
    if (plan.freshness !== 'current')
      return {
        label: '代码变化，计划已过期',
        detail: '先核对改动，再决定是否重新规划。',
        action: 'changes' as TaskAction,
        button: '核对代码改动'
      }
    return {
      label: '计划就绪，等待执行接入',
      detail: 'WorkBuddy 自动执行尚未接入。计划中的步骤和验收方式均未执行。',
      action: 'guide' as TaskAction,
      button: '查看执行接入说明'
    }
  }
  if (planJob && terminal.has(planJob.status))
    return {
      label: '计划尚未生成',
      detail: '查看失败、取消或中断原因；重新生成会消耗额度。',
      action: 'plan-record' as TaskAction,
      button: '查看规划记录'
    }
  return {
    label: '工作区就绪，等待规划',
    detail: '下一步由 Codex 根据需求生成计划；生成会使用本机账号额度。',
    action: 'plan' as TaskAction,
    button: '生成 Codex 计划（消耗额度）'
  }
}
