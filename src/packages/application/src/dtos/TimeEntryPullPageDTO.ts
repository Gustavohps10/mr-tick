import { TimeEntryDTO } from './TimeEntryDTO'

export interface TimeEntryPullCheckpointDTO {
  updatedAt: Date
  id: string
  /** Provider-owned cursor. Consumers must persist and return it unchanged. */
  cursor?: string
}

export interface TimeEntryPullPageDTO {
  /** Omitted means snapshot. Change feeds do not promise immutable records between pages. */
  kind?: 'snapshot' | 'changes'
  items: TimeEntryDTO[]
  checkpoint: TimeEntryPullCheckpointDTO
  hasMore: boolean
  /** Snapshot identity, or the bounded source selection identity for a change-feed page. */
  snapshotId: string
}
