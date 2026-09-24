import { ElectronAPI } from '@electron-toolkit/preload'

import type { IHostBridge } from '@mr-tick/application'

declare global {
  interface Window {
    electron: ElectronAPI
    api: IHostBridge
  }
}
