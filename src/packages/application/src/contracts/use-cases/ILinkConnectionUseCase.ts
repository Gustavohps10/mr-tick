import { AppError, Either } from '@mr-tick/shared/helpers'

import { WorkspaceDTO } from '@/dtos'

export type LinkConnectionInput = {
  workspaceId: string
  connectionInstanceId: string
  addonId: string
  connectionProfileId: string
}

export interface ILinkConnectionUseCase {
  execute(input: LinkConnectionInput): Promise<Either<AppError, WorkspaceDTO>>
}
