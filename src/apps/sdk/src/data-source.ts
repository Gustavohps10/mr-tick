import type {
  DataSourceContext,
  IMemberProvider,
  IMetadataProvider,
  ITaskProvider,
  ITimeEntryProvider,
  MappingFieldDefinition,
} from '@mr-tick/application'
import type { AppError, Either } from '@mr-tick/shared/helpers'

export type { DataSourceContext, MappingFieldDefinition }

export interface IDataSourceInstance {
  readonly tasksProvider: ITaskProvider
  readonly timeEntriesProvider: ITimeEntryProvider
  readonly membersProvider: IMemberProvider
  readonly metadataProvider: IMetadataProvider
}

export interface IDataSource {
  createInstance(context: DataSourceContext): IDataSourceInstance
  getStaticMappingFields?(): MappingFieldDefinition[]
  getMappingFields?(scope: {
    workspaceId: string
    connectionInstanceId: string
  }): Promise<Either<AppError, MappingFieldDefinition[]>>
}
