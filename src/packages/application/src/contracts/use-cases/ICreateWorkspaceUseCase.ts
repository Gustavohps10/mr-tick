import { AppError, Either } from '@mr-tick/shared/helpers'

import { FileData } from '@/contracts/infra'
import { WorkspaceDTO } from '@/dtos'

export type CreateWorkspaceInput = {
  name: string
  description?: string
  avatarFile?: FileData
}

export interface ICreateWorkspaceUseCase {
  execute(input: CreateWorkspaceInput): Promise<Either<AppError, WorkspaceDTO>>
}
