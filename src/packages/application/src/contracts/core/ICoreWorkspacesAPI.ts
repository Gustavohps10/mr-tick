import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { CoreWorkspace } from './CoreContext'

export interface ICoreWorkspacesAPI {
  list(): Promise<Either<AppError, CoreWorkspace[]>>
  get(workspaceId: string): Promise<Either<AppError, CoreWorkspace>>
}
