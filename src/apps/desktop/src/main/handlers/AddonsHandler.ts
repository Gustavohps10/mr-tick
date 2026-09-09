import {
  AddonManifest,
  FileData,
  IAddonsFacade,
  IImportAddonUseCase,
} from '@mr-tick/application'
import {
  AddonActionResponse,
  AddonSettingsSchema,
  type SidebarMenuItem,
  type TimerbarMenuItem,
} from '@mr-tick/sdk'
import { createResponseViewModel } from '@mr-tick/shared/helpers'
import {
  IEventEmitter,
  IJobEvents,
  IJobResult,
  IRequest,
} from '@mr-tick/shared/transport'
import {
  AddonInstallerViewModel,
  AddonManifestViewModel,
  AddonThemeViewModel,
  PaginatedViewModel,
  ViewModel,
} from '@mr-tick/shared/view-models'
import { type IpcMainInvokeEvent } from 'electron'

import { HandlerBase } from '@/main/handlers/HandlerBase'
import { AddonLoader } from '@/main/services/AddonLoader'

export class AddonsHandler implements HandlerBase<AddonsHandler> {
  constructor(
    private readonly importAddonService: IImportAddonUseCase,
    private readonly addonsFacade: IAddonsFacade,
    private readonly jobEmitter: IEventEmitter<IJobEvents>,
    private readonly addonLoader?: AddonLoader,
  ) {}

  public async getSidebarMenus(): Promise<ViewModel<SidebarMenuItem[]>> {
    const items = this.addonLoader ? this.addonLoader.getSidebarMenus() : []
    return {
      isSuccess: true,
      statusCode: 200,
      data: items,
    }
  }

  public async getTimerbarMenus(): Promise<ViewModel<TimerbarMenuItem[]>> {
    const items = this.addonLoader ? this.addonLoader.getTimerbarMenus() : []
    return {
      isSuccess: true,
      statusCode: 200,
      data: items,
    }
  }

  public async executeCommand<T = void>(
    _event: IpcMainInvokeEvent,
    {
      body,
    }: IRequest<{
      commandId: string
      args?: Array<string | number | boolean | Record<string, string>>
    }>,
  ): Promise<ViewModel<T>> {
    if (!body?.commandId) {
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'COMMAND_ID_REQUIRED',
      }
    }
    try {
      const result = await this.addonLoader?.executeCommand<T>(
        body.commandId,
        ...(body.args ?? []),
      )
      return {
        isSuccess: true,
        statusCode: 200,
        data: result,
      }
    } catch (err) {
      const error =
        err instanceof Error ? err.message : 'COMMAND_EXECUTION_FAILED'
      return {
        isSuccess: false,
        statusCode: 500,
        error,
      }
    }
  }

  public async showToast(
    _event: IpcMainInvokeEvent,
    {
      body,
    }: IRequest<{
      type?: 'info' | 'success' | 'warning' | 'error' | 'loading'
      message: string
      title?: string
      toastId?: string
    }>,
  ): Promise<ViewModel<string>> {
    if (!this.addonLoader) {
      return {
        isSuccess: false,
        statusCode: 404,
        error: 'LOADER_NOT_FOUND',
      }
    }
    const id = this.addonLoader.showToast(
      body.type ?? 'info',
      body.message,
      body.title,
      body.toastId,
    )
    return {
      isSuccess: true,
      statusCode: 200,
      data: id,
    }
  }

  public async dismissToast(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<{ toastId: string }>,
  ): Promise<ViewModel<void>> {
    this.addonLoader?.dismissToast(body.toastId)
    return {
      isSuccess: true,
      statusCode: 200,
    }
  }

  public async getSchema(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<{ addonId: string }>,
  ): Promise<ViewModel<AddonSettingsSchema>> {
    if (!this.addonLoader) {
      return { isSuccess: true, statusCode: 200, data: [] }
    }
    try {
      if (body?.addonId && !this.addonLoader.hasActiveAddon(body.addonId)) {
        const installedResult = await this.addonsFacade.getInstalledById(
          body.addonId,
        )
        if (installedResult.isSuccess() && installedResult.success.path) {
          await this.addonLoader.loadAndActivateFromDisk(
            body.addonId,
            installedResult.success.path,
          )
        }
      }

      const schema = await this.addonLoader.getSettingsSchema(body.addonId)
      return { isSuccess: true, statusCode: 200, data: schema }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'FAILED_TO_GET_SCHEMA'
      return { isSuccess: false, statusCode: 500, error }
    }
  }

  public async getSettings(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<{ addonId: string }>,
  ): Promise<ViewModel<Record<string, string | number | boolean | null>>> {
    if (!this.addonLoader) {
      return { isSuccess: true, statusCode: 200, data: {} }
    }
    try {
      const data = await this.addonLoader.getAddonSettings(body.addonId)
      return { isSuccess: true, statusCode: 200, data }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'FAILED_TO_GET_SETTINGS'
      return { isSuccess: false, statusCode: 500, error }
    }
  }

  public async saveSettings(
    _event: IpcMainInvokeEvent,
    {
      body,
    }: IRequest<{
      addonId: string
      settings: Record<string, string | number | boolean | null>
    }>,
  ): Promise<ViewModel<void>> {
    if (!this.addonLoader) {
      return { isSuccess: false, statusCode: 404, error: 'LOADER_NOT_FOUND' }
    }
    try {
      await this.addonLoader.saveAddonSettings(body.addonId, body.settings)
      return { isSuccess: true, statusCode: 200 }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'FAILED_TO_SAVE_SETTINGS'
      return { isSuccess: false, statusCode: 500, error }
    }
  }

  public async executeAction(
    _event: IpcMainInvokeEvent,
    {
      body,
    }: IRequest<{
      addonId: string
      actionId: string
      payload?: Record<string, string | number | boolean>
    }>,
  ): Promise<ViewModel<AddonActionResponse>> {
    if (!this.addonLoader) {
      return { isSuccess: false, statusCode: 404, error: 'LOADER_NOT_FOUND' }
    }
    try {
      if (body?.addonId && !this.addonLoader.hasActiveAddon(body.addonId)) {
        const installedResult = await this.addonsFacade.getInstalledById(
          body.addonId,
        )
        if (installedResult.isSuccess() && installedResult.success.path) {
          await this.addonLoader.loadAndActivateFromDisk(
            body.addonId,
            installedResult.success.path,
          )
        }
      }

      const data = await this.addonLoader.executeAction(
        body.addonId,
        body.actionId,
        body.payload,
      )
      return { isSuccess: true, statusCode: 200, data }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'FAILED_TO_EXECUTE_ACTION'
      return { isSuccess: false, statusCode: 500, error }
    }
  }

  public async setActiveWorkspace(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<{ workspaceId: string }>,
  ): Promise<ViewModel<void>> {
    if (this.addonLoader && body?.workspaceId) {
      this.addonLoader.setActiveWorkspace(body.workspaceId)
    }
    return { isSuccess: true, statusCode: 200 }
  }

  public async getActiveTheme(): Promise<
    ViewModel<AddonThemeViewModel | null>
  > {
    const theme = this.addonLoader ? this.addonLoader.getActiveTheme() : null
    return {
      isSuccess: true,
      statusCode: 200,
      data: theme,
    }
  }

  public async setActiveTheme(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<{ themeId: string | null }>,
  ): Promise<ViewModel<void>> {
    if (this.addonLoader) {
      this.addonLoader.setActiveTheme(body?.themeId ?? null)
    }
    return { isSuccess: true, statusCode: 200 }
  }

  public async listAvailable(
    _event?: IpcMainInvokeEvent,
    _req?: IRequest,
  ): Promise<PaginatedViewModel<AddonManifestViewModel[]>> {
    const result = await this.addonsFacade.listAvailable()

    const mappedResult = result.map((items) => {
      const viewModels = items.map((item) => ({
        ...item,
      }))

      return {
        data: viewModels,
        totalItems: items.length,
        totalPages: 1,
        currentPage: 1,
      }
    })

    return createResponseViewModel(mappedResult)
  }

  public async listInstalled(
    _event?: IpcMainInvokeEvent,
    _req?: IRequest,
  ): Promise<PaginatedViewModel<AddonManifestViewModel[]>> {
    const result = await this.addonsFacade.listInstalled()

    if (result.isFailure()) {
      return createResponseViewModel(result.forwardFailure())
    }

    const installedItems = result.success

    const viewModels = installedItems.map((item) => ({
      ...item,
      installed: true,
    }))

    return {
      isSuccess: true,
      statusCode: 200,
      data: viewModels,
      totalItems: viewModels.length,
      totalPages: 1,
      currentPage: 1,
    }
  }

  public async uninstall(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<{ addonId: string; version?: string }>,
  ): Promise<ViewModel<void>> {
    if (!body?.addonId) {
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'ADDON_ID_REQUIRED',
      }
    }

    const result = await this.addonsFacade.uninstallAddon(
      body.addonId,
      body.version,
    )
    return createResponseViewModel(result)
  }

  public async getInstalledById(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<{ addonId: string }>,
  ): Promise<ViewModel<AddonManifestViewModel>> {
    const result = await this.addonsFacade.getInstalledById(body.addonId)

    return createResponseViewModel(result)
  }

  public async getInstaller(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<{ installerUrl: string }>,
  ): Promise<ViewModel<AddonInstallerViewModel>> {
    const result = await this.addonsFacade.getInstaller(body.installerUrl)

    return createResponseViewModel(result)
  }

  public async updateLocal(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<AddonManifest>,
  ): Promise<ViewModel<void>> {
    if (!body?.id) {
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'INVALID_ADDON_MANIFEST',
      }
    }

    return {
      isSuccess: true,
      statusCode: 200,
    }
  }

  public async import(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<{ addon: FileData }>,
  ): Promise<ViewModel> {
    const result = await this.importAddonService.execute(body.addon)

    return createResponseViewModel(result)
  }

  public async install(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<{ downloadUrl: string }>,
  ): Promise<ViewModel<IJobResult>> {
    const jobId = crypto.randomUUID()

    this.runInstallationJob(jobId, body.downloadUrl).catch((err) => {
      console.error(`[Fatal Job Error ${jobId}]:`, err)
    })

    return {
      isSuccess: true,
      statusCode: 200,
      data: { jobId },
    }
  }

  private async runInstallationJob(
    jobId: string,
    downloadUrl: string,
  ): Promise<void> {
    try {
      this.jobEmitter.emit(jobId, { status: 'progress', value: 0 })

      const downloadResult = await this.addonsFacade.downloadFile(
        downloadUrl,
        (event) => {
          if (event.status !== 'progress') {
            this.jobEmitter.emit(jobId, event)
            return
          }
          const scaledValue = Math.floor(event.value * 0.7)

          this.jobEmitter.emit(jobId, {
            status: 'progress',
            value: scaledValue,
          })
        },
      )

      if (downloadResult.isFailure()) {
        this.jobEmitter.emit(jobId, {
          status: 'error',
          error: downloadResult.failure.messageKey,
        })
        return
      }

      this.jobEmitter.emit(jobId, { status: 'progress', value: 70 })

      const result = await this.importAddonService.execute(
        downloadResult.success,
        (event) => {
          if (event.status !== 'progress') {
            this.jobEmitter.emit(jobId, event)
            return
          }

          const scaledValue = 70 + Math.floor(event.value * 0.3)
          this.jobEmitter.emit(jobId, {
            status: 'progress',
            value: scaledValue,
          })
        },
      )

      if (result.isFailure()) {
        this.jobEmitter.emit(jobId, {
          status: 'error',
          error: result.failure.messageKey,
        })
        return
      }

      // Ativação imediata em memória do addon recém-instalado
      try {
        const installedList = await this.addonsFacade.listInstalled()
        if (installedList.isSuccess() && this.addonLoader) {
          for (const installed of installedList.success) {
            if (
              !this.addonLoader.hasActiveAddon(installed.id) &&
              installed.path
            ) {
              await this.addonLoader.loadAndActivateFromDisk(
                installed.id,
                installed.path,
              )
            }
          }
        }
      } catch (activationErr) {
        console.warn(
          '⚠️ [AddonsHandler] Aviso ao auto-ativar addon pós-instalação:',
          activationErr,
        )
      }

      this.jobEmitter.emit(jobId, { status: 'progress', value: 100 })
      this.jobEmitter.emit(jobId, { status: 'done' })
    } catch {
      this.jobEmitter.emit(jobId, {
        status: 'error',
        error: 'INSTALL_FAILED',
      })
    }
  }
}
