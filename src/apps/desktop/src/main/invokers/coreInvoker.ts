import type { ICoreBridgeAPI } from '@mr-tick/application'

import { IpcInvoker } from '@/main/adapters/IpcInvoker'

export const coreInvoker: ICoreBridgeAPI = {
  listConnections: (req) => IpcInvoker.invoke('CORE_CONNECTIONS_LIST', req),
  listTasks: (req) => IpcInvoker.invoke('CORE_TASKS_LIST', req),
  getTask: (req) => IpcInvoker.invoke('CORE_TASK_GET', req),
  getMetadata: (req) => IpcInvoker.invoke('CORE_METADATA_GET', req),
}
