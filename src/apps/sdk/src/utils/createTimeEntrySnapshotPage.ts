import {
  TimeEntryDTO,
  TimeEntryPullCheckpointDTO,
  TimeEntryPullPageDTO,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

/** Stateless snapshot pagination; a changed source view starts a new finite scan. */
export async function createTimeEntrySnapshotPage(
  entries: TimeEntryDTO[],
  checkpoint: TimeEntryPullCheckpointDTO,
  batch: number,
  scope: string,
): Promise<Either<AppError, TimeEntryPullPageDTO>> {
  if (!Number.isInteger(batch) || batch <= 0)
    return Either.failure(AppError.ValidationError('TIME_ENTRY_BATCH_INVALID'))
  if (!Number.isFinite(checkpoint.updatedAt.getTime()))
    return Either.failure(
      AppError.ValidationError('TIME_ENTRY_CHECKPOINT_INVALID'),
    )
  const ids = new Set<string>()
  for (const entry of entries) {
    if (
      !entry.id ||
      ids.has(entry.id) ||
      !Number.isFinite(entry.updatedAt.getTime()) ||
      !Number.isFinite(entry.createdAt.getTime()) ||
      (entry.startDate && !Number.isFinite(entry.startDate.getTime())) ||
      (entry.endDate && !Number.isFinite(entry.endDate.getTime()))
    )
      return Either.failure(AppError.Http(503, 'TIME_ENTRY_SNAPSHOT_INVALID'))
    ids.add(entry.id)
  }
  const sorted = [...entries].sort((first, second) => {
    const byTime = first.updatedAt.getTime() - second.updatedAt.getTime()
    if (byTime !== 0) return byTime
    const firstId = first.id
    const secondId = second.id
    if (!firstId || !secondId) return 0
    const firstIsNumeric = /^\d+$/.test(firstId)
    const secondIsNumeric = /^\d+$/.test(secondId)
    if (firstIsNumeric && !secondIsNumeric) return -1
    if (!firstIsNumeric && secondIsNumeric) return 1
    if (firstIsNumeric && secondIsNumeric) {
      const firstNumber = BigInt(firstId)
      const secondNumber = BigInt(secondId)
      if (firstNumber < secondNumber) return -1
      if (firstNumber > secondNumber) return 1
    }
    if (firstId < secondId) return -1
    if (firstId > secondId) return 1
    return 0
  })
  const canonical = sorted.map((entry) => ({
    id: entry.id,
    correlationId: entry.correlationId,
    task: { id: entry.task.id },
    activity: { id: entry.activity.id, name: entry.activity.name },
    user: { id: entry.user.id, name: entry.user.name },
    startDate: entry.startDate?.toISOString(),
    endDate: entry.endDate?.toISOString(),
    timeSpent: entry.timeSpent,
    comments: entry.comments,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    source: entry.source,
  }))
  const bytes = new TextEncoder().encode(JSON.stringify([scope, canonical]))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const snapshotId = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  let offset = 0
  if (checkpoint.cursor !== undefined) {
    const cursor = /^te-snapshot-v1:([a-f0-9]{64}):(\d+):(\d+)$/.exec(
      checkpoint.cursor,
    )
    if (
      !cursor ||
      !Number.isSafeInteger(Number(cursor[2])) ||
      !Number.isSafeInteger(Number(cursor[3])) ||
      Number(cursor[2]) > Number(cursor[3])
    )
      return Either.failure(
        AppError.ValidationError('TIME_ENTRY_CURSOR_INVALID'),
      )
    if (cursor[1] === snapshotId) {
      if (Number(cursor[3]) !== sorted.length)
        return Either.failure(
          AppError.ValidationError('TIME_ENTRY_CURSOR_INVALID'),
        )
      offset = Number(cursor[2])
    }
  }
  const items = sorted.slice(offset, offset + batch)
  const nextOffset = offset + items.length
  const last = items.at(-1)
  if (last && !last.id)
    return Either.failure(AppError.Http(503, 'TIME_ENTRY_SNAPSHOT_INVALID'))
  return Either.success({
    items,
    snapshotId,
    hasMore: nextOffset < sorted.length,
    checkpoint: {
      id: last?.id ? last.id : checkpoint.id,
      updatedAt: last ? last.updatedAt : checkpoint.updatedAt,
      cursor: `te-snapshot-v1:${snapshotId}:${nextOffset}:${sorted.length}`,
    },
  })
}
