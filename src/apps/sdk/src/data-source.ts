import type {
  DataSourceContext,
  IAuthenticationStrategy,
  IMemberProvider,
  IMetadataProvider,
  ITaskProvider,
  ITimeEntryProvider,
  MappingFieldDefinition,
} from '@mr-tick/application'
import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { AddonSettingsSchema } from './contracts/settings'

export type { DataSourceContext, MappingFieldDefinition }

export interface IDataSourceInstance {
  readonly authStrategy: IAuthenticationStrategy
  readonly tasksProvider: ITaskProvider
  readonly timeEntriesProvider: ITimeEntryProvider
  readonly membersProvider: IMemberProvider
  readonly metadataProvider: IMetadataProvider
}

export interface IDataSource {
  getConnectionSchema(): AddonSettingsSchema
  createInstance(context: DataSourceContext): IDataSourceInstance
  getMappingFields?():
    | Promise<Either<AppError, MappingFieldDefinition[]>>
    | MappingFieldDefinition[]
}
