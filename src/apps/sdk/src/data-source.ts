import type {
  ConnectionHealthDTO,
  DataSourceContext,
  IAuthenticationStrategy,
  IMemberProvider,
  IMetadataProvider,
  ITaskProvider,
  ITimeEntryProvider,
} from '@mr-tick/application'
import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { AddonSettingsSchema } from './contracts/settings'

export type { DataSourceContext }

export interface IDataSourceInstance {
  readonly authStrategy: IAuthenticationStrategy
  readonly tasksProvider: ITaskProvider
  readonly timeEntriesProvider: ITimeEntryProvider
  readonly membersProvider: IMemberProvider
  readonly metadataProvider: IMetadataProvider
  testConnection?(): Promise<Either<AppError, ConnectionHealthDTO>>
}

export interface IDataSource {
  getConnectionSchema(): AddonSettingsSchema
  createInstance(context: DataSourceContext): IDataSourceInstance
}
