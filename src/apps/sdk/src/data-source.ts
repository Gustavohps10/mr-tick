import type {
  DataSourceContext,
  IMemberProvider,
  IMetadataProvider,
  ITaskProvider,
  ITimeEntryProvider,
  MappingFieldDefinition,
} from '@mr-tick/application'
import type { ConnectionProfileDescriptor } from '@mr-tick/domain'
import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { AddonSettingsSchema } from './contracts/contributions/settings'

export type { DataSourceContext, MappingFieldDefinition }

export interface IDataSourceInstance {
  readonly tasksProvider: ITaskProvider
  readonly timeEntriesProvider: ITimeEntryProvider
  readonly membersProvider: IMemberProvider
  readonly metadataProvider: IMetadataProvider
}

export interface IDataSource {
  getConnectionProfiles(): ConnectionProfileDescriptor[]
  getConnectionSchema(): AddonSettingsSchema
  createInstance(context: DataSourceContext): IDataSourceInstance
  getStaticMappingFields?(): MappingFieldDefinition[]
  getMappingFields?(scope: {
    workspaceId: string
    connectionInstanceId: string
  }): Promise<Either<AppError, MappingFieldDefinition[]>>
}
