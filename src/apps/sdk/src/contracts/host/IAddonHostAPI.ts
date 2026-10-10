import type { IAddonEventsAPI } from './events'
import type { IAddonNotificationsAPI } from './notifications'
import type { IAddonOAuthAPI } from './oauth'
import type { IAddonVaultAPI } from './vault'

/** Host facilities scoped to the current addon. */
export interface IAddonHostAPI {
  readonly events: IAddonEventsAPI
  readonly notifications: IAddonNotificationsAPI
  readonly vault: IAddonVaultAPI
  readonly oauth: IAddonOAuthAPI
}
