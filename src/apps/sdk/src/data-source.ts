import type {
  DataSourceContext,
  IAuthenticationStrategy,
  IMemberProvider,
  IMetadataProvider,
  ITaskProvider,
  ITimeEntryProvider,
} from '@mr-tick/application'

export type { DataSourceContext }

export interface IDataSourceInstance {
  readonly authStrategy: IAuthenticationStrategy
  readonly tasksProvider: ITaskProvider
  readonly timeEntriesProvider: ITimeEntryProvider
  readonly membersProvider: IMemberProvider
  readonly metadataProvider: IMetadataProvider
}

import type { AddonSettingsSchema } from './contracts/settings'

export interface IDataSource {
  getConnectionSchema(): AddonSettingsSchema
  createInstance(context: DataSourceContext): IDataSourceInstance
}
