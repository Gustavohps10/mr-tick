import { AppError, Either } from '@mr-tick/shared/helpers'

import { WorkspaceDTO } from '@/dtos'

export type UnlinkConnectionInput = {
  workspaceId: string
  connectionInstanceId: string
  addonId?: string
}

export interface IUnlinkConnectionUseCase {
  execute(input: UnlinkConnectionInput): Promise<Either<AppError, WorkspaceDTO>>
}
