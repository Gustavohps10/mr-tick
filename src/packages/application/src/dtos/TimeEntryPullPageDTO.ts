import { TimeEntryDTO } from './TimeEntryDTO'

export interface TimeEntryPullCheckpointDTO {
  updatedAt: Date
  id: string
  /** Provider-owned cursor. Consumers must persist and return it unchanged. */
  cursor?: string
}

export interface TimeEntryPullPageDTO {
  items: TimeEntryDTO[]
  checkpoint: TimeEntryPullCheckpointDTO
  hasMore: boolean
  /** Identifies the coherent source view used by this page and its continuation. */
  snapshotId: string
}
