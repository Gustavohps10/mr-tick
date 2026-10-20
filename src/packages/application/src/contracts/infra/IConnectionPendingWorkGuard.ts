import { AppError, Either } from '@mr-tick/shared/helpers'

export interface IConnectionPendingWorkGuard {
  withNoPendingWrites<T>(
    workspaceId: string,
    connectionInstanceIds: readonly string[],
    operation: () => Promise<Either<AppError, T>>,
  ): Promise<Either<AppError, T>>
}
