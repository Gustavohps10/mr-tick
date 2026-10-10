import type { ICoreReadAPI } from './ICoreReadAPI'
import type { ICoreTimeEntriesAPI } from './ICoreTimeEntriesAPI'
import type { ICoreTimerAPI } from './ICoreTimerAPI'

/** Core product operations exposed to addon consumers. */
export interface ICoreAPI extends ICoreReadAPI {
  readonly timer: ICoreTimerAPI
  readonly timeEntries: ICoreTimeEntriesAPI
}
