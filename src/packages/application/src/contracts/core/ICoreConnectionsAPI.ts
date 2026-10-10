import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { CoreConnection, CoreConnectionScope } from './CoreContext'

export interface ICoreConnectionsAPI {
  list(workspaceId: string): Promise<Either<AppError, CoreConnection[]>>
  get(scope: CoreConnectionScope): Promise<Either<AppError, CoreConnection>>
}
