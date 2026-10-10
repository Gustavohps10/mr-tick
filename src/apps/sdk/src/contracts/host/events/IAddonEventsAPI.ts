import type { IEventsAPI } from '@mr-tick/application'
import type { ISystemEvents } from '@mr-tick/shared/transport'

export type AddonSystemEvents = Pick<
  ISystemEvents,
  | 'timer:start'
  | 'timer:pause'
  | 'timer:resume'
  | 'timer:stop'
  | 'timer:update'
  | 'workspace:changed'
>
export interface IAddonEventsAPI extends IEventsAPI<AddonSystemEvents> {}
