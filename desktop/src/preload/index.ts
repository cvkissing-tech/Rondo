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
  openWorkspace: (id) => invoke('open-workspace', id),
  copyWorkspace: (id) => invoke('copy-workspace', id),
  openGuide: () => invoke('open-guide')
}
contextBridge.exposeInMainWorld('workbench', api)
