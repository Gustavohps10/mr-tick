import { AppError, Either } from '@mr-tick/shared/helpers'

import { MetadataDTO } from '@/dtos/MetadataDTO'

export type PullMetadataInput = {
  workspaceId: string
  pluginId: string
  connectionInstanceId: string
  memberId: string
  checkpoint: { updatedAt: Date; id: string }
  batch: number
}

export interface IMetadataPullUseCase {
  execute(input: PullMetadataInput): Promise<Either<AppError, MetadataDTO>>
}
