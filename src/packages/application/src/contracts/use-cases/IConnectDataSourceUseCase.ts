import { AppError, Either } from '@mr-tick/shared/helpers'

import { ConnectionResultDTO } from '@/dtos/ConnectionResultDTO'

export interface ConnectDataSourceInput<Credentials, Configuration> {
  workspaceId: string
  connectionInstanceId: string
  pluginId: string
  credentials: Credentials
  configuration: Configuration
}

export interface IConnectDataSourceUseCase {
  execute<
    Credentials extends Record<string, string | number | boolean>,
    Configuration extends Record<string, string | number | boolean>,
  >(
    input: ConnectDataSourceInput<Credentials, Configuration>,
  ): Promise<Either<AppError, ConnectionResultDTO>>
}
