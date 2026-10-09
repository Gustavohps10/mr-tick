import type { IHostBridge, LocalPersistenceCommand } from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

import type { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import type { AppDatabase } from '@/stores/sync-store/types'

type UnscopedCommand<T> = T extends LocalPersistenceCommand
  ? Omit<T, 'workspaceId' | 'commandId'>
  : never

export type EntryPersistenceInput = UnscopedCommand<LocalPersistenceCommand>
const databaseScopes = new WeakMap<AppDatabase, string>()

export function registerDatabaseScope(
  database: AppDatabase,
  workspaceId: string,
): void {
  databaseScopes.set(database, workspaceId)
}

export function getDatabaseScope(
  database: AppDatabase,
): Either<AppError, string> {
  const workspaceId = databaseScopes.get(database)
  if (!workspaceId)
    return Either.failure(
      AppError.Http(503, 'LOCAL_DATABASE_SCOPE_UNAVAILABLE'),
    )
  return Either.success(workspaceId)
}

/** The UI keeps query readers; all time-entry mutations are committed by the owner. */
export async function requestEntryPersistence(
  bridge: IHostBridge,
  database: AppDatabase,
  input: EntryPersistenceInput,
  commandId: string = crypto.randomUUID(),
): Promise<Either<AppError, SyncTimeEntryRxDBDTO | null>> {
  const scope = getDatabaseScope(database)
  if (scope.isFailure()) return scope.forwardFailure()
  console.log(
    '[PERSISTENCE-CLIENT request]',
    JSON.stringify({
      workspaceId: scope.success,
      commandId,
      action: input.action,
      entryId: (input as any).entryId,
      changes: (input as any).changes,
    }),
  )
  const response = await bridge.localPersistence.request({
    ...input,
    workspaceId: scope.success,
    commandId,
  })
  console.log(
    '[PERSISTENCE-CLIENT response]',
    JSON.stringify({
      commandId,
      ok: response.ok,
      error: !response.ok ? response.error : null,
      record: response.ok
        ? {
            id: response.record?.id,
            syncStatus: response.record?.syncStatus,
            conn: response.record?.connectionInstanceId,
          }
        : null,
    }),
  )
  if (!response.ok)
    return Either.failure(
      AppError.Http(response.error.statusCode, response.error.messageKey),
    )
  return Either.success(response.record)
}
