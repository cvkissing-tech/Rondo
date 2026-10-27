import { agentName, defaultAgents } from '../../shared/types.ts'
import type { Context, ExecutionStatus, PlanResult, Review, ReviewStatus } from '../../shared/types'

export const terminal = new Set(['succeeded', 'failed', 'cancelled', 'interrupted'])
export type TaskAction =
  | 'plan'
  | 'review'
  | 'execute'
  | 'repair'
  | 'refresh'
  | 'changes'
  | 'guide'
  | 'plan-record'
  | 'review-record'
export function taskFlow(
  context: Context,
  planJob?: ReviewStatus,
  plan?: PlanResult,
  reviewJob?: ReviewStatus,
  review?: Review,
  patch?: string,
  execution?: ExecutionStatus
) {
  const selected = context.agents || defaultAgents
  const plannerName = agentName(selected.planner),
    executorName = agentName(selected.executor),
    reviewerName = agentName(selected.reviewer)
  if (execution && !terminal.has(execution.status))
    return {
      label:
        execution.phase === 'waiting_input'
          ? `${executorName} 等待你处理权限或输入`
          : execution.status === 'cancelling'
            ? `正在停止 ${executorName}`
            : execution.mode === 'repair'
              ? `${executorName} 正在返修`
              : `${executorName} 正在执行`,
      detail: `在专用原生会话执行；完成提交后自动接续检查与 ${reviewerName} 审查。`,
      action: 'refresh' as TaskAction,
      button: '刷新执行记录'
    }
  if (planJob && !terminal.has(planJob.status))
    return {
      label:
        planJob.status === 'cancelling'
          ? '正在停止规划'
          : planJob.status === 'preparing'
            ? '正在准备规划'
            : `${plannerName} 规划作业进行中`,
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
            : `${reviewerName} 审查作业进行中`,
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
  if (execution && terminal.has(execution.status) && execution.status !== 'succeeded')
    return {
      label:
        execution.phase === 'dispatch_unknown' || execution.status === 'interrupted'
          ? '执行状态需要核对'
          : execution.mode === 'repair'
            ? `${executorName} 返修未完成`
            : `${executorName} 执行未完成`,
      detail: execution.summary || '读取原执行记录；不会自动重发任务。',
      action: 'refresh' as TaskAction,
      button: '刷新执行记录'
    }
  if (review) {
    if (review.freshness !== 'current')
      return {
        label: '代码变化，审查需要重新核对',
        detail: '已有意见针对旧快照，不能作为当前代码的验收结论。',
        action: 'changes' as TaskAction,
        button: '核对代码改动'
      }
    if (review.verdict === 'changes_requested') {
      const repaired = execution?.mode === 'repair' || Boolean(execution?.repair_job_id)
      const reviewCount = new Set([
        ...(context.activity || []).filter((row) => row.kind === 'review').map((row) => row.id),
        ...(reviewJob ? [reviewJob.job_id] : [])
      ]).size
      const canRepair = !repaired && reviewCount < 2 && context.task.status === 'submitted'
      return {
        label: repaired
          ? '返修后仍有问题，需要处理'
          : reviewCount >= 2
            ? '审查仍有问题，次数已用完'
            : '审查要求修改',
        detail: repaired
          ? '本任务的一次返修已用完，查看剩余问题后决定下一步。'
          : reviewCount >= 2
            ? '本任务的两次审查已用完，查看剩余问题后决定下一步。'
            : execution?.repair_error
              ? `自动交接已停止：${execution.repair_error}。核对记录后可继续交接。`
              : '将根据当前审查定位的问题返修一次，然后自动复查；使用各Agent账号额度。',
        action: canRepair ? ('repair' as TaskAction) : ('review-record' as TaskAction),
        button: canRepair ? `交给 ${executorName} 返修（消耗额度）` : '查看剩余问题'
      }
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
      detail: `提交结果与代码检查、${reviewerName} 审查分别记录。`,
      action: 'review' as TaskAction,
      button: `发起 ${reviewerName} 审查（消耗额度）`
    }
  if (patch?.trim() && !plan)
    return {
      label: '检测到工作区改动',
      detail: '差异来自当前文件；尚未收到执行完成提交。可核对后发起审查。',
      action: 'review' as TaskAction,
      button: `发起 ${reviewerName} 审查（消耗额度）`
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
      label: `计划就绪，可以交给 ${executorName}`,
      detail: '执行后自动检查、审查；需要修改时至多返修并复查一次。使用各Agent账号额度。',
      action: 'execute' as TaskAction,
      button: '执行、审查与一次返修（消耗额度）'
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
    detail: `下一步由 ${plannerName} 根据需求生成计划；生成会使用本机账号额度。`,
    action: 'plan' as TaskAction,
    button: `生成 ${plannerName} 计划（消耗额度）`
  }
}
