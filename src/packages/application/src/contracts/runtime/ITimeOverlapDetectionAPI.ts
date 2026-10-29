import type { AppError, Either } from '@mr-tick/shared/helpers'

export interface TimeInterval {
  readonly start: string
  readonly end: string
}

export interface DetectTimeOverlapInput {
  readonly workspaceId: string
  readonly interval: TimeInterval
  readonly excludeEntryId?: string
}

export interface ConflictingTimeEntry {
  readonly id: string
  readonly title?: string
  readonly timeStatus: 'running' | 'paused' | 'finished'
  readonly startDate: string
  readonly endDate?: string
  readonly runningSince?: string
  readonly effectiveIntervals: readonly TimeInterval[]
}

export interface TimeOverlapDetectionResult {
  readonly hasOverlap: boolean
  readonly conflicts: readonly ConflictingTimeEntry[]
  readonly conflictToken?: string
}

export interface ITimeOverlapDetectionAPI {
  detectOverlaps(
    input: DetectTimeOverlapInput,
  ): Promise<Either<AppError, TimeOverlapDetectionResult>>
}
