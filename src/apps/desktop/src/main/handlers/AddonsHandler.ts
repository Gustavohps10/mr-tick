import type { AddonVaultScope } from '@mr-tick/application'
import {
  AddonManifest,
  FileData,
  IAddonConnectionProfilesResolver,
  IAddonsFacade,
  IGetMappingFieldsUseCase,
  IImportAddonUseCase,
  IUpdateAddonUseCase,
  type MappingFieldDefinition,
} from '@mr-tick/application'
import { type ConnectionProfileDescriptor } from '@mr-tick/domain'
import {
  AddonActionResponse,
  AddonSettingsSchema,
  CommandArgument,
  CommandResult,
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
import { getSettings, saveSettings } from '@/main/settings'

export class AddonsHandler implements HandlerBase<AddonsHandler> {
  private readonly updatingAddonIds = new Set<string>()
  constructor(
    private readonly importAddonService: IImportAddonUseCase,
    private readonly updateAddonService: IUpdateAddonUseCase,
    private readonly addonsFacade: IAddonsFacade,
    private readonly jobEmitter: IEventEmitter<IJobEvents>,
    private readonly getMappingFieldsService: IGetMappingFieldsUseCase,
    private readonly addonLoader: AddonLoader,
    private readonly profilesResolver: IAddonConnectionProfilesResolver,
  ) {}

  public async getSidebarMenus(): Promise<ViewModel<SidebarMenuItem[]>> {
    let items: SidebarMenuItem[] = []
    if (this.addonLoader) {
      items = this.addonLoader.getSidebarMenus()
    }
    return {
      isSuccess: true,
      statusCode: 200,
      data: items,
    }
  }

  public async getTimerbarMenus(): Promise<ViewModel<TimerbarMenuItem[]>> {
    let items: TimerbarMenuItem[] = []
    if (this.addonLoader) {
      items = this.addonLoader.getTimerbarMenus()
    }
    return {
      isSuccess: true,
      statusCode: 200,
      data: items,
    }
  }

  public async executeCommand(
    event: IpcMainInvokeEvent,
    {
      body,
    }: IRequest<{
      commandId: string
      args?: CommandArgument[]
    }>,
  ): Promise<ViewModel<CommandResult>> {
    if (!event || !body?.commandId) {
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'COMMAND_ID_REQUIRED',
      }
    }
    try {
      let argsList: CommandArgument[] = []
      if (body.args) {
        argsList = body.args
      }
      const result = await this.addonLoader?.executeCommand(
        body.commandId,
        ...argsList,
      )
      return {
        isSuccess: true,
        statusCode: 200,
        data: result,
      }
    } catch (e) {
      let error = 'FAILED_TO_EXECUTE_COMMAND'
      if (e instanceof Error) {
        error = e.message
      }
      return { isSuccess: false, statusCode: 500, error }
    }
  }

  public async showToast(
    event: IpcMainInvokeEvent,
    {
      body,
    }: IRequest<{
      type?: 'info' | 'success' | 'warning' | 'error' | 'loading'
      message: string
      title?: string
      toastId?: string
    }>,
  ): Promise<ViewModel<string>> {
    if (!event || !this.addonLoader) {
      return {
        isSuccess: false,
        statusCode: 404,
        error: 'LOADER_NOT_FOUND',
      }
    }
    let toastType: 'info' | 'success' | 'warning' | 'error' | 'loading' = 'info'
    if (body.type) {
      toastType = body.type
    }
    const id = this.addonLoader.showToast(
      toastType,
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
    event: IpcMainInvokeEvent,
    { body }: IRequest<{ toastId: string }>,
  ): Promise<ViewModel<void>> {
    if (event) {
      this.addonLoader?.dismissToast(body.toastId)
    }
    return {
      isSuccess: true,
      statusCode: 200,
    }
  }

  public async getSchema(
    event: IpcMainInvokeEvent,
    { body }: IRequest<{ addonId: string; scope?: AddonVaultScope }>,
  ): Promise<ViewModel<AddonSettingsSchema>> {
    if (!event || !this.addonLoader) {
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

      const schema = await this.addonLoader.getSettingsSchema(
        body.addonId,
        body?.scope,
      )
      return { isSuccess: true, statusCode: 200, data: schema }
    } catch (e) {
      let error = 'FAILED_TO_GET_SCHEMA'
      if (e instanceof Error) {
        error = e.message
      }
      return { isSuccess: false, statusCode: 500, error }
    }
  }

  public async getConnectionSchema(
    event: IpcMainInvokeEvent,
    { body }: IRequest<{ addonId: string }>,
  ): Promise<ViewModel<AddonSettingsSchema>> {
    if (!event || !this.addonLoader) {
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

      const ds = this.addonLoader.getDataSource(body.addonId)
      if (ds && ds.getConnectionSchema) {
        return {
          isSuccess: true,
          statusCode: 200,
          data: ds.getConnectionSchema(),
        }
      }
      return { isSuccess: true, statusCode: 200, data: [] }
    } catch (e) {
      let error = 'FAILED_TO_GET_CONNECTION_SCHEMA'
      if (e instanceof Error) {
        error = e.message
      }
      return { isSuccess: false, statusCode: 500, error }
    }
  }

  public async getConnectionProfiles(
    event: IpcMainInvokeEvent,
    { body }: IRequest<{ addonId: string }>,
  ): Promise<ViewModel<readonly ConnectionProfileDescriptor[]>> {
    if (!event || !body?.addonId) {
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'ADDON_ID_REQUIRED',
      }
    }
    const result = await this.profilesResolver.getConnectionProfiles(
      body.addonId,
    )
    return createResponseViewModel(result)
  }

  public async getMappingFields(
    event: IpcMainInvokeEvent,
    {
      body,
    }: IRequest<{
      addonId: string
      workspaceId?: string
      connectionInstanceId?: string
    }>,
  ): Promise<ViewModel<MappingFieldDefinition[]>> {
    if (!event || !body?.addonId) {
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'ADDON_ID_REQUIRED',
      }
    }
    if (!body.workspaceId || !body.connectionInstanceId) {
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'CONNECTION_SCOPE_REQUIRED',
      }
    }

    const result = await this.getMappingFieldsService.execute({
      workspaceId: body.workspaceId,
      connectionInstanceId: body.connectionInstanceId,
    })
    return createResponseViewModel(result)
  }

  public async getSettings(
    event: IpcMainInvokeEvent,
    { body }: IRequest<{ addonId: string; scope: AddonVaultScope }>,
  ): Promise<ViewModel<import('@mr-tick/application').AddonSettingsView>> {
    if (!event || !this.addonLoader)
      return { isSuccess: false, statusCode: 404, error: 'LOADER_NOT_FOUND' }
    const result = await this.addonLoader.getAddonSettings(
      body.addonId,
      body.scope,
    )
    if (result.isFailure())
      return {
        isSuccess: false,
        statusCode: result.failure.statusCode,
        error: result.failure.messageKey,
      }
    return { isSuccess: true, statusCode: 200, data: result.success }
  }

  public async saveSettings(
    event: IpcMainInvokeEvent,
    {
      body,
    }: IRequest<{
      addonId: string
      scope: AddonVaultScope
      expectedRevision: number
      patch: Record<string, string | number | boolean | null>
      credentials?: Record<string, string | null>
    }>,
  ): Promise<ViewModel<import('@mr-tick/application').AddonSettingsView>> {
    if (!event || !this.addonLoader)
      return { isSuccess: false, statusCode: 404, error: 'LOADER_NOT_FOUND' }
    const result = await this.addonLoader.saveAddonSettings(
      body.addonId,
      body.scope,
      body.expectedRevision,
      body.patch,
      body.credentials,
    )
    if (result.isFailure())
      return {
        isSuccess: false,
        statusCode: result.failure.statusCode,
        error: result.failure.messageKey,
      }
    return { isSuccess: true, statusCode: 200, data: result.success }
  }

  public async executeAction(
    event: IpcMainInvokeEvent,
    {
      body,
    }: IRequest<{
      addonId: string
      actionId: string
      scope?: AddonVaultScope
      workspaceId?: string
      payload?: Record<string, string | number | boolean>
    }>,
  ): Promise<ViewModel<AddonActionResponse>> {
    if (!event || !this.addonLoader) {
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
        body.scope,
        body.workspaceId,
      )
      return { isSuccess: true, statusCode: 200, data }
    } catch (e) {
      let error = 'FAILED_TO_EXECUTE_ACTION'
      if (e instanceof Error) {
        error = e.message
      }
      return { isSuccess: false, statusCode: 500, error }
    }
  }

  public async setActiveWorkspace(
    event: IpcMainInvokeEvent,
    { body }: IRequest<{ workspaceId: string }>,
  ): Promise<ViewModel<void>> {
    if (event && this.addonLoader && body?.workspaceId) {
      this.addonLoader.setActiveWorkspace(body.workspaceId)
    }
    if (body?.workspaceId) {
      try {
        const current = getSettings()
        saveSettings({ ...current, lastSelectedWorkspaceId: body.workspaceId })
      } catch (err) {
        console.error('❌ [AddonsHandler] Erro ao salvar workspace ativo:', err)
      }
    }
    return { isSuccess: true, statusCode: 200 }
  }

  public async getActiveTheme(): Promise<
    ViewModel<AddonThemeViewModel | null>
  > {
    let theme: AddonThemeViewModel | null = null
    if (this.addonLoader) {
      theme = this.addonLoader.getActiveTheme()
    }
    return {
      isSuccess: true,
      statusCode: 200,
      data: theme,
    }
  }

  public async listThemes(): Promise<ViewModel<AddonThemeViewModel[]>> {
    let themes: AddonThemeViewModel[] = []
    if (this.addonLoader) {
      themes = this.addonLoader.getThemes()
    }
    return {
      isSuccess: true,
      statusCode: 200,
      data: themes,
    }
  }

  public async setActiveTheme(
    event: IpcMainInvokeEvent,
    { body }: IRequest<{ themeId: string | null }>,
  ): Promise<ViewModel<void>> {
    if (event && this.addonLoader) {
      let nextThemeId: string | null = null
      if (body && body.themeId) {
        nextThemeId = body.themeId
      }
      this.addonLoader.setActiveTheme(nextThemeId)
    }
    return { isSuccess: true, statusCode: 200 }
  }

  public async listAvailable(): Promise<
    PaginatedViewModel<AddonManifestViewModel[]>
  > {
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

  public async listInstalled(): Promise<
    PaginatedViewModel<AddonManifestViewModel[]>
  > {
    const result = await this.addonsFacade.listInstalled()

    if (result.isFailure()) {
      return createResponseViewModel(result.forwardFailure())
    }

    const installedItems = result.success.filter(
      (item, index, items) =>
        items.findIndex((candidate) => candidate.id === item.id) === index,
    )

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
    event: IpcMainInvokeEvent,
    { body }: IRequest<{ addonId: string; version?: string }>,
  ): Promise<ViewModel<void>> {
    if (!event || !body?.addonId) {
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'ADDON_ID_REQUIRED',
      }
    }

    if (this.updatingAddonIds.has(body.addonId))
      return {
        isSuccess: false,
        statusCode: 409,
        error: 'ATUALIZACAO_ADDON_EM_ANDAMENTO',
      }
    const result = await this.addonsFacade.uninstallAddon(
      body.addonId,
      body.version,
    )
    return createResponseViewModel(result)
  }

  public async getInstalledById(
    event: IpcMainInvokeEvent,
    { body }: IRequest<{ addonId: string }>,
  ): Promise<ViewModel<AddonManifestViewModel>> {
    if (!event) {
      return { isSuccess: false, statusCode: 400, error: 'INVALID_EVENT' }
    }
    const result = await this.addonsFacade.getInstalledById(body.addonId)

    return createResponseViewModel(result)
  }

  public async getInstaller(
    event: IpcMainInvokeEvent,
    { body }: IRequest<{ installerUrl: string }>,
  ): Promise<ViewModel<AddonInstallerViewModel>> {
    if (!event) {
      return { isSuccess: false, statusCode: 400, error: 'INVALID_EVENT' }
    }
    const result = await this.addonsFacade.getInstaller(body.installerUrl)

    return createResponseViewModel(result)
  }

  public async updateLocal(
    event: IpcMainInvokeEvent,
    { body }: IRequest<AddonManifest>,
  ): Promise<ViewModel<void>> {
    if (!event || !body?.id) {
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
    event: IpcMainInvokeEvent,
    { body }: IRequest<{ addon: FileData }>,
  ): Promise<ViewModel> {
    if (!event) {
      return { isSuccess: false, statusCode: 400, error: 'INVALID_EVENT' }
    }
    const result = await this.importAddonService.execute(body.addon)

    return createResponseViewModel(result)
  }

  public async install(
    event: IpcMainInvokeEvent,
    {
      body,
    }: IRequest<{
      downloadUrl: string
      jobId?: string
      expectedSha256?: string
    }>,
  ): Promise<ViewModel<IJobResult>> {
    if (!event) {
      return { isSuccess: false, statusCode: 400, error: 'INVALID_EVENT' }
    }
    let jobId: string = crypto.randomUUID()
    if (body.jobId) {
      jobId = body.jobId
    }

    this.runInstallationJob(jobId, body.downloadUrl, body.expectedSha256).catch(
      (err) => {
        console.error(`[Fatal Job Error ${jobId}]:`, err)
      },
    )

    return {
      isSuccess: true,
      statusCode: 200,
      data: { jobId },
    }
  }

  public async update(
    event: IpcMainInvokeEvent,
    {
      body,
    }: IRequest<{
      addonId: string
      downloadUrl: string
      jobId: string
      expectedSha256?: string
    }>,
  ): Promise<ViewModel<IJobResult>> {
    if (!event || !body?.addonId || !body?.downloadUrl || !body?.jobId) {
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'PARAMETROS_INVALIDOS',
      }
    }

    if (this.updatingAddonIds.has(body.addonId))
      return {
        isSuccess: false,
        statusCode: 409,
        error: 'ATUALIZACAO_ADDON_EM_ANDAMENTO',
      }
    this.updatingAddonIds.add(body.addonId)
    const jobId = body.jobId

    this.runUpdateJob(
      jobId,
      body.addonId,
      body.downloadUrl,
      body.expectedSha256,
    ).catch((err) => {
      console.error(`[Fatal Update Job Error ${jobId}]:`, err)
    })

    return {
      isSuccess: true,
      statusCode: 200,
      data: { jobId },
    }
  }

  private async runUpdateJob(
    jobId: string,
    addonId: string,
    downloadUrl: string,
    expectedSha256?: string,
  ): Promise<void> {
    try {
      this.jobEmitter.emit(jobId, { status: 'progress', value: 0 })

      const result = await this.updateAddonService.execute(
        { addonId, downloadUrl, expectedSha256 },
        (event) => {
          this.jobEmitter.emit(jobId, event)
        },
      )

      if (result.isFailure()) {
        this.jobEmitter.emit(jobId, {
          status: 'error',
          error: result.failure.messageKey,
        })
        return
      }

      this.jobEmitter.emit(jobId, { status: 'progress', value: 100 })
      this.jobEmitter.emit(jobId, { status: 'done' })
    } catch {
      this.jobEmitter.emit(jobId, {
        status: 'error',
        error: 'UPDATE_FAILED',
      })
    } finally {
      this.updatingAddonIds.delete(addonId)
    }
  }

  private async runInstallationJob(
    jobId: string,
    downloadUrl: string,
    expectedSha256?: string,
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
        expectedSha256,
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
