import { IHostBridge } from '@mr-tick/application'

const ipcClient: IHostBridge = {
  localPersistence: window.api.localPersistence,
  localSync: window.api.localSync,
  localRuntime: window.api.localRuntime,
  workspaces: window.api.workspaces,
  session: window.api.session,
  tasks: window.api.tasks,
  timeEntries: window.api.timeEntries,
  metadata: window.api.metadata,
  vault: window.api.vault,
  headers: window.api.headers,
  system: window.api.system,
  updater: window.api.updater,
  addons: window.api.addons,
  events: window.api.events,
}

export { ipcClient }
