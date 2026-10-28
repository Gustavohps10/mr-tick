import {
  IMetadataPullUseCase,
  MetadataDTO,
  PullMetadataInput,
} from '@mr-tick/application'
import {
  AppError,
  createResponseViewModel,
  Either,
} from '@mr-tick/shared/helpers'
import { IRequest } from '@mr-tick/shared/transport'
import { MetadataViewModel, ViewModel } from '@mr-tick/shared/view-models'

import { HandlerBase } from '@/main/handlers/HandlerBase'

export class MetadataHandler implements HandlerBase<MetadataHandler> {
  constructor(private readonly metadataPullService: IMetadataPullUseCase) {}

  public async pull(
    _event: Electron.IpcMainInvokeEvent,
    { body }: IRequest<PullMetadataInput>,
  ): Promise<ViewModel<MetadataViewModel>> {
    const result: Either<AppError, MetadataDTO> =
      await this.metadataPullService.execute(body)

    return createResponseViewModel(result)
  }
}
