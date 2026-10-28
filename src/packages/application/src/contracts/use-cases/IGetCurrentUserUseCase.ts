import { AppError, Either } from '@mr-tick/shared/helpers'

import { MemberDTO } from '@/dtos'

export interface GetCurrentUserInput {
  workspaceId: string
  connectionInstanceId: string
}

export interface IGetCurrentUserUseCase {
  execute(input: GetCurrentUserInput): Promise<Either<AppError, MemberDTO>>
}
