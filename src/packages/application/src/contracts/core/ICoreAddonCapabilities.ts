import type { ICoreConnectionsAPI } from './ICoreConnectionsAPI'
import type { ICoreReadAPI } from './ICoreReadAPI'

/** Owner-scoped addon surface; mutable connection actions are separated from cache reads. */
export interface ICoreAddonCapabilities extends ICoreReadAPI {
  readonly connections: ICoreConnectionsAPI
}
