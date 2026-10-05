import { IHostBridge } from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { RxCollection } from 'rxdb'

import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'

import {
  hasBusinessChanges,
  snapshotDocument,
} from './replication-strategies/timeEntrySyncState'

export interface TimeEntriesReconciliationWindow {
  workspaceId: string
  connectionInstanceId: string
  startDate: Date
  endDate: Date
}

/** Absence is meaningful only in a successful, complete snapshot of the same window. */
export async function reconcileTimeEntries(
  collection: RxCollection<SyncTimeEntryRxDBDTO>,
  client: Pick<IHostBridge, 'timeEntries'>,
  window: TimeEntriesReconciliationWindow,
): Promise<Either<AppError, void>> {
  const documents = await collection
    .find({ selector: { connectionInstanceId: window.connectionInstanceId } })
    .exec()
  const inWindow = (entry: SyncTimeEntryRxDBDTO): boolean => {
    const time = new Date(entry.startDate).getTime()
    return (
      Number.isFinite(time) &&
      time >= window.startDate.getTime() &&
      time <= window.endDate.getTime()
    )
  }
  const candidates = documents.filter(
    (document) =>
      document.syncStatus === 'synced' &&
      !document._deleted &&
      Boolean(document.remoteId?.trim()) &&
      inWindow(document.toMutableJSON()),
  )
  if (candidates.length === 0) return Either.success(undefined)

  const snapshots = candidates.map((document) => ({
    document,
    snapshot: document.toMutableJSON(),
  }))
  const response = await client.timeEntries.listTimeEntries({ body: window })
  if (!response.isSuccess)
    return Either.failure(
      AppError.Http(
        response.statusCode,
        response.error ? response.error : 'SYNC_RECONCILE_FAILED',
      ),
    )

  const items = response.data
  if (
    !Array.isArray(items) ||
    !Number.isInteger(response.totalItems) ||
    response.totalItems !== items.length ||
    response.currentPage !== 1 ||
    response.totalPages !== (items.length === 0 ? 0 : 1) ||
    items.some((entry) => !entry.id?.trim())
  )
    return Either.failure(
      AppError.Internal('SYNC_RECONCILE_INCOMPLETE_SNAPSHOT'),
    )

  const remoteIds = new Set(items.map((entry) => entry.id))
  if (remoteIds.size !== items.length)
    return Either.failure(AppError.Internal('SYNC_RECONCILE_INVALID_SNAPSHOT'))

  for (const { document, snapshot } of snapshots) {
    const remoteId = snapshot.remoteId
    if (!remoteId || remoteIds.has(remoteId)) continue
    await document.incrementalModify((current) => {
      // A user edit or another replication response may have arrived during the lookup.
      if (
        current.syncStatus !== 'synced' ||
        current._deleted ||
        current.remoteId !== remoteId ||
        current.updatedAt !== snapshot.updatedAt ||
        current.remoteUpdatedAt !== snapshot.remoteUpdatedAt ||
        hasBusinessChanges(
          snapshotDocument(current),
          snapshotDocument(snapshot),
        ) ||
        !inWindow(current)
      )
        return current
      // Cache cleanup acknowledges a remote deletion; it never requests a remote write.
      return { ...current, _deleted: true, remoteDeleted: true }
    })
  }
  return Either.success(undefined)
}
