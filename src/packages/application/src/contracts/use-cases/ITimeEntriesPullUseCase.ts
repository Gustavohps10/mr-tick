import { AppError, Either } from '@mr-tick/shared/helpers'

import { TimeEntryPullCheckpointDTO, TimeEntryPullPageDTO } from '@/dtos'

export type PullTimeEntriesInput = {
  workspaceId: string
  connectionInstanceId: string
  checkpoint: TimeEntryPullCheckpointDTO
  batch: number
}

export interface ITimeEntriesPullUseCase {
  execute(
    input: PullTimeEntriesInput,
  ): Promise<Either<AppError, TimeEntryPullPageDTO>>
}
