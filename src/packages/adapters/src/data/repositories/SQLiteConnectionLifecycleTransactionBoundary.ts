import {
  ConnectionLifecycleTransactionContext,
  IConnectionLifecycleTransactionBoundary,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { Knex } from 'knex'

import { withSafeTransaction } from './sqlite-connection'
import { SQLiteConnectionLifecycleRepository } from './SQLiteConnectionLifecycleRepository'
import { SQLiteWorkspacesRepository } from './SQLiteWorkspaceRepository'

export class SQLiteConnectionLifecycleTransactionBoundary implements IConnectionLifecycleTransactionBoundary {
  constructor(private readonly db: Knex) {}

  public async runInTransaction<T>(
    action: (
      context: ConnectionLifecycleTransactionContext,
    ) => Promise<Either<AppError, T>>,
  ): Promise<Either<AppError, T>> {
    return withSafeTransaction(this.db, async (trx) => {
      const transactionalWorkspaces = new SQLiteWorkspacesRepository(trx)
      const transactionalLifecycle = new SQLiteConnectionLifecycleRepository(
        trx,
      )
      return action({
        workspaces: transactionalWorkspaces,
        lifecycle: transactionalLifecycle,
      })
    })
  }
}
