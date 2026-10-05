import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'

export function hasUnconfirmedRemoteOperation(
  document: SyncTimeEntryRxDBDTO,
): boolean {
  return (
    document.syncStatus === 'creating' ||
    document.syncStatus === 'ambiguous' ||
    Boolean(document.confirmationState)
  )
}

export function resetTimeEntryRemoteIdentity(
  document: SyncTimeEntryRxDBDTO,
): SyncTimeEntryRxDBDTO {
  return {
    ...document,
    remoteId: null,
    remoteState: null,
    remoteUpdatedAt: null,
    remoteDeleted: false,
    deletionConfirmed: false,
    creationAttemptId: null,
    creationState: null,
    confirmationState: null,
    syncError: null,
    syncFailure: null,
    conflictData: undefined,
    lastPulledAt: null,
    lastPushedAt: null,
  }
}

/** Applied inside incrementalModify so the current identity, not an old UI snapshot, decides the transition. */
export function applyTimeEntryEdit(
  document: SyncTimeEntryRxDBDTO,
  changes: Partial<SyncTimeEntryRxDBDTO>,
  updatedAt: string,
): SyncTimeEntryRxDBDTO {
  if (document._deleted) return document
  const connectionChanged = Boolean(
    changes.connectionInstanceId &&
    changes.connectionInstanceId !== document.connectionInstanceId,
  )
  if (connectionChanged && hasUnconfirmedRemoteOperation(document))
    return document
  const updated = {
    ...(connectionChanged ? resetTimeEntryRemoteIdentity(document) : document),
    ...changes,
  }
  const isRemoteCandidate = Boolean(
    (updated.remoteId || updated.task.id.trim()) &&
    updated.activity.id.trim() &&
    updated.connectionInstanceId &&
    updated.connectionInstanceId !== '0',
  )
  const syncStatus =
    !connectionChanged &&
    (document.syncStatus === 'conflict' ||
      document.syncStatus === 'creating' ||
      document.syncStatus === 'ambiguous')
      ? document.syncStatus
      : isRemoteCandidate
        ? 'pending_push'
        : 'local_only'
  return {
    ...updated,
    syncStatus,
    syncError: syncStatus === 'ambiguous' ? document.syncError : null,
    syncFailure: syncStatus === 'ambiguous' ? document.syncFailure : null,
    updatedAt,
  }
}

export function authorizeTimeEntryRecreation(
  document: SyncTimeEntryRxDBDTO,
  updatedAt: string,
): SyncTimeEntryRxDBDTO {
  if (document.syncStatus !== 'ambiguous' || document._deleted) return document
  return {
    ...resetTimeEntryRemoteIdentity(document),
    syncStatus: 'pending_push',
    updatedAt,
  }
}
