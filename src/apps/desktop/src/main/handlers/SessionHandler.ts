import { IGetCurrentUserUseCase } from '@mr-tick/application'
import { MemberDTO } from '@mr-tick/application'
import {
  AppError,
  createResponseViewModel,
  Either,
} from '@mr-tick/shared/helpers'
import { IRequest } from '@mr-tick/shared/transport'
import { MemberViewModel, ViewModel } from '@mr-tick/shared/view-models'
import { IpcMainInvokeEvent } from 'electron'

import { HandlerBase } from '@/main/handlers/HandlerBase'

export interface GetCurrentUserRequest {
  workspaceId: string
  connectionInstanceId: string
}

export class SessionHandler implements HandlerBase<SessionHandler> {
  constructor(private readonly getCurrentUserService: IGetCurrentUserUseCase) {}

  public async getCurrentUser(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<GetCurrentUserRequest>,
  ): Promise<ViewModel<MemberViewModel>> {
    const result: Either<AppError, MemberDTO> =
      await this.getCurrentUserService.execute({
        workspaceId: body.workspaceId,
        connectionInstanceId: body.connectionInstanceId,
      })

    return createResponseViewModel(result)
  }
}
