import { ITaskAPI } from '@mr-tick/application'

import { IpcInvoker } from '@/main/adapters/IpcInvoker'

export const tasksInvoker: ITaskAPI = {
  listTasks: (req) => IpcInvoker.invoke('TASKS_LIST', req),
  pull: (payload) => IpcInvoker.invoke('TASKS_PULL', payload),
}
