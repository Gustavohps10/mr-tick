import { AppError } from '@mr-tick/shared/helpers'

export type SyncDocumentDTO<T> = T & {
  originalId?: string
  _deleted?: boolean
  conflicted?: boolean
  conflictData?: { server?: T; local: T }
  validationError?: AppError
  syncedAt?: Date
  assumedMasterState?: T
}
