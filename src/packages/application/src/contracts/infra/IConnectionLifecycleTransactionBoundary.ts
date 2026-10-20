import { AppError, Either } from '@mr-tick/shared/helpers'

import { IConnectionLifecycleRepository } from '../data/repositories/IConnectionLifecycleRepository'
import { IWorkspacesRepository } from '../data/repositories/IWorkspacesRepository'

export type ConnectionLifecycleTransactionContext = {
  readonly workspaces: IWorkspacesRepository
  readonly lifecycle: IConnectionLifecycleRepository
}

export interface IConnectionLifecycleTransactionBoundary {
  runInTransaction<T>(
    action: (
      context: ConnectionLifecycleTransactionContext,
    ) => Promise<Either<AppError, T>>,
  ): Promise<Either<AppError, T>>
}

export class NoOpConnectionLifecycleTransactionBoundary implements IConnectionLifecycleTransactionBoundary {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly lifecycleRepository: IConnectionLifecycleRepository,
  ) {}

  public async runInTransaction<T>(
    action: (
      context: ConnectionLifecycleTransactionContext,
    ) => Promise<Either<AppError, T>>,
  ): Promise<Either<AppError, T>> {
    return action({
      workspaces: this.workspacesRepository,
      lifecycle: this.lifecycleRepository,
    })
  }
}
