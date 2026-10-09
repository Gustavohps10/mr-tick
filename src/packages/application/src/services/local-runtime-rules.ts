import { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  LocalPersistenceCommand,
  LocalRuntimeCommand,
  LocalRuntimeResult,
  LocalTimeEntrySnapshot,
} from '../contracts/local-runtime'
import type { TimeEntryRecordDTO, TimerStateDTO } from '../dtos'
import {
  applyTimeEntryEdit,
  authorizeTimeEntryRecreation,
  hasUnconfirmedRemoteOperation,
  resolveTimeEntryConflict,
} from './local-time-entry-identity'
export function planLocalRuntimeCommand(
  input: LocalRuntimeCommand | LocalPersistenceCommand,
  before: LocalTimeEntrySnapshot | null,
  now: string,
  hasActiveTimer: boolean,
): Either<AppError, LocalTimeEntrySnapshot> {
  if (
    'payload' in input &&
    input.payload.pauseSeconds !== undefined &&
    input.payload.pauseSeconds > 0
  )
    return Either.failure(
      AppError.ValidationError('PAUSE_DURATION_REQUIRES_TIMER_JOURNAL'),
    )
  if (input.action === 'insertRecord') {
    if (input.record.id !== input.entryId)
      return Either.failure(AppError.ValidationError('ENTRY_ID_MISMATCH'))
    if (before !== null)
      return Either.failure(AppError.Http(409, 'ENTRY_ALREADY_EXISTS'))
    return Either.success(input.record)
  }
  if (
    input.action === 'create' ||
    input.action === 'suggest' ||
    input.action === 'timerStart'
  ) {
    if (before !== null)
      return Either.failure(AppError.Http(409, 'ENTRY_ALREADY_EXISTS'))
    if (input.action === 'timerStart') {
      if (hasActiveTimer)
        return Either.failure(AppError.Http(409, 'TIMER_ALREADY_ACTIVE'))
    }
    return createLocalRuntimeRecord(input, now)
  }
  if (before === null)
    return Either.failure(AppError.NotFound('TIME_ENTRY_NOT_FOUND'))
  switch (input.action) {
    case 'editRecord': {
      const updated = applyTimeEntryEdit(before, input.changes, now)
      if (updated === before)
        return Either.failure(
          AppError.Http(409, 'TIME_ENTRY_TRANSITION_BLOCKED'),
        )
      return Either.success(updated)
    }
    case 'authorizeRecreation':
      return Either.success(authorizeTimeEntryRecreation(before, now))
    case 'resolveConflict': {
      const resolved = resolveTimeEntryConflict(
        before,
        input.expectedServer,
        input.selection,
        now,
      )
      if (resolved === before)
        return Either.failure(AppError.Http(409, 'CONFLICT_STATE_CHANGED'))
      return Either.success(resolved)
    }
    case 'deleteRecord':
    case 'delete':
    case 'dismissSuggestion': {
      if (
        input.action === 'dismissSuggestion' &&
        before.timeStatus !== 'suggestion'
      )
        return Either.failure(AppError.ValidationError('NOT_A_SUGGESTION'))
      return Either.success({
        ...before,
        _deleted: true,
        syncStatus: 'pending_push',
        updatedAt: now,
      })
    }
    case 'acceptSuggestion': {
      if (before.timeStatus !== 'suggestion')
        return Either.failure(AppError.ValidationError('NOT_A_SUGGESTION'))
      return Either.success(
        applyTimeEntryEdit(before, { timeStatus: 'finished' }, now),
      )
    }
    case 'update': {
      if (
        input.payload.connectionInstanceId !== undefined &&
        input.payload.connectionInstanceId !== before.connectionInstanceId &&
        hasUnconfirmedRemoteOperation(before)
      )
        return Either.failure(
          AppError.Http(409, 'REMOTE_OPERATION_UNCONFIRMED'),
        )
      const changes: Partial<LocalTimeEntrySnapshot> = {}
      const payload = input.payload
      if (payload.taskId !== undefined) changes.task = { id: payload.taskId }
      if (payload.activityId !== undefined)
        changes.activity = {
          id: payload.activityId,
          name: payload.activityName,
        }
      if (
        payload.activityId === undefined &&
        payload.activityName !== undefined
      )
        changes.activity = { ...before.activity, name: payload.activityName }
      if (payload.userId !== undefined)
        changes.user = { id: payload.userId, name: payload.userName }
      if (payload.userId === undefined && payload.userName !== undefined)
        changes.user = { ...before.user, name: payload.userName }
      if (payload.connectionInstanceId !== undefined)
        changes.connectionInstanceId = payload.connectionInstanceId
      if (payload.dataSourceId !== undefined)
        changes.dataSourceId = payload.dataSourceId
      if (payload.comments !== undefined) changes.comments = payload.comments
      if (payload.timeSpentSeconds !== undefined)
        changes.timeSpent = Number((payload.timeSpentSeconds / 3600).toFixed(4))
      if (payload.startDate !== undefined) changes.startDate = payload.startDate
      if (payload.endDate !== undefined) changes.endDate = payload.endDate
      return Either.success(applyTimeEntryEdit(before, changes, now))
    }
    case 'timerPause':
    case 'timerResume':
    case 'timerStop':
      return transitionLocalRuntimeTimer(input, before, now)
  }
}

export function createLocalRuntimeRecord(
  input: Extract<
    LocalRuntimeCommand,
    { action: 'create' | 'suggest' | 'timerStart' }
  >,
  now: string,
): Either<AppError, LocalTimeEntrySnapshot> {
  const payload = input.payload
  // Empty identities represent a local, unlinked record and are never sent to a provider.
  const connectionInstanceId = payload.connectionInstanceId ?? ''
  const dataSourceId = payload.dataSourceId ?? ''
  const activityId = payload.activityId ?? ''
  const userId = payload.userId ?? ''
  if (connectionInstanceId && (!dataSourceId || !userId))
    return Either.failure(
      AppError.ValidationError('TIME_ENTRY_CONTEXT_REQUIRED'),
    )
  let startDate = payload.startDate
  let endDate = payload.endDate
  if (endDate === undefined) endDate = now
  if (startDate === undefined)
    startDate = new Date(
      Date.parse(endDate) - payload.timeSpentSeconds * 1000,
    ).toISOString()
  let status: 'finished' | 'suggestion' | 'running' = 'finished'
  if (input.action === 'suggest') status = 'suggestion'
  if (input.action === 'timerStart') status = 'running'
  let source: LocalTimeEntrySnapshot['source'] = 'manual'
  if (payload.source !== undefined) source = payload.source
  const remoteCandidate = Boolean(
    connectionInstanceId &&
    dataSourceId &&
    userId &&
    payload.taskId.trim() &&
    activityId.trim(),
  )
  let syncStatus: LocalTimeEntrySnapshot['syncStatus'] = 'local_only'
  if (status === 'finished' && remoteCandidate) syncStatus = 'pending_push'
  const record: LocalTimeEntrySnapshot = {
    id: input.entryId,
    connectionInstanceId,
    dataSourceId,
    _deleted: false,
    syncStatus,
    remoteId: null,
    lastPulledAt: null,
    lastPushedAt: null,
    task: { id: payload.taskId },
    activity: { id: activityId, name: payload.activityName },
    user: { id: userId, name: payload.userName },
    startDate,
    endDate,
    timeSpent: Number((payload.timeSpentSeconds / 3600).toFixed(4)),
    comments: payload.comments,
    createdAt: now,
    updatedAt: now,
    timeStatus: status,
    source,
    type: 'manual',
    journal: [],
  }
  if (payload.addonSource !== undefined)
    record.addonSource = {
      pluginId: payload.addonSource.id,
      name: payload.addonSource.name,
      imageUrl: payload.addonSource.imageUrl,
    }
  if (input.action === 'timerStart') {
    record.startDate = now
    record.endDate = null
    record.timeSpent = 0
    record.type =
      input.payload.mode === 'countdown' ? 'decreasing' : 'increasing'
    record.timerConfig = {
      mode: input.payload.mode,
      manualInitialSeconds: payload.timeSpentSeconds,
    }
    record.journal = [
      {
        id: input.commandId,
        action: 'start',
        timestamp: now,
        secondsAtMoment: 0,
        event: 'started',
        at: now,
        secondsAtEvent: 0,
      },
    ]
  }
  return Either.success(record)
}

export function transitionLocalRuntimeTimer(
  input: LocalRuntimeCommand,
  before: LocalTimeEntrySnapshot,
  now: string,
): Either<AppError, LocalTimeEntrySnapshot> {
  if (before.timeStatus !== 'running' && before.timeStatus !== 'paused')
    return Either.failure(AppError.Http(409, 'TIMER_NOT_ACTIVE'))
  if (input.action === 'timerPause' && before.timeStatus !== 'running')
    return Either.failure(AppError.Http(409, 'TIMER_NOT_RUNNING'))
  if (input.action === 'timerResume' && before.timeStatus !== 'paused')
    return Either.failure(AppError.Http(409, 'TIMER_NOT_PAUSED'))
  const state = timerState(before, Date.parse(now))
  const journal = before.journal === undefined ? [] : [...before.journal]
  let action: 'pause' | 'resume' | 'stop' = 'stop'
  let event: 'paused' | 'resumed' | 'stopped' = 'stopped'
  let timeStatus: 'paused' | 'running' | 'finished' = 'finished'
  if (input.action === 'timerPause') {
    action = 'pause'
    event = 'paused'
    timeStatus = 'paused'
  }
  if (input.action === 'timerResume') {
    action = 'resume'
    event = 'resumed'
    timeStatus = 'running'
  }
  journal.push({
    id: input.commandId,
    action,
    timestamp: now,
    secondsAtMoment: state.elapsedSeconds,
    event,
    at: now,
    secondsAtEvent: state.elapsedSeconds,
  })
  const changes: Partial<LocalTimeEntrySnapshot> = {
    timeStatus,
    journal,
    updatedAt: now,
    timeSpent: Number(
      (
        (state.elapsedSeconds +
          (state.mode === 'countup' ? state.baseSeconds : 0)) /
        3600
      ).toFixed(4),
    ),
  }
  if (input.action === 'timerStop') changes.endDate = now
  if (input.action === 'timerResume')
    changes.startDate = new Date(
      Date.parse(now) - state.elapsedSeconds * 1000,
    ).toISOString()
  const updated = { ...before, ...changes }
  if (input.action === 'timerStop')
    return Either.success(applyTimeEntryEdit(before, changes, now))
  return Either.success(updated)
}

export function toPublicRecord(
  record: LocalTimeEntrySnapshot,
  now: number = Date.now(),
): TimeEntryRecordDTO {
  const item: TimeEntryRecordDTO = {
    id: record.id,
    taskId: record.task.id,
    activityId: record.activity.id,
    connectionInstanceId: record.connectionInstanceId,
    dataSourceId: record.dataSourceId,
    startDate: record.startDate,
    timeSpentSeconds: Math.round(record.timeSpent * 3600),
    pauseSeconds: timeEntryPauseSeconds(record, now),
    status: record.timeStatus,
    source: record.source,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
  if (record.comments !== null && record.comments !== undefined)
    item.comments = record.comments
  if (record.endDate !== null && record.endDate !== undefined)
    item.endDate = record.endDate
  if (record.addonSource !== undefined && record.addonSource.name !== undefined)
    item.addonSource = {
      id: record.addonSource.pluginId,
      name: record.addonSource.name,
      imageUrl: record.addonSource.imageUrl,
    }
  return item
}

export function timerState(
  record: LocalTimeEntrySnapshot,
  now: number = Date.now(),
): TimerStateDTO {
  let mode: 'countup' | 'countdown' = 'countup'
  let baseSeconds = 0
  if (record.timerConfig !== undefined) {
    mode = record.timerConfig.mode
    if (record.timerConfig.manualInitialSeconds !== undefined)
      baseSeconds = record.timerConfig.manualInitialSeconds
  }
  let elapsedSeconds = Math.max(
    0,
    Math.round(record.timeSpent * 3600) -
      (mode === 'countup' ? baseSeconds : 0),
  )
  if (record.timeStatus === 'running')
    elapsedSeconds = Math.max(
      0,
      Math.floor((now - Date.parse(record.startDate)) / 1000),
    )
  if (record.timeStatus === 'paused' && record.journal !== undefined) {
    const paused = [...record.journal]
      .reverse()
      .find((event) => event.action === 'pause')
    if (paused !== undefined) elapsedSeconds = paused.secondsAtMoment
  }
  let status: 'running' | 'paused' | 'idle' = 'idle'
  if (record.timeStatus === 'running') status = 'running'
  if (record.timeStatus === 'paused') status = 'paused'
  return {
    status,
    currentSeconds:
      mode === 'countdown'
        ? baseSeconds - elapsedSeconds
        : baseSeconds + elapsedSeconds,
    baseSeconds,
    elapsedSeconds,
    mode,
    taskId: record.task.id,
    activityId: record.activity.id,
    comments: record.comments === null ? undefined : record.comments,
  }
}

export function resultFor(record: LocalTimeEntrySnapshot): LocalRuntimeResult {
  if (record._deleted) return { ...emptyResult(), deleted: true }
  let timer: TimerStateDTO | null = null
  if (record.timeStatus === 'running' || record.timeStatus === 'paused')
    timer = timerState(record)
  return { entry: toPublicRecord(record), entries: [], timer, deleted: false }
}
export function emptyResult(): LocalRuntimeResult {
  return { entry: null, entries: [], timer: null, deleted: false }
}

export function timeEntryPauseSeconds(
  record: LocalTimeEntrySnapshot,
  now: number,
): number {
  if (record.journal === undefined) return 0
  let pausedAt: number | null = null
  let duration = 0
  for (const event of record.journal) {
    if (event.action === 'pause') {
      pausedAt = Date.parse(event.timestamp)
      continue
    }
    if (event.action !== 'resume' && event.action !== 'stop') continue
    if (pausedAt === null) continue
    duration += Math.max(0, Date.parse(event.timestamp) - pausedAt)
    pausedAt = null
  }
  if (pausedAt !== null) duration += Math.max(0, now - pausedAt)
  return Math.floor(duration / 1000)
}
