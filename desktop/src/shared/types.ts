export interface Task {
  task_id: number
  title: string
  status: string
  instructions: string
  acceptance: string
}
export interface Context {
  repository: string
  task_id: number
  workspace: string
  base_commit: string
  task: Task
  latest_review_job_id: string | null
}
export interface ReviewStatus {
  job_id: string
  status: string
  error_code?: string
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
  openWorkspace(id: number): Promise<void>
  copyWorkspace(id: number): Promise<void>
  openGuide(): Promise<void>
}
