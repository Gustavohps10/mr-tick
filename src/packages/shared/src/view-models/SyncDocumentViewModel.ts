export interface SyncFailureViewModel {
  messageKey: string
  details?: Record<string, string[]>
  statusCode: number
}

export type SyncDocumentViewModel<T> = T & {
  originalId?: string
  remoteId?: string | null
  creationAttempted?: boolean
  _deleted?: boolean
  conflicted?: boolean
  creationAmbiguous?: boolean
  creationPending?: boolean
  confirmationPending?: boolean
  syncRetryable?: boolean
  conflictData?: { server?: T; local: T }
  validationError?: SyncFailureViewModel
  syncedAt?: Date
  assumedMasterState?: T
}
