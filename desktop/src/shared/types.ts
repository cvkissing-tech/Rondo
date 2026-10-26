export interface Task {
  task_id: number
  title: string
  status: string
  instructions: string
  acceptance: string
  owner?: string | null
  result?: { summary: string } | null
}
export interface Context {
  repository: string
  task_id: number
  workspace: string
  base_commit: string
  task: Task
  latest_review_job_id: string | null
  latest_plan_job_id: string | null
  latest_execution_job_id?: string | null
  activity: {
    id: string
    kind: 'workspace' | 'plan' | 'review' | 'execution'
    status: string
    created_at: number
    updated_at: number
    error_code?: string | null
  }[]
  activity_truncated: boolean
}
export interface PlanResult {
  usage?: { total?: { totalTokens?: number; inputTokens?: number; outputTokens?: number } } | null
  cost?: number | null
  job_id: string
  plan_id: string
  freshness: string
  plan: {
    context_id: string
    summary: string
    steps: { title: string; details: string; files: string[]; verification: string[] }[]
    assumptions: string[]
  }
  context: { files: string[]; file_count: number; file_list_truncated: boolean }
}
export interface ReviewStatus {
  job_id: string
  status: string
  error_code?: string
}
export interface ExecutionStatus extends ReviewStatus {
  mode?: 'implementation' | 'repair' | null
  source_review_job_id?: string | null
  repair_job_id?: string | null
  repair_error?: string | null
  model?: string | null
  session_id?: string | null
  phase?: string | null
  summary?: string | null
  review_job_id?: string | null
  review_error?: string | null
}
export interface WorkBuddyConnection {
  connected: boolean
  error?: string
  code?: string
  models?: { id: string; name: string }[]
}
export interface Review {
  summary: string
  verdict: string
  freshness: string
  findings: {
    path: string
    line: number | null
    priority: number
    trigger: string
    impact: string
    evidence: string
  }[]
  next_after_index: number | null
  checks: { status: string }
}
export interface StartInput {
  repo: string
  title: string
  instructions: string
  acceptance: string
  request_id: string
}
export interface DesktopAPI {
  status(): Promise<{ connected: boolean; tools: number; database: string; error?: string }>
  chooseProject(): Promise<string | undefined>
  listTasks(after?: number): Promise<{ items: Task[]; next_after_id: number | null }>
  startTask(input: StartInput): Promise<Context>
  context(id: number): Promise<Context>
  changes(id: number): Promise<{ patch: string; truncated: boolean }>
  startReview(id: number, request: string): Promise<ReviewStatus>
  reviewStatus(id: string): Promise<ReviewStatus>
  readReview(id: string, after?: number): Promise<Review>
  cancelReview(id: string): Promise<ReviewStatus>
  startPlan(id: number, request: string): Promise<ReviewStatus>
  planStatus(id: string): Promise<ReviewStatus>
  readPlan(id: string): Promise<PlanResult>
  cancelPlan(id: string): Promise<ReviewStatus>
  workbuddyStatus(launch?: boolean): Promise<WorkBuddyConnection>
  startExecution(id: number, request: string): Promise<ExecutionStatus>
  startRepair(sourceReviewId: string): Promise<ExecutionStatus>
  executionStatus(id: string): Promise<ExecutionStatus>
  cancelExecution(id: string): Promise<ExecutionStatus>
  openWorkspace(id: number): Promise<void>
  copyWorkspace(id: number): Promise<void>
  openGuide(): Promise<void>
}
