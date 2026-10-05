import { SyncTimeEntryDTO, TimeEntryDTO } from '@mr-tick/application'

import {
  SyncTimeEntryRxDBDTO,
  TimeEntryRemoteState,
} from '@/local-db/schemas/time-entries-sync-schema'
import { cleanTaskId } from '@/pages/time-entries/lib/time-entries-utils'

export function dateToISO(
  value: Date | string | null | undefined,
): string | undefined {
  if (!value) return undefined
  return new Date(value).toISOString()
}

export function toRemoteState(
  entry: TimeEntryDTO,
  id: string,
): TimeEntryRemoteState {
  return {
    id,
    task: { id: cleanTaskId(entry.task.id) },
    activity: entry.activity,
    user: entry.user,
    startDate: dateToISO(entry.startDate),
    endDate: dateToISO(entry.endDate),
    timeSpent: entry.timeSpent,
    comments: entry.comments,
    createdAt: new Date(entry.createdAt).toISOString(),
    updatedAt: new Date(entry.updatedAt).toISOString(),
  }
}

export function snapshotDocument(
  doc: SyncTimeEntryRxDBDTO,
): TimeEntryRemoteState {
  return {
    id: doc.id,
    task: { id: cleanTaskId(doc.task.id) },
    activity: doc.activity,
    user: doc.user,
    startDate: doc.startDate,
    endDate: doc.endDate,
    timeSpent: doc.timeSpent,
    comments: doc.comments,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function toTimeEntryDTO(state: TimeEntryRemoteState): TimeEntryDTO {
  return {
    id: state.id,
    task: { id: cleanTaskId(state.task.id) },
    activity: state.activity,
    user: state.user,
    startDate: state.startDate ? new Date(state.startDate) : undefined,
    endDate: state.endDate ? new Date(state.endDate) : undefined,
    timeSpent: state.timeSpent,
    comments: state.comments ? state.comments : undefined,
    createdAt: new Date(state.createdAt),
    updatedAt: new Date(state.updatedAt),
  }
}

export function toPushEntry(
  doc: SyncTimeEntryRxDBDTO,
  creationAttempted: boolean,
): SyncTimeEntryDTO {
  const entry: SyncTimeEntryDTO = {
    ...toTimeEntryDTO(snapshotDocument(doc)),
    id: doc.remoteId ? doc.remoteId : doc.id,
    remoteId: doc.remoteId,
    correlationId: doc.id,
    creationAttempted,
    confirmationPending: Boolean(doc.confirmationState),
    creationAttemptId: doc.creationAttemptId,
    _deleted: doc._deleted,
  }
  if (doc.creationState)
    entry.creationState = {
      ...toTimeEntryDTO(doc.creationState),
      correlationId: doc.id,
    }
  if (doc.remoteState)
    entry.assumedMasterState = toTimeEntryDTO(doc.remoteState)
  const conflict = doc.conflictData?.server
  if (conflict) entry.assumedMasterState = toTimeEntryDTO(conflict)
  return entry
}

export function hasBusinessChanges(
  first: TimeEntryRemoteState,
  second: TimeEntryRemoteState,
): boolean {
  return (
    cleanTaskId(first.task.id) !== cleanTaskId(second.task.id) ||
    first.activity.id !== second.activity.id ||
    first.user.id !== second.user.id ||
    first.startDate !== second.startDate ||
    first.endDate !== second.endDate ||
    first.timeSpent !== second.timeSpent ||
    normalizedComments(first.comments) !== normalizedComments(second.comments)
  )
}

function normalizedComments(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim()
}
