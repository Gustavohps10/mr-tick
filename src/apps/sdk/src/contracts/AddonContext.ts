import type { IEventsAPI } from '@mr-tick/application'
import type { ISystemEvents } from '@mr-tick/shared/transport'

import { IAddonThemesRegistry } from './AddonTheme'
import { ICommandRegistry } from './commands/ICommandRegistry'
import { IDataSourceRegistry } from './datasource/IDataSourceRegistry'
import { IMenusRegistry } from './menus/IMenusRegistry'
import { INotificationService } from './notifications/INotificationService'
import { IOAuthAPI } from './oauth/IOAuthAPI'
import { ISettingsRegistry } from './settings/ISettingsRegistry'
import { ITimeEntriesAPI } from './timer/ITimeEntriesAPI'
import { ITimerAPI } from './timer/ITimerAPI'

export * from './oauth/IOAuthAPI'

export interface IAddonEventsAPI extends IEventsAPI<ISystemEvents> {}

export interface IAddonStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export interface AddonContext {
  readonly addonId: string
  readonly commands: ICommandRegistry
  readonly menus: IMenusRegistry
  readonly settings: ISettingsRegistry
  readonly dataSources: IDataSourceRegistry
  readonly themes: IAddonThemesRegistry
  readonly events: IAddonEventsAPI
  readonly notifications: INotificationService
  readonly timer: ITimerAPI
  readonly timeEntries: ITimeEntriesAPI
  readonly storage: IAddonStorage
  readonly oauth: IOAuthAPI
}
