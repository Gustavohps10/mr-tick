import type {
  LocalConflictSelection,
  LocalTimeEntrySnapshot,
  TimeEntryRemoteState,
} from '../contracts/local-runtime'

export function hasUnconfirmedRemoteOperation(
  document: LocalTimeEntrySnapshot,
): boolean {
  return (
    document.syncStatus === 'creating' ||
    document.syncStatus === 'ambiguous' ||
    Boolean(document.confirmationState)
  )
}

export function resetTimeEntryRemoteIdentity(
  document: LocalTimeEntrySnapshot,
): LocalTimeEntrySnapshot {
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

export function applyTimeEntryEdit(
  document: LocalTimeEntrySnapshot,
  changes: Partial<LocalTimeEntrySnapshot>,
  updatedAt: string,
): LocalTimeEntrySnapshot {
  if (document._deleted) return document
  const connectionChanged =
    changes.connectionInstanceId !== undefined &&
    changes.connectionInstanceId !== document.connectionInstanceId
  const unconfirmed = hasUnconfirmedRemoteOperation(document)
  console.log('[DEBUG applyTimeEntryEdit]', {
    id: document.id,
    connectionChanged,
    unconfirmed,
    docConn: document.connectionInstanceId,
    changeConn: changes.connectionInstanceId,
    confirmationState: Boolean(document.confirmationState),
    syncStatus: document.syncStatus,
  })
  if (connectionChanged && unconfirmed) return document
  let baseline = document
  if (connectionChanged) baseline = resetTimeEntryRemoteIdentity(document)
  const updated = { ...baseline, ...changes }
  const hasRemoteId =
    updated.remoteId !== undefined &&
    updated.remoteId !== null &&
    updated.remoteId.length > 0
  const hasTask = updated.task.id.trim().length > 0
  const isRemoteCandidate =
    (hasRemoteId || hasTask) &&
    updated.activity.id.trim().length > 0 &&
    updated.connectionInstanceId.length > 0 &&
    updated.connectionInstanceId !== '0'
  let syncStatus: LocalTimeEntrySnapshot['syncStatus'] = 'local_only'
  if (isRemoteCandidate) syncStatus = 'pending_push'
  if (
    !connectionChanged &&
    (document.syncStatus === 'conflict' ||
      document.syncStatus === 'creating' ||
      document.syncStatus === 'ambiguous')
  )
    syncStatus = document.syncStatus
  let syncError: LocalTimeEntrySnapshot['syncError'] = null
  let syncFailure: LocalTimeEntrySnapshot['syncFailure'] = null
  if (syncStatus === 'ambiguous') {
    syncError = document.syncError
    syncFailure = document.syncFailure
  }
  return { ...updated, syncStatus, syncError, syncFailure, updatedAt }
}

export function authorizeTimeEntryRecreation(
  document: LocalTimeEntrySnapshot,
  updatedAt: string,
): LocalTimeEntrySnapshot {
  if (document.syncStatus !== 'ambiguous' || document._deleted) return document
  return {
    ...resetTimeEntryRemoteIdentity(document),
    syncStatus: 'pending_push',
    updatedAt,
  }
}

export type ConflictResolutionSide = 'local' | 'remote'
export type ConflictFieldSelection = LocalConflictSelection

export function resolveTimeEntryConflict(
  draft: LocalTimeEntrySnapshot,
  expectedServer: TimeEntryRemoteState,
  selection: LocalConflictSelection,
  now: string = new Date().toISOString(),
): LocalTimeEntrySnapshot {
  const server = draft.conflictData?.server
  if (
    draft._deleted ||
    draft.syncStatus !== 'conflict' ||
    server === undefined ||
    server.id !== expectedServer.id ||
    server.updatedAt !== expectedServer.updatedAt ||
    hasTimeEntryBusinessChanges(server, expectedServer)
  )
    return draft
  const pending = Object.values(selection).some((side) => side === 'local')
  let task = server.task
  if (selection.task === 'local') task = draft.task
  let taskData = draft.taskData
  if (taskData?.sourceId !== task.id) taskData = undefined
  let activity = server.activity
  if (selection.activity === 'local') activity = draft.activity
  let timeSpent = server.timeSpent
  let startDate = draft.startDate
  let endDate = server.endDate
  if (endDate === undefined) endDate = null
  if (server.startDate !== undefined) startDate = server.startDate
  if (selection.periodAndDuration === 'local') {
    timeSpent = draft.timeSpent
    startDate = draft.startDate
    endDate = draft.endDate
  }
  let comments = server.comments
  if (selection.comments === 'local') comments = draft.comments
  let updatedAt = server.updatedAt
  let syncStatus: LocalTimeEntrySnapshot['syncStatus'] = 'synced'
  if (pending) {
    updatedAt = now
    syncStatus = 'pending_push'
  }
  return {
    ...draft,
    remoteId: server.id,
    remoteState: server,
    remoteUpdatedAt: server.updatedAt,
    task,
    taskData,
    activity,
    user: server.user,
    timeSpent,
    startDate,
    endDate,
    comments,
    createdAt: server.createdAt,
    updatedAt,
    syncStatus,
    conflictData: undefined,
    syncError: null,
    syncFailure: null,
    creationState: null,
    confirmationState: null,
    creationAttemptId: null,
  }
}

export function hasTimeEntryBusinessChanges(
  first: TimeEntryRemoteState,
  second: TimeEntryRemoteState,
): boolean {
  return (
    pureTaskId(first.task.id) !== pureTaskId(second.task.id) ||
    first.activity.id !== second.activity.id ||
    first.user.id !== second.user.id ||
    first.startDate !== second.startDate ||
    first.endDate !== second.endDate ||
    first.timeSpent !== second.timeSpent ||
    normalizedComments(first.comments) !== normalizedComments(second.comments)
  )
}

function normalizedComments(value: string | null | undefined): string {
  if (value === undefined || value === null) return ''
  return value.trim()
}

function pureTaskId(value: string): string {
  let result = value.trim()
  if (result.includes('::')) {
    const parts = result.split('::')
    const sourceId = parts.at(1)
    if (sourceId !== undefined && sourceId.length > 0) result = sourceId
  }
  if (result.startsWith('#')) result = result.slice(1).trim()
  return result
}
