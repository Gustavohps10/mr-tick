import { IHostBridge } from '@mr-tick/application'

const ipcClient: IHostBridge = {
  workspaces: window.api.workspaces,
  session: window.api.session,
  tasks: window.api.tasks,
  timeEntries: window.api.timeEntries,
  metadata: window.api.metadata,
  tokens: window.api.tokens,
  headers: window.api.headers,
  system: window.api.system,
  updater: window.api.updater,
  addons: window.api.addons,
  timer: window.api.timer,
  events: window.api.events,
}

export { ipcClient }
