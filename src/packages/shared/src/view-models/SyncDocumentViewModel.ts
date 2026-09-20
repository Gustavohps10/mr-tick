export type SyncDocumentViewModel<T> = T & {
  originalId?: string
  _deleted?: boolean
  conflicted?: boolean
  conflictData?: { server?: T; local: T }
  validationError?: {
    messageKey: string
    details?: Record<string, string[]>
    statusCode: number
  }
  syncedAt?: Date
  assumedMasterState?: T
}
