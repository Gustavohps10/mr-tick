import { AppError, Either } from '@mr-tick/shared/helpers'

import { WorkspaceDTO } from '@/dtos'

export interface GetWorkspaceInput {
  workspaceId: string
}

export interface IGetWorkspaceUseCase {
  execute(input: GetWorkspaceInput): Promise<Either<AppError, WorkspaceDTO>>
}
