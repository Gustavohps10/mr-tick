import type { ConnectionIdentity } from '@mr-tick/domain'
import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { AnalyticsQueryAuthorization } from '../data/providers/IAnalyticsEngine'
import type { IAnalyticsProvider } from '../data/providers/IAnalyticsProvider'
import type { AddonConnectionContext } from './IDataSourceResolver'

export interface AnalyticsProviderContext extends AddonConnectionContext {
  identity: ConnectionIdentity
}

export interface IAnalyticsSource {
  createInstance(context: AnalyticsProviderContext): IAnalyticsProvider
}

export interface IAnalyticsResolver {
  resolve(
    workspaceId: string,
    connectionInstanceId: string,
  ): Promise<
    Either<AppError, { provider: IAnalyticsProvider; authorizationKey: string }>
  >
  resolveWorkspaceAuthorizations(
    workspaceId: string,
  ): Promise<Either<AppError, AnalyticsQueryAuthorization[]>>
}
