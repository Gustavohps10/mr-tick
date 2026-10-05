import {
  SyncTimeEntryRxDBDTO,
  TimeEntryRemoteState,
} from '@/local-db/schemas/time-entries-sync-schema'
import { reconcileTimeWindow } from '@/stores/sync-store/replication-strategies/reconcileTimeWindow'
import { hasBusinessChanges } from '@/stores/sync-store/replication-strategies/timeEntrySyncState'

export type ConflictResolutionSide = 'local' | 'remote'

export interface ConflictFieldSelection {
  periodAndDuration: ConflictResolutionSide
  comments: ConflictResolutionSide
  task: ConflictResolutionSide
  activity: ConflictResolutionSide
}

export function resolveTimeEntryConflict(
  draft: SyncTimeEntryRxDBDTO,
  expectedServer: TimeEntryRemoteState,
  selection: ConflictFieldSelection,
): SyncTimeEntryRxDBDTO {
  const server = draft.conflictData?.server
  if (
    draft._deleted ||
    draft.syncStatus !== 'conflict' ||
    !server ||
    server.id !== expectedServer.id ||
    server.updatedAt !== expectedServer.updatedAt ||
    hasBusinessChanges(server, expectedServer)
  )
    return draft

  const pending = Object.values(selection).some((side) => side === 'local')
  const window = reconcileTimeWindow(server)
  const task = selection.task === 'local' ? draft.task : server.task
  return {
    ...draft,
    remoteId: server.id,
    remoteState: server,
    remoteUpdatedAt: server.updatedAt,
    task,
    taskData: draft.taskData?.sourceId === task.id ? draft.taskData : undefined,
    activity: selection.activity === 'local' ? draft.activity : server.activity,
    user: server.user,
    timeSpent:
      selection.periodAndDuration === 'local'
        ? draft.timeSpent
        : server.timeSpent,
    startDate:
      selection.periodAndDuration === 'local'
        ? draft.startDate
        : window.startDate
          ? window.startDate
          : draft.startDate,
    endDate:
      selection.periodAndDuration === 'local' ? draft.endDate : window.endDate,
    comments: selection.comments === 'local' ? draft.comments : server.comments,
    createdAt: server.createdAt,
    updatedAt: pending ? new Date().toISOString() : server.updatedAt,
    syncStatus: pending ? 'pending_push' : 'synced',
    conflictData: undefined,
    syncError: null,
    syncFailure: null,
    creationState: null,
    confirmationState: null,
    creationAttemptId: null,
  }
}
