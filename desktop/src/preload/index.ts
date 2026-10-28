import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI } from '../shared/types'
const invoke = (name: string, ...args: unknown[]) =>
  ipcRenderer.invoke(`workbench:${name}`, ...args)
const api: DesktopAPI = {
  agentModels: (agent) => invoke('agent-models', agent),
  saveModel: (input) => invoke('save-model', input),
  agentSettings: () => invoke('agent-settings'),
  saveAgent: (input) => invoke('save-agent', input),
  chooseAgentProgram: () => invoke('choose-agent-program'),
  checkAgent: (id) => invoke('check-agent', id),
  openAgentConfig: () => invoke('open-agent-config'),
  agents: () => invoke('agents'),
  status: () => invoke('status'),
  chooseProject: () => invoke('choose-project'),
  listTasks: (after = 0) => invoke('list-tasks', after),
  startTask: (input) => invoke('start-task', input),
  context: (id) => invoke('context', id),
  changes: (id) => invoke('changes', id),
  startReview: (id, request) => invoke('start-review', id, request),
  reviewStatus: (id) => invoke('review-status', id),
  readReview: (id, after = 0) => invoke('read-review', id, after),
  cancelReview: (id) => invoke('cancel-review', id),
  startPlan: (id, request) => invoke('start-plan', id, request),
  planStatus: (id) => invoke('plan-status', id),
  readPlan: (id) => invoke('read-plan', id),
  cancelPlan: (id) => invoke('cancel-plan', id),
  sendPlanningMessage: (id, request, message) => invoke('planning-message', id, request, message),
  planningConversation: (id) => invoke('planning-conversation', id),
  workbuddyStatus: (launch = false) => invoke('workbuddy-status', launch),
  startExecution: (id, request, planJob, planId) =>
    invoke('start-execution', id, request, planJob, planId),
  startRepair: (id) => invoke('start-repair', id),
  executionStatus: (id) => invoke('execution-status', id),
  cancelExecution: (id) => invoke('cancel-execution', id),
  openWorkspace: (id) => invoke('open-workspace', id),
  workspaceFiles: (id) => invoke('workspace-files', id),
  readFile: (id, path) => invoke('read-file', id, path),
  openArtifact: (id, path) => invoke('open-artifact', id, path),
  openSession: (id, agent) => invoke('open-session', id, agent),
  answerRequest: (job, request, answer, kind) =>
    invoke('answer-request', job, request, answer, kind),
  copyWorkspace: (id) => invoke('copy-workspace', id),
  openGuide: () => invoke('open-guide')
}
contextBridge.exposeInMainWorld('workbench', api)
