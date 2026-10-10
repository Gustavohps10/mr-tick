import type { IAddonSidebarAPI } from './sidebar'
import type { IAddonTimerbarAPI } from './timerbar'

export interface IAddonMenusAPI {
  readonly sidebar: IAddonSidebarAPI
  readonly timerbar: IAddonTimerbarAPI
}
