import type { ICoreAPI } from '@mr-tick/application'

import type { IAddonContributionsAPI } from './contributions'
import type { IAddonHostAPI } from './host'

/** Public addon surface, grouped by responsibility. */
export interface AddonContext {
  readonly core: ICoreAPI
  readonly contributions: IAddonContributionsAPI
  readonly host: IAddonHostAPI
}
