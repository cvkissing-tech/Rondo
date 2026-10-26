import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI } from '../shared/types'
const invoke = (name: string, ...args: unknown[]) =>
  ipcRenderer.invoke(`workbench:${name}`, ...args)
const api: DesktopAPI = {
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
  workbuddyStatus: (launch = false) => invoke('workbuddy-status', launch),
  startExecution: (id, request) => invoke('start-execution', id, request),
  executionStatus: (id) => invoke('execution-status', id),
  cancelExecution: (id) => invoke('cancel-execution', id),
  openWorkspace: (id) => invoke('open-workspace', id),
  copyWorkspace: (id) => invoke('copy-workspace', id),
  openGuide: () => invoke('open-guide')
}
contextBridge.exposeInMainWorld('workbench', api)
