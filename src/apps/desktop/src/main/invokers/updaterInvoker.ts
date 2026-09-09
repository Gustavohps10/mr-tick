import { IUpdaterAPI } from '@mr-tick/application'

import { IpcInvoker } from '@/main/adapters/IpcInvoker'

export const updaterInvoker: IUpdaterAPI = {
  checkForUpdates: () => IpcInvoker.invoke('UPDATER_CHECK'),
  downloadUpdate: () => IpcInvoker.invoke('UPDATER_DOWNLOAD'),
  quitAndInstall: () => IpcInvoker.invoke('UPDATER_INSTALL'),
}
