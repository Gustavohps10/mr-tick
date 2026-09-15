import { IEventEmitter, ISystemEvents } from '@mr-tick/shared/transport'

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

export interface IAddonEventsAPI extends IEventEmitter<ISystemEvents> {
  onTimerStart(
    callback: (payload: ISystemEvents['timer:start']) => void,
  ): () => void
  onTimerPause(
    callback: (payload: ISystemEvents['timer:pause']) => void,
  ): () => void
  onTimerResume(
    callback: (payload: ISystemEvents['timer:resume']) => void,
  ): () => void
  onTimerStop(
    callback: (payload: ISystemEvents['timer:stop']) => void,
  ): () => void
  onTimerUpdate(
    callback: (payload: ISystemEvents['timer:update']) => void,
  ): () => void
  onSystemIdle(
    callback: (payload: ISystemEvents['system:idle']) => void,
  ): () => void
  onSystemActive(
    callback: (payload: ISystemEvents['system:active']) => void,
  ): () => void
  onTimeEntryCreated(
    callback: (payload: ISystemEvents['timeEntry:created']) => void,
  ): () => void
  onTimeEntryUpdated(
    callback: (payload: ISystemEvents['timeEntry:updated']) => void,
  ): () => void
  onTimeEntryDeleted(
    callback: (payload: ISystemEvents['timeEntry:deleted']) => void,
  ): () => void
  onWorkspaceChange(
    callback: (payload: ISystemEvents['workspace:changed']) => void,
  ): () => void
}

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
