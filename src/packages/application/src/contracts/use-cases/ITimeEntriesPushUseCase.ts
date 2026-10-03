import { AppError, Either } from '@mr-tick/shared/helpers'

import { SyncDocumentDTO, TimeEntryDTO } from '@/dtos'

export type SyncTimeEntryDTO = SyncDocumentDTO<TimeEntryDTO> & {
  remoteId?: string | null
  creationAttempted?: boolean
  creationAttemptId?: string | null
  creationAmbiguous?: boolean
  creationPending?: boolean
  confirmationPending?: boolean
  syncRetryable?: boolean
  creationState?: TimeEntryDTO
}

export type PushTimeEntriesInput = {
  workspaceId: string
  pluginId: string
  connectionInstanceId: string
  entries: SyncTimeEntryDTO[]
}

export interface ITimeEntriesPushUseCase {
  execute(
    input: PushTimeEntriesInput,
  ): Promise<Either<AppError, SyncTimeEntryDTO[]>>
}
