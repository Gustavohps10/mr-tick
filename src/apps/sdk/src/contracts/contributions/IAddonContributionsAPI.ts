import type { IAddonCommandsAPI } from './commands'
import type { IAddonDataSourcesAPI } from './data-sources'
import type { IAddonMenusAPI } from './menus'
import type { IAddonSettingsAPI } from './settings'
import type { IAddonThemesAPI } from './themes'

/** Contributions registered with the host and owned by this addon. */
export interface IAddonContributionsAPI {
  readonly commands: IAddonCommandsAPI
  readonly menus: IAddonMenusAPI
  readonly settings: IAddonSettingsAPI
  readonly dataSources: IAddonDataSourcesAPI
  readonly themes: IAddonThemesAPI
}
