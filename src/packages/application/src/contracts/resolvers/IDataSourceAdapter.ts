import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  IMemberProvider,
  IMetadataProvider,
  ITaskProvider,
  ITimeEntryProvider,
} from '@/contracts/data'
import { IAuthenticationStrategy } from '@/contracts/strategies'
import { MemberDTO } from '@/dtos'

export interface IDataSourceAdapter {
  getAuthenticatedMemberData(): Either<AppError, MemberDTO>
  readonly id: string
  readonly authenticationStrategy: IAuthenticationStrategy
  readonly tasksProvider: ITaskProvider
  readonly timeEntriesProvider: ITimeEntryProvider
  readonly membersProvider: IMemberProvider
  readonly metadataProvider: IMetadataProvider
}
