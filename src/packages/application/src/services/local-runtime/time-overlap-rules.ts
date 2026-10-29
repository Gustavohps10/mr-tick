import { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  LocalTimeEntrySnapshot,
  TimerJournalEntry,
} from '@/contracts/local-runtime'
import type {
  ConflictingTimeEntry,
  DetectTimeOverlapInput,
  TimeInterval,
  TimeOverlapDetectionResult,
} from '@/contracts/runtime/ITimeOverlapDetectionAPI'

type Clock = () => string

type EffectiveInterval = {
  start: string
  end: string
}

export async function detectTimeOverlap(
  input: DetectTimeOverlapInput,
  candidates: readonly LocalTimeEntrySnapshot[],
  clock: Clock,
): Promise<Either<AppError, TimeOverlapDetectionResult>> {
  const target = parseInterval(input.interval)
  if (target.isFailure()) return Either.failure(target.failure)
  if (target.success === null)
    return Either.success({ hasOverlap: false, conflicts: [] })
  const targetInterval = target.success

  const conflicts: ConflictingTimeEntry[] = []
  for (const candidate of candidates) {
    if (candidate._deleted) continue
    if (
      input.excludeEntryId !== undefined &&
      candidate.id === input.excludeEntryId
    )
      continue
    const intervals = effectiveIntervals(candidate, clock)
    if (intervals.isFailure()) return Either.failure(intervals.failure)
    const overlapping = intervals.success.filter((interval) =>
      overlaps(targetInterval, interval),
    )
    if (overlapping.length === 0) continue
    conflicts.push(toConflict(candidate, overlapping))
  }

  if (conflicts.length === 0)
    return Either.success({ hasOverlap: false, conflicts: [] })
  const conflictToken = await createConflictToken(input, candidates)
  if (conflictToken.isFailure()) return Either.failure(conflictToken.failure)
  return Either.success({
    hasOverlap: true,
    conflicts,
    conflictToken: conflictToken.success,
  })
}

function parseInterval(
  interval: TimeInterval,
): Either<AppError, EffectiveInterval | null> {
  const start = Date.parse(interval.start)
  const end = Date.parse(interval.end)
  if (Number.isNaN(start) || Number.isNaN(end) || start > end)
    return Either.failure(AppError.ValidationError('INVALID_TIME_INTERVAL'))
  if (start === end) return Either.success(null)
  return Either.success({ start: interval.start, end: interval.end })
}

function effectiveIntervals(
  candidate: LocalTimeEntrySnapshot,
  clock: Clock,
): Either<AppError, readonly EffectiveInterval[]> {
  const journal = candidate.journal
  if (journal === undefined || journal.length === 0) {
    if (
      candidate.timeStatus !== 'running' &&
      (candidate.endDate === undefined || candidate.endDate === null)
    )
      return Either.failure(
        AppError.ValidationError('CLOSED_TIME_ENTRY_END_REQUIRED'),
      )
    const end = candidate.endDate
    if (end === undefined || end === null) {
      const interval = parseInterval({
        start: candidate.startDate,
        end: clock(),
      })
      if (interval.isFailure()) return Either.failure(interval.failure)
      if (interval.success === null) return Either.success([])
      return Either.success([interval.success])
    }
    const interval = parseInterval({ start: candidate.startDate, end })
    if (interval.isFailure()) return Either.failure(interval.failure)
    if (interval.success === null) return Either.success([])
    return Either.success([interval.success])
  }

  const ordered = [...journal].sort(compareJournalEntries)
  const intervals: EffectiveInterval[] = []
  let activeStart: string | undefined
  for (const event of ordered) {
    if (!isValidInstant(event.at))
      return Either.failure(AppError.ValidationError('INVALID_TIMER_JOURNAL'))
    if (event.event === 'started' || event.event === 'resumed') {
      if (activeStart !== undefined)
        return Either.failure(
          AppError.ValidationError('INCONSISTENT_TIMER_JOURNAL'),
        )
      activeStart = event.at
      continue
    }
    if (event.event !== 'paused' && event.event !== 'stopped') continue
    if (activeStart === undefined)
      return Either.failure(
        AppError.ValidationError('INCONSISTENT_TIMER_JOURNAL'),
      )
    const interval = parseInterval({ start: activeStart, end: event.at })
    if (interval.isFailure()) return Either.failure(interval.failure)
    if (interval.success !== null) intervals.push(interval.success)
    activeStart = undefined
  }
  if (activeStart !== undefined) {
    if (candidate.timeStatus !== 'running')
      return Either.failure(
        AppError.ValidationError('CLOSED_TIME_ENTRY_END_REQUIRED'),
      )
    const interval = parseInterval({ start: activeStart, end: clock() })
    if (interval.isFailure()) return Either.failure(interval.failure)
    if (interval.success !== null) intervals.push(interval.success)
  }
  return Either.success(intervals)
}

function compareJournalEntries(
  left: TimerJournalEntry,
  right: TimerJournalEntry,
): number {
  return Date.parse(left.at) - Date.parse(right.at)
}

function isValidInstant(value: string): boolean {
  return !Number.isNaN(Date.parse(value))
}

function overlaps(
  target: EffectiveInterval,
  candidate: EffectiveInterval,
): boolean {
  return (
    Date.parse(target.start) < Date.parse(candidate.end) &&
    Date.parse(candidate.start) < Date.parse(target.end)
  )
}

function toConflict(
  candidate: LocalTimeEntrySnapshot,
  intervals: readonly EffectiveInterval[],
): ConflictingTimeEntry {
  let timeStatus: ConflictingTimeEntry['timeStatus'] = 'finished'
  if (candidate.timeStatus === 'running') timeStatus = 'running'
  if (candidate.timeStatus === 'paused') timeStatus = 'paused'
  let endDate: string | undefined
  if (candidate.endDate !== null) endDate = candidate.endDate
  let runningSince: string | undefined
  if (candidate.timeStatus === 'running') runningSince = candidate.startDate
  return {
    id: candidate.id,
    title: candidate.taskData?.title,
    timeStatus,
    startDate: candidate.startDate,
    endDate,
    runningSince,
    effectiveIntervals: intervals,
  }
}

async function createConflictToken(
  input: DetectTimeOverlapInput,
  candidates: readonly LocalTimeEntrySnapshot[],
): Promise<Either<AppError, string>> {
  const canonical = {
    workspaceId: input.workspaceId,
    excludeEntryId: input.excludeEntryId,
    interval: input.interval,
    candidates: [...candidates]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(canonicalCandidate),
  }
  const bytes = new TextEncoder().encode(JSON.stringify(canonical))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return Either.success(hash)
}

function canonicalCandidate(candidate: LocalTimeEntrySnapshot) {
  return {
    id: candidate.id,
    connectionInstanceId: candidate.connectionInstanceId,
    dataSourceId: candidate.dataSourceId,
    deleted: candidate._deleted,
    syncStatus: candidate.syncStatus,
    taskId: candidate.task.id,
    activityId: candidate.activity.id,
    userId: candidate.user.id,
    startDate: candidate.startDate,
    endDate: candidate.endDate,
    timeSpent: candidate.timeSpent,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    timeStatus: candidate.timeStatus,
    source: candidate.source,
    journal: candidate.journal
      ?.slice()
      .sort(compareJournalEntries)
      .map((event) => ({
        id: event.id,
        action: event.action,
        timestamp: event.timestamp,
        secondsAtMoment: event.secondsAtMoment,
        note: event.note,
        event: event.event,
        at: event.at,
        secondsAtEvent: event.secondsAtEvent,
      })),
  }
}
