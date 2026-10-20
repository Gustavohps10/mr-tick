import type { ICoreAddonCapabilities } from './ICoreAddonCapabilities'
import type { ICoreTimeEntriesAPI } from './ICoreTimeEntriesAPI'
import type { ICoreTimerAPI } from './ICoreTimerAPI'

/** Core product operations exposed to addon consumers. */
export interface ICoreAPI extends ICoreAddonCapabilities {
  readonly timer: ICoreTimerAPI
  readonly timeEntries: ICoreTimeEntriesAPI
}
