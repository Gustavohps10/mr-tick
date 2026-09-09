import {
  AppError,
  createResponseViewModel,
  Either,
} from '@mr-tick/shared/helpers'
import { ViewModel } from '@mr-tick/shared/view-models'
import { IpcMainInvokeEvent } from 'electron'

import { HandlerBase } from '@/main/handlers/HandlerBase'
import { UpdaterService } from '@/main/services/UpdaterService'

export class UpdaterHandler implements HandlerBase<UpdaterHandler> {
  constructor(private readonly updaterService: UpdaterService) {}

  public async checkForUpdates(
    _event: IpcMainInvokeEvent,
  ): Promise<ViewModel<void>> {
    console.log('[UpdaterHandler] IPC checkForUpdates invoked')
    try {
      await this.updaterService.checkForUpdates()
      console.log('[UpdaterHandler] IPC checkForUpdates resolved successfully')
      return createResponseViewModel(Either.success())
    } catch (err) {
      console.error('[UpdaterHandler] IPC checkForUpdates error:', err)
      return createResponseViewModel(
        Either.failure(
          AppError.Internal(
            err instanceof Error ? err.message : 'Unknown error',
          ),
        ),
      )
    }
  }

  public async downloadUpdate(
    _event: IpcMainInvokeEvent,
  ): Promise<ViewModel<void>> {
    await this.updaterService.downloadUpdate()
    return createResponseViewModel(Either.success())
  }

  public async quitAndInstall(
    _event: IpcMainInvokeEvent,
  ): Promise<ViewModel<void>> {
    this.updaterService.quitAndInstall()
    return createResponseViewModel(Either.success())
  }
}
