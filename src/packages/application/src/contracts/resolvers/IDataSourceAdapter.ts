import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  IMemberProvider,
  IMetadataProvider,
  ITaskProvider,
  ITimeEntryProvider,
} from '@/contracts/data'
/** Minimal member reference derivable from a connection identity. */
export interface AuthenticatedMember {
  readonly id: string
  readonly firstname: string
  readonly lastname: string
}

export interface IDataSourceAdapter {
  getAuthenticatedMemberData(): Either<AppError, AuthenticatedMember>
  readonly id: string
  readonly tasksProvider: ITaskProvider
  readonly timeEntriesProvider: ITimeEntryProvider
  readonly membersProvider: IMemberProvider
  readonly metadataProvider: IMetadataProvider
}
