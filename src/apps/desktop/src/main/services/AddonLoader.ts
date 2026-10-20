import { EventEmitter } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  AddonCapabilityOwnershipValidator,
  AddonConnectionAuthenticator,
  AddonSettingsView,
  CoreAddonScopeOwnershipValidator,
  GetAddonSettingsService,
  IAddonAccessService,
  IAddonAuthenticatorRegistry,
  IAddonConnectionProfilesRegistry,
  IAddonSettingsRepository,
  isFlatSettingsFieldList,
  SaveAddonSettingsService,
} from '@mr-tick/application'
import {
  IAddonReloader,
  IConnectionCredentialsVault,
  ICoreAddonCapabilities,
  ICredentialsVault,
  ILicensingFacade,
  ILocalRuntimeAPI,
  IOAuthAttemptCoordinator,
  IWorkspaceCredentialReferenceRegistry,
} from '@mr-tick/application'
import {
  AddonActionResponse,
  AddonCapabilityDescriptor,
  AddonContext,
  AddonRuntimeCapabilities,
  AddonSettingsApplyHandler,
  AddonSettingsRegisterOptions,
  AddonSettingsSchema,
  AddonSettingsSchemaProvider,
  AddonSettingsTab,
  AddonSettingsValues,
  AddonTheme,
  AddonTimerControlLock,
  AddonVaultScope,
  CommandArgument,
  CommandHandler,
  CommandResult,
  generateOAuthState,
  generatePKCE,
  IAddon,
  IAddonCommandsAPI,
  IAddonConnectionsContributionAPI,
  IAddonDataSourcesAPI,
  IAddonEventsAPI,
  IAddonManifest,
  IAddonMenusAPI,
  IAddonNotificationsAPI,
  IAddonOAuthAPI,
  IAddonSettingsAPI,
  IDataSource,
  IRegistry,
  OAuthAuthorizeOptions,
  OAuthResult,
  SidebarMenuItem,
  TimerbarMenuItem,
} from '@mr-tick/sdk'
import {
  AppError,
  compareSemVer,
  Either,
  hasProperty,
  isApiVersionCompatible,
  isBoolean,
  isFunction,
  isNonEmptyString,
  isRecord,
  isString,
  parseSemVer,
} from '@mr-tick/shared/helpers'
import { ISystemEvents } from '@mr-tick/shared/transport'
import { BrowserWindow, Notification, shell } from 'electron'
import yaml from 'js-yaml'

import { getSettings, saveSettings } from '@/main/settings'

import sdkPkg from '../../../../sdk/package.json'
import { AddonBindingLifetime, AddonLifetime } from './AddonLifetime'
import { AddonScopedVault } from './AddonScopedVault'
import {
  GuardedMemberProvider,
  GuardedMetadataProvider,
  GuardedTaskProvider,
  GuardedTimeEntryProvider,
} from './GuardedDataSourceProviders'

export class MemoryRegistry<T extends { id?: string }> implements IRegistry<T> {
  private items = new Map<string, T>()

  register(item: T): void {
    if (item && item.id) {
      this.items.set(item.id, item)
    }
  }

  unregister(id: string): void {
    this.items.delete(id)
  }

  getItems(): T[] {
    return Array.from(this.items.values())
  }
}

export class CommandRegistry implements IAddonCommandsAPI {
  private handlers = new Map<string, CommandHandler>()
  private readonly aliases = new Map<string, Set<string>>()

  register(id: string, handler: CommandHandler): void {
    this.handlers.set(id, handler)
  }

  registerOwned(owner: string, id: string, handler: CommandHandler): void {
    const qualified = `${owner}:${id}`
    this.handlers.set(qualified, handler)
    let aliases = this.aliases.get(id)
    if (aliases === undefined) {
      aliases = new Set()
      this.aliases.set(id, aliases)
    }
    aliases.add(qualified)
  }

  unregisterOwned(owner: string, id: string): void {
    const qualified = `${owner}:${id}`
    this.handlers.delete(qualified)
    const aliases = this.aliases.get(id)
    aliases?.delete(qualified)
    if (aliases?.size === 0) this.aliases.delete(id)
  }

  unregister(id: string): void {
    this.handlers.delete(id)
  }

  private resolve(id: string): CommandHandler | undefined {
    const direct = this.handlers.get(id)
    if (direct !== undefined) return direct
    const aliases = this.aliases.get(id)
    if (aliases?.size !== 1) return undefined
    for (const qualified of aliases) return this.handlers.get(qualified)
    return undefined
  }

  async execute(
    id: string,
    ...args: CommandArgument[]
  ): Promise<CommandResult> {
    const handler = this.resolve(id)
    if (handler === undefined)
      return { isSuccess: false, error: 'COMMAND_NOT_FOUND_OR_AMBIGUOUS' }
    return await handler(...args)
  }

  getItems(): Array<{ id: string }> {
    return Array.from(this.handlers.keys()).map((id) => ({ id }))
  }

  has(id: string): boolean {
    return this.resolve(id) !== undefined
  }
}

export type AddonToastEventData =
  | {
      action: 'show'
      type: 'info' | 'success' | 'warning' | 'error' | 'loading'
      message: string
      title?: string
      toastId: string
    }
  | {
      action: 'dismiss'
      toastId: string
    }

export interface ActiveAddonInfo {
  addonId: string
  instance: IAddon & { metadata?: { name?: string; iconUrl?: string } }
}

export class AddonEventEmitter implements IAddonEventsAPI {
  private emitter = new EventEmitter()

  on<K extends keyof ISystemEvents>(
    event: K,
    handler: (payload: ISystemEvents[K]) => void,
  ): () => void
  on<T = void>(channel: string, handler: (data: T) => void): () => void
  on(
    channel: string,
    handler: (data: ISystemEvents[keyof ISystemEvents]) => void,
  ): () => void {
    const listener = (data: ISystemEvents[keyof ISystemEvents]) => {
      handler(data)
    }
    this.emitter.on(channel, listener)
    return () => {
      this.emitter.off(channel, listener)
    }
  }

  once<K extends keyof ISystemEvents>(
    event: K,
    handler: (payload: ISystemEvents[K]) => void,
  ): void
  once<T = void>(channel: string, handler: (data: T) => void): void
  once(
    channel: string,
    handler: (data: ISystemEvents[keyof ISystemEvents]) => void,
  ): void {
    const listener = (data: ISystemEvents[keyof ISystemEvents]) => {
      handler(data)
    }
    this.emitter.once(channel, listener)
  }

  emit<K extends keyof ISystemEvents>(event: K, payload: ISystemEvents[K]): void
  emit<T = void>(channel: string, payload?: T): void
  emit(channel: string, payload?: ISystemEvents[keyof ISystemEvents]): void {
    this.emitter.emit(channel, payload)
  }

  off<K extends keyof ISystemEvents>(
    event: K,
    handler: (payload: ISystemEvents[K]) => void,
  ): void
  off<T = void>(channel: string, handler: (data: T) => void): void
  off(
    channel: string,
    handler: (data: ISystemEvents[keyof ISystemEvents]) => void,
  ): void {
    const listener = (data: ISystemEvents[keyof ISystemEvents]) => {
      handler(data)
    }
    this.emitter.off(channel, listener)
  }
}

export function isCapabilityContractCompatible(
  requiredVersion: string,
  supportedVersion: string,
): boolean {
  const req = parseSemVer(requiredVersion)
  const sup = parseSemVer(supportedVersion)
  if (req === null || sup === null) return false
  if (req.major !== sup.major) return false
  if (req.major === 0) {
    if (req.minor !== sup.minor) return false
    return sup.patch >= req.patch
  }
  return compareSemVer(sup, req) >= 0
}

export class AddonLoader implements IAddonReloader {
  private activeAddons = new Map<string, ActiveAddonInfo>()
  private loadingAddons = new Map<string, Promise<boolean>>()
  private addonMetadata = new Map<string, { name?: string; iconUrl?: string }>()
  private readonly timerControlLock = new AddonTimerControlLock()
  private toastListeners: Array<(toastData: AddonToastEventData) => void> = []
  private licensingFacade: ILicensingFacade | null = null

  public readonly sidebarRegistry = new MemoryRegistry<SidebarMenuItem>()
  private addonTimerbarItems = new Map<string, TimerbarMenuItem>()
  private addonSettingsSchemas = new Map<string, AddonSettingsSchemaProvider>()
  private addonSettingsApplyHandlers = new Map<
    string,
    AddonSettingsApplyHandler
  >()
  public readonly dataSourceRegistry = new MemoryRegistry<
    IDataSource & { id?: string }
  >()
  public readonly themesRegistry = new MemoryRegistry<AddonTheme>()
  private activeThemeId: string | null = null
  public readonly commandRegistry = new CommandRegistry()
  public readonly systemEventEmitter = new AddonEventEmitter()
  private pendingOAuthRequests = new Map<
    string,
    {
      addonId: string
      resolve: (val: OAuthResult) => void
      reject: (err: Error) => void
      timeoutId: NodeJS.Timeout
    }
  >()

  private readonly getAddonSettingsService: GetAddonSettingsService
  private readonly saveAddonSettingsService: SaveAddonSettingsService

  constructor(
    private credentialsVault: ICredentialsVault & IConnectionCredentialsVault,
    private readonly localRuntime: ILocalRuntimeAPI,
    private readonly hostSdkVersion: string,
    private readonly coreForAddon: (addonId: string) => ICoreAddonCapabilities,
    private readonly addonAccessService: IAddonAccessService,
    private readonly workspaceReferenceRegistry: IWorkspaceCredentialReferenceRegistry,
    private readonly addonSettingsRepository: IAddonSettingsRepository,
    private readonly authenticatorRegistry: IAddonAuthenticatorRegistry,
    private readonly profilesResolver: IAddonConnectionProfilesRegistry,
    private readonly oauthAttemptCoordinator: IOAuthAttemptCoordinator,
  ) {
    const capabilityOwnershipValidator = new AddonCapabilityOwnershipValidator(
      (addonId, capabilityId) => {
        if (this.disabledCapabilities.has(`${addonId}:${capabilityId}`)) {
          return undefined
        }
        const caps = this.addonCapabilities.get(addonId)
        if (!caps) return undefined
        return caps.find((c) => c.capabilityId === capabilityId)
      },
    )
    const ownershipValidator = new CoreAddonScopeOwnershipValidator(
      (addonId) => this.coreForAddon(addonId).connections,
      capabilityOwnershipValidator,
    )
    this.getAddonSettingsService = new GetAddonSettingsService(
      (addonId) => this.vaultFor(addonId),
      ownershipValidator,
    )
    this.saveAddonSettingsService = new SaveAddonSettingsService(
      (addonId) => this.vaultFor(addonId),
      ownershipValidator,
    )
    this.registerThemeCommands()
    this.restoreActiveTheme()
    this.systemEventEmitter.on('connection:disconnected', (payload) => {
      if (payload && payload.workspaceId && payload.connectionInstanceId) {
        this.notifyConnectionBindingChanged(
          payload.workspaceId,
          payload.connectionInstanceId,
          'stop',
        )
      }
    })
    this.systemEventEmitter.on('connection:archived', (payload) => {
      if (payload && payload.workspaceId && payload.connectionInstanceId) {
        this.notifyConnectionBindingChanged(
          payload.workspaceId,
          payload.connectionInstanceId,
          'cancel',
        )
      }
    })
    this.systemEventEmitter.on('connection:removed', (payload) => {
      if (payload && payload.workspaceId && payload.connectionInstanceId) {
        this.notifyConnectionBindingChanged(
          payload.workspaceId,
          payload.connectionInstanceId,
          'cancel',
        )
      }
    })
  }

  public setLicensingFacade(licensingFacade: ILicensingFacade): void {
    this.licensingFacade = licensingFacade
  }

  public getHostSdkVersion(): string {
    return this.hostSdkVersion
  }

  public getConnectionAuthenticator(
    addonId: string,
    authProfileId: string,
  ): AddonConnectionAuthenticator | undefined {
    return this.authenticatorRegistry.getAuthenticator(addonId, authProfileId)
  }

  private registerThemeCommands(): void {
    this.commandRegistry.register('theme:set', async (themeId) => {
      let targetThemeId: string | null = null
      if (isNonEmptyString(themeId)) {
        targetThemeId = themeId
      }
      this.setActiveTheme(targetThemeId)
      return { status: 'success', themeId: targetThemeId }
    })
  }

  private restoreActiveTheme(): void {
    try {
      const savedSettings = getSettings()
      if (savedSettings?.activeThemeId) {
        this.activeThemeId = savedSettings.activeThemeId
        console.log(
          `🎨 [AddonLoader] Tema ativo restaurado das configurações: ${this.activeThemeId}`,
        )
      }
    } catch (err) {
      console.error(
        '❌ [AddonLoader] Erro ao restaurar tema das configurações:',
        err,
      )
    }
  }

  public showToast(
    type: 'info' | 'success' | 'warning' | 'error' | 'loading',
    message: string,
    title?: string,
    toastId?: string,
  ): string {
    let generatedId = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    if (toastId) {
      generatedId = toastId
    }
    const toastData: AddonToastEventData = {
      action: 'show',
      type,
      message,
      title,
      toastId: generatedId,
    }
    let displayTitle = ''
    if (title) {
      displayTitle = title
    }
    console.log(
      `🔔 [AddonLoader] Broadcasting toast [${type}]: "${message}" (${displayTitle})`,
    )
    this.toastListeners.forEach((listener) => listener(toastData))

    try {
      if (
        typeof Notification !== 'undefined' &&
        Notification.isSupported &&
        Notification.isSupported()
      ) {
        new Notification({
          title: title || 'Mr. Tick',
          body: message,
        }).show()
      }
    } catch (notifErr) {
      console.warn(
        '[AddonLoader] Falha ao exibir notificação nativa:',
        notifErr,
      )
    }

    try {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('addons:toast', toastData)
        }
      })
    } catch (err) {
      console.error('❌ [AddonLoader] Erro ao enviar IPC de toast:', err)
    }

    return generatedId
  }

  public dismissToast(toastId: string): void {
    const toastData: AddonToastEventData = { action: 'dismiss', toastId }
    console.log(`🔔 [AddonLoader] Dismissing toast: ${toastId}`)
    this.toastListeners.forEach((listener) => listener(toastData))

    try {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('addons:toast', toastData)
        }
      })
    } catch (err) {
      console.error(
        '❌ [AddonLoader] Erro ao enviar IPC de dismiss toast:',
        err,
      )
    }
  }

  public onToast(
    listener: (toastData: AddonToastEventData) => void,
  ): () => void {
    this.toastListeners.push(listener)
    return () => {
      this.toastListeners = this.toastListeners.filter((l) => l !== listener)
    }
  }

  private readonly supportedContractVersions: Record<string, string> = {
    dataSource: '1.0.0',
    watcher: '1.0.0',
    calendar: '1.0.0',
    punch: '1.0.0',
    theme: '1.0.0',
    custom: '1.0.0',
  }
  private readonly addonCapabilities = new Map<
    string,
    AddonCapabilityDescriptor[]
  >()
  private readonly disabledCapabilities = new Set<string>()

  public notifyConnectionBindingChanged(
    workspaceId: string,
    connectionInstanceId: string,
    action: 'stop' | 'cancel' | 'restart',
    capabilityId?: string,
  ): void {
    for (const lifetime of this.lifetimes.values()) {
      if (action === 'stop' || action === 'cancel') {
        lifetime.stopConnectionBindings(workspaceId, connectionInstanceId)
      }
      if (action === 'restart') {
        lifetime
          .binding(workspaceId, connectionInstanceId, capabilityId)
          .startNextGeneration()
      }
    }
  }

  public getAddonBindingLifetime(
    addonId: string,
    workspaceId: string,
    connectionInstanceId: string,
    capabilityId?: string,
  ): AddonBindingLifetime | undefined {
    const lifetime = this.lifetimes.get(addonId)
    if (!lifetime) return undefined
    return lifetime.binding(workspaceId, connectionInstanceId, capabilityId)
  }

  public registerManifestCapabilities(
    addonId: string,
    capabilities?: AddonCapabilityDescriptor[],
  ): Either<AppError, void> {
    if (!capabilities || capabilities.length === 0) {
      return Either.success()
    }
    const seenIds = new Set<string>()
    let dataSourceCount = 0
    const pendingDisabled = new Set<string>()
    for (const cap of capabilities) {
      if (seenIds.has(cap.capabilityId)) {
        return Either.failure(
          AppError.ValidationError(
            `CAPABILITY_DUPLICATE_ID:${cap.capabilityId}`,
          ),
        )
      }
      seenIds.add(cap.capabilityId)
      if (cap.kind === 'dataSource') {
        dataSourceCount += 1
      }
      const supported = this.supportedContractVersions[cap.kind]
      if (supported === undefined) {
        return Either.failure(
          AppError.ValidationError(`CAPABILITY_UNKNOWN_KIND:${cap.kind}`),
        )
      }
      const isCompatible = isCapabilityContractCompatible(
        cap.contractVersion,
        supported,
      )
      if (!isCompatible) {
        if (cap.required) {
          return Either.failure(
            AppError.ValidationError(
              `CAPABILITY_CONTRACT_INCOMPATIBLE:${cap.capabilityId}`,
            ),
          )
        }
        pendingDisabled.add(`${addonId}:${cap.capabilityId}`)
      }
    }
    if (dataSourceCount > 1) {
      return Either.failure(
        AppError.ValidationError('MULTIPLE_DATASOURCES_NOT_ALLOWED'),
      )
    }
    for (const key of Array.from(this.disabledCapabilities)) {
      if (key.startsWith(`${addonId}:`)) {
        this.disabledCapabilities.delete(key)
      }
    }
    for (const key of pendingDisabled) {
      this.disabledCapabilities.add(key)
    }
    this.addonCapabilities.set(addonId, capabilities)
    return Either.success()
  }

  public isOperationSupported(
    addonId: string,
    capabilityId: string,
    operation: string,
  ): boolean {
    if (this.disabledCapabilities.has(`${addonId}:${capabilityId}`)) {
      return false
    }
    const caps = this.addonCapabilities.get(addonId)
    if (caps === undefined) return false
    const cap = caps.find((c) => c.capabilityId === capabilityId)
    if (cap === undefined) return false
    if (
      !Array.isArray(cap.supportedOperations) ||
      cap.supportedOperations.length === 0
    ) {
      return false
    }
    if (cap.supportedOperations.includes(operation)) {
      return true
    }
    if (
      (operation === 'pull' ||
        operation === 'findAll' ||
        operation === 'findById' ||
        operation === 'findByMemberId' ||
        operation === 'getCurrentUser' ||
        operation === 'findByCredentials' ||
        operation === 'getMetadata' ||
        operation === 'getMappingFields') &&
      cap.supportedOperations.includes('read')
    ) {
      return true
    }
    if (
      (operation === 'create' ||
        operation === 'update' ||
        operation === 'delete' ||
        operation === 'updateConditional') &&
      cap.supportedOperations.includes('write')
    ) {
      return true
    }
    return false
  }

  private readonly addonVaults = new Map<string, AddonScopedVault>()
  private readonly lifetimes = new Map<string, AddonLifetime>()
  private vaultFor(addonId: string): AddonScopedVault {
    const existing = this.addonVaults.get(addonId)
    if (existing !== undefined) return existing
    const vault = new AddonScopedVault(
      addonId,
      this.credentialsVault,
      this.credentialsVault,
      this.workspaceReferenceRegistry,
      this.addonSettingsRepository,
    )
    this.addonVaults.set(addonId, vault)
    return vault
  }

  private activeWorkspaceId: string | null = null
  private readonly appliedSettingsRevisions = new Map<string, number>()
  private readonly latestStartedSettingsRevisions = new Map<string, number>()

  public getAppliedSettingsRevision(
    addonId: string,
    scope: AddonVaultScope,
  ): number | undefined {
    return this.appliedSettingsRevisions.get(
      this.buildSettingsRevisionKey(addonId, scope),
    )
  }

  private buildSettingsRevisionKey(
    addonId: string,
    scope: AddonVaultScope,
  ): string {
    if (scope.kind === 'addon') {
      return `${addonId}:addon`
    }
    if (scope.kind === 'workspace') {
      return `${addonId}:workspace:${scope.workspaceId}`
    }
    if (scope.kind === 'connection') {
      return `${addonId}:connection:${scope.workspaceId}:${scope.connectionInstanceId}`
    }
    return `${addonId}:capability:${scope.workspaceId}:${scope.connectionInstanceId}:${scope.capabilityId}`
  }

  public setActiveWorkspace(workspaceId: string): void {
    if (workspaceId && workspaceId !== this.activeWorkspaceId) {
      const previousWorkspaceId = this.activeWorkspaceId
      this.activeWorkspaceId = workspaceId
      let prevDisplay = 'Nenhum'
      let prevValue: string | undefined
      if (previousWorkspaceId) {
        prevDisplay = previousWorkspaceId
        prevValue = previousWorkspaceId
      }
      for (const [addonId, caps] of this.addonCapabilities.entries()) {
        const enabledCaps = caps.filter(
          (cap) =>
            !this.disabledCapabilities.has(`${addonId}:${cap.capabilityId}`),
        )
        const lifetime = this.lifetimes.get(addonId)
        for (const cap of enabledCaps) {
          if (
            cap.executionPolicy.kind === 'activeWorkspace' &&
            previousWorkspaceId
          ) {
            lifetime?.stopWorkspaceCapabilityBindings(
              previousWorkspaceId,
              cap.capabilityId,
            )
          }
        }
      }
      console.log(
        `[AddonLoader] 🔄 Workspace alterado de "${prevDisplay}" para "${workspaceId}"`,
      )
      this.systemEventEmitter.emit('workspace:changed', {
        previousWorkspaceId: prevValue,
        currentWorkspaceId: workspaceId,
      })
    }
  }

  public createOAuthAPI(addonId: string): IAddonOAuthAPI {
    return {
      generatePKCE: () => generatePKCE(),
      generateState: (prefix?: string) => {
        let statePrefix = addonId
        if (prefix) {
          statePrefix = prefix
        }
        return generateOAuthState(statePrefix)
      },
      authorize: (options: OAuthAuthorizeOptions) => {
        return new Promise<OAuthResult>((resolve, reject) => {
          try {
            if (!options || !options.authUrl) {
              return reject(
                new Error('URL de autorização (authUrl) é obrigatória.'),
              )
            }

            let parsedUrl: URL
            try {
              parsedUrl = new URL(options.authUrl)
            } catch {
              return reject(
                new Error(`URL de autorização inválida: "${options.authUrl}"`),
              )
            }

            const isHttps = parsedUrl.protocol === 'https:'
            const isLocalDevelopment =
              parsedUrl.protocol === 'http:' &&
              (parsedUrl.hostname === 'localhost' ||
                parsedUrl.hostname === '127.0.0.1')

            if (!isHttps && !isLocalDevelopment) {
              return reject(
                new Error(
                  'Protocolo de URL inválido. Utilize HTTPS ou HTTP somente para localhost/127.0.0.1 em desenvolvimento.',
                ),
              )
            }

            let state = generateOAuthState(addonId)
            if (options.state) {
              state = options.state
            }
            const existingStateInUrl = parsedUrl.searchParams.get('state')

            if (existingStateInUrl && existingStateInUrl !== state) {
              return reject(
                new Error(
                  'Inconsistência de state: o state da authUrl não corresponde ao state esperado.',
                ),
              )
            }

            parsedUrl.searchParams.set('state', state)

            let timeoutMs = 120000
            if (options.timeoutMs && options.timeoutMs > 0) {
              timeoutMs = options.timeoutMs
            }

            const timeoutId = setTimeout(() => {
              this.pendingOAuthRequests.delete(state)
              reject(new Error('Tempo limite de autenticação esgotado.'))
            }, timeoutMs)

            this.pendingOAuthRequests.set(state, {
              addonId,
              resolve,
              reject,
              timeoutId,
            })

            const finalUrl = parsedUrl.toString()
            Promise.resolve(shell.openExternal(finalUrl)).catch((err) => {
              clearTimeout(timeoutId)
              this.pendingOAuthRequests.delete(state)
              let errText = String(err)
              if (err instanceof Error) {
                errText = err.message
              }
              reject(
                new Error(
                  `Falha ao abrir navegador para autorização: ${errText}`,
                ),
              )
            })
          } catch (err) {
            if (err instanceof Error) {
              reject(err)
              return
            }
            reject(new Error(String(err)))
          }
        })
      },
    }
  }

  public createContext(addonId: string): AddonContext {
    const addonCore = this.coreForAddon(addonId)
    const lifetime = new AddonLifetime()
    this.lifetimes.get(addonId)?.dispose()
    this.lifetimes.set(addonId, lifetime)
    const vault = this.vaultFor(addonId)

    const addonTimerbarRegistry: IRegistry<TimerbarMenuItem> = {
      register: (item: TimerbarMenuItem) => {
        const itemWithAddon = { ...item, addonId }
        if (!lifetime.isActive()) return
        this.addonTimerbarItems.set(addonId, itemWithAddon)
        lifetime.track(() => this.addonTimerbarItems.delete(addonId))
      },
      unregister: (id: string) => {
        if (!lifetime.isActive()) return
        const item = this.addonTimerbarItems.get(addonId)
        if (item?.id !== id) return
        this.addonTimerbarItems.delete(addonId)
      },
      getItems: () => {
        const item = this.addonTimerbarItems.get(addonId)
        if (!item) return []
        return [item]
      },
    }

    const menusRegistry: IAddonMenusAPI = {
      sidebar: lifetime.registry(addonId, this.sidebarRegistry),
      timerbar: addonTimerbarRegistry,
    }

    const notifications: IAddonNotificationsAPI = {
      info: async (message, title) => this.showToast('info', message, title),
      success: async (message, title) =>
        this.showToast('success', message, title),
      warning: async (message, title) =>
        this.showToast('warning', message, title),
      error: async (message, title) => this.showToast('error', message, title),
      loading: async (message, title) =>
        this.showToast('loading', message, title),
      dismiss: async (toastId) => this.dismissToast(toastId),
    }

    const capabilities = new AddonRuntimeCapabilities(
      this.localRuntime,
      this.getAddonSourceInfo(addonId),
      this.timerControlLock,
    )
    const timer = capabilities.timer
    const timeEntries = capabilities.timeEntries
    const oauth = this.createOAuthAPI(addonId)

    const settingsRegistry: IAddonSettingsAPI = {
      register: (
        schema: AddonSettingsSchemaProvider,
        options?: AddonSettingsRegisterOptions,
      ) => {
        if (!lifetime.isActive()) return
        this.addonSettingsSchemas.set(addonId, schema)
        if (options?.onApply !== undefined) {
          this.addonSettingsApplyHandlers.set(addonId, options.onApply)
        }
        lifetime.track(() => {
          this.addonSettingsSchemas.delete(addonId)
          this.addonSettingsApplyHandlers.delete(addonId)
        })
      },
      getSchema: (context) => {
        const item = this.addonSettingsSchemas.get(addonId)
        if (!item) return undefined
        if (Array.isArray(item)) return item
        return item(context)
      },
    }

    const dataSourceRegistryProxy: IAddonDataSourcesAPI = {
      register: (item: IDataSource) => {
        if (!lifetime.isActive()) return
        const dsCap = this.addonCapabilities
          .get(addonId)
          ?.find((c) => c.kind === 'dataSource')
        if (
          dsCap === undefined ||
          this.disabledCapabilities.has(`${addonId}:${dsCap.capabilityId}`)
        ) {
          return
        }
        const itemWithId: IDataSource & { id: string } = {
          id: addonId,
          getConnectionProfiles: () => item.getConnectionProfiles(),
          getConnectionSchema: () => item.getConnectionSchema(),
          createInstance: (context) => {
            const isScopeValid = Boolean(
              context.scope &&
              isNonEmptyString(context.scope.workspaceId) &&
              isNonEmptyString(context.scope.connectionInstanceId),
            )
            let workspaceId = ''
            let connectionInstanceId = ''
            if (context.scope && isScopeValid) {
              workspaceId = context.scope.workspaceId
              connectionInstanceId = context.scope.connectionInstanceId
            }
            const binding = lifetime.binding(
              workspaceId,
              connectionInstanceId,
              dsCap.capabilityId,
            )
            const capturedGen = binding.getGeneration()
            const isOpSupported = (operation: string): boolean => {
              return this.isOperationSupported(
                addonId,
                dsCap.capabilityId,
                operation,
              )
            }
            const rawInstance = item.createInstance({
              ...context,
              oauth: context.oauth ?? oauth,
            })
            return {
              tasksProvider: new GuardedTaskProvider(
                rawInstance.tasksProvider,
                binding,
                capturedGen,
                isOpSupported,
                isScopeValid,
              ),
              timeEntriesProvider: new GuardedTimeEntryProvider(
                rawInstance.timeEntriesProvider,
                binding,
                capturedGen,
                isOpSupported,
                isScopeValid,
              ),
              membersProvider: new GuardedMemberProvider(
                rawInstance.membersProvider,
                binding,
                capturedGen,
                isOpSupported,
                isScopeValid,
              ),
              metadataProvider: new GuardedMetadataProvider(
                rawInstance.metadataProvider,
                binding,
                capturedGen,
                isOpSupported,
                isScopeValid,
              ),
            }
          },
        }
        if (item.getStaticMappingFields !== undefined) {
          const rawGetStaticMappingFields =
            item.getStaticMappingFields.bind(item)
          itemWithId.getStaticMappingFields = () => {
            if (
              !this.isOperationSupported(
                addonId,
                dsCap.capabilityId,
                'getMappingFields',
              )
            ) {
              return []
            }
            return rawGetStaticMappingFields()
          }
        }
        if (item.getMappingFields !== undefined) {
          const rawGetMappingFields = item.getMappingFields.bind(item)
          itemWithId.getMappingFields = async (scope: {
            workspaceId: string
            connectionInstanceId: string
          }) => {
            if (
              !scope ||
              !isNonEmptyString(scope.workspaceId) ||
              !isNonEmptyString(scope.connectionInstanceId)
            ) {
              return Either.failure(
                AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
              )
            }
            if (
              !this.isOperationSupported(
                addonId,
                dsCap.capabilityId,
                'getMappingFields',
              )
            ) {
              return Either.failure(
                AppError.Http(403, 'OPERATION_NOT_SUPPORTED'),
              )
            }
            const binding = lifetime.findScopedBinding(
              scope.workspaceId,
              scope.connectionInstanceId,
              dsCap.capabilityId,
            )
            if (binding === undefined || !binding.isActive()) {
              return Either.failure(
                AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
              )
            }
            const gen = binding.getGeneration()
            if (!binding.isCurrentGeneration(gen)) {
              return Either.failure(
                AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
              )
            }
            const res = await rawGetMappingFields(scope)
            if (!binding.isCurrentGeneration(gen)) {
              return Either.failure(
                AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
              )
            }
            return res
          }
        }
        this.dataSourceRegistry.register(itemWithId)
        this.profilesResolver.registerProfiles(
          addonId,
          item.getConnectionProfiles(),
        )
        lifetime.track(() => {
          this.dataSourceRegistry.unregister(addonId)
          this.profilesResolver.unregisterProfiles(addonId)
        })
      },
      unregister: (id: string) => {
        if (lifetime.isActive() && id === addonId) {
          this.dataSourceRegistry.unregister(addonId)
          this.profilesResolver.unregisterProfiles(addonId)
        }
      },
      getItems: () => this.dataSourceRegistry.getItems(),
    }

    const connectionContributions: IAddonConnectionsContributionAPI = {
      registerProfiles: (profiles) => {
        if (!lifetime.isActive()) return
        this.profilesResolver.registerProfiles(addonId, profiles)
        lifetime.track(() => {
          this.profilesResolver.unregisterProfiles(addonId)
        })
      },
      unregisterProfiles: () => {
        if (lifetime.isActive()) {
          this.profilesResolver.unregisterProfiles(addonId)
        }
      },
      registerAuthenticator: (authenticator) => {
        if (!lifetime.isActive()) return
        this.authenticatorRegistry.register(addonId, authenticator)
        lifetime.track(() => {
          this.authenticatorRegistry.unregister(
            addonId,
            authenticator.authProfileId,
          )
        })
      },
      unregisterAuthenticator: (authProfileId: string) => {
        if (lifetime.isActive()) {
          this.authenticatorRegistry.unregister(addonId, authProfileId)
        }
      },
    }

    const scopedCommands: IAddonCommandsAPI = {
      register: (id: string, handler: CommandHandler) => {
        if (!lifetime.isActive()) return
        this.commandRegistry.registerOwned(addonId, id, handler)
        lifetime.track(() => this.commandRegistry.unregisterOwned(addonId, id))
      },
      unregister: (id: string) => {
        if (lifetime.isActive())
          this.commandRegistry.unregisterOwned(addonId, id)
      },
      execute: (id: string, ...args: CommandArgument[]) => {
        if (id === 'theme:set') {
          const [themeId] = args
          if (isString(themeId) && themeId.length > 0)
            return this.commandRegistry.execute(id, `${addonId}:${themeId}`)
          return this.commandRegistry.execute(id, ...args)
        }
        return this.commandRegistry.execute(`${addonId}:${id}`, ...args)
      },
      has: (id: string) => {
        if (id === 'theme:set') return this.commandRegistry.has(id)
        return this.commandRegistry.has(`${addonId}:${id}`)
      },
    }

    return {
      core: {
        runtime: lifetime.availability(addonCore.runtime),
        workspaces: addonCore.workspaces,
        connections: addonCore.connections,
        tasks: addonCore.tasks,
        metadata: addonCore.metadata,
        timer,
        timeEntries,
      },
      contributions: {
        commands: scopedCommands,
        menus: menusRegistry,
        settings: settingsRegistry,
        dataSources: dataSourceRegistryProxy,
        connections: connectionContributions,
        themes: lifetime.registry(addonId, this.themesRegistry),
      },
      host: {
        events: lifetime.events(this.systemEventEmitter),
        notifications,
        vault,
        oauth,
      },
    }
  }

  public handleOAuthCallbackUrl(rawUrl: string): boolean {
    try {
      if (!rawUrl || typeof rawUrl !== 'string') {
        return false
      }

      if (!rawUrl.startsWith('mr-tick-app://')) {
        return false
      }

      let parsed: URL
      try {
        parsed = new URL(rawUrl.replace('mr-tick-app://', 'http://localhost/'))
      } catch {
        return false
      }

      if (parsed.pathname !== '/oauth/callback') {
        return false
      }

      console.log(
        '[AddonLoader] 🔗 Deep Link OAuth recebido em /oauth/callback',
      )
      const params: Record<string, string> = {}
      parsed.searchParams.forEach((val, key) => {
        params[key] = val
      })

      const state = params.state
      const code = params.code
      let error = params.error
      if (!error && params.error_description) {
        error = params.error_description
      }

      if (!state) {
        console.warn(
          '[AddonLoader] ⚠️ Callback OAuth ignorado: state ausente no Deep Link.',
        )
        return false
      }

      const req = this.pendingOAuthRequests.get(state)
      if (!req) {
        console.warn(
          `[AddonLoader] ⚠️ Callback OAuth ignorado: state "${state}" desconhecido ou expirado.`,
        )
        return false
      }

      clearTimeout(req.timeoutId)
      this.pendingOAuthRequests.delete(state)

      if (error) {
        let errorDesc = error
        if (params.error && params.error_description) {
          errorDesc = `${params.error}: ${params.error_description}`
        }
        req.reject(new Error(errorDesc))
        return true
      }

      if (code) {
        req.resolve({ code, state, ...params })
        return true
      }

      req.reject(new Error('Código de autorização não retornado.'))
      return true
    } catch (err) {
      console.error(
        '❌ [AddonLoader] Erro ao processar callback OAuth deep link:',
        err,
      )
      return false
    }
  }

  public async activateAddon(
    addonId: string,
    addonInstance: IAddon,
    manifest?: IAddonManifest,
  ): Promise<boolean> {
    if (manifest && manifest.capabilities) {
      const capResult = this.registerManifestCapabilities(
        addonId,
        manifest.capabilities,
      )
      if (capResult.isFailure()) {
        console.error(
          `[AddonLoader] Addon ${addonId} recusado por capacidade incompatível: ${capResult.failure.messageKey}`,
        )
        return false
      }
    }
    if (this.activeAddons.has(addonId)) await this.deactivateAddon(addonId)
    const context = this.createContext(addonId)
    try {
      await addonInstance.activate(context)
    } catch (error) {
      try {
        await addonInstance.deactivate()
      } catch (cleanupError) {
        console.error(
          '[AddonLoader] Partial activation cleanup failed:',
          cleanupError,
        )
      }
      await this.deactivateAddon(addonId)
      console.error('[AddonLoader] Activation failed:', error)
      return false
    }
    this.activeAddons.set(addonId, { addonId, instance: addonInstance })
    console.log(`✅ [AddonLoader] Addon ativado com sucesso: ${addonId}`)
    if (this.activeWorkspaceId) {
      this.systemEventEmitter.emit('workspace:changed', {
        previousWorkspaceId: this.activeWorkspaceId,
        currentWorkspaceId: this.activeWorkspaceId,
      })
    }
    return true
  }

  public async deactivateAddon(addonId: string): Promise<void> {
    this.timerControlLock.release(addonId)
    this.oauthAttemptCoordinator.invalidateForAddon(addonId)
    this.addonCapabilities.delete(addonId)
    for (const key of Array.from(this.disabledCapabilities)) {
      if (key.startsWith(`${addonId}:`)) {
        this.disabledCapabilities.delete(key)
      }
    }
    for (const [state, req] of this.pendingOAuthRequests.entries()) {
      if (req.addonId === addonId) {
        clearTimeout(req.timeoutId)
        this.pendingOAuthRequests.delete(state)
        req.reject(
          new Error(`Addon '${addonId}' desativado durante a autenticação.`),
        )
      }
    }
    const item = this.activeAddons.get(addonId)
    try {
      if (item !== undefined) await item.instance.deactivate()
    } finally {
      this.timerControlLock.release(addonId)
      this.lifetimes.get(addonId)?.dispose()
      this.lifetimes.delete(addonId)
      this.activeAddons.delete(addonId)
      this.addonSettingsSchemas.delete(addonId)
    }
  }

  public hasActiveAddon(addonId: string): boolean {
    return this.activeAddons.has(addonId)
  }

  public async loadAndActivateFromDisk(
    addonId: string,
    addonFolderPath: string,
  ): Promise<boolean> {
    if (this.hasActiveAddon(addonId)) return true
    const inFlight = this.loadingAddons.get(addonId)
    if (inFlight !== undefined) {
      return await inFlight
    }

    const loadPromise = this.performLoadAndActivateFromDisk(
      addonId,
      addonFolderPath,
    )
    this.loadingAddons.set(addonId, loadPromise)
    try {
      return await loadPromise
    } finally {
      this.loadingAddons.delete(addonId)
    }
  }

  private async performLoadAndActivateFromDisk(
    addonId: string,
    addonFolderPath: string,
  ): Promise<boolean> {
    try {
      const authorization = await this.addonAccessService.authorizeDirectory(
        addonId,
        addonFolderPath,
        'load',
      )
      if (authorization.isFailure()) {
        if (this.hasActiveAddon(addonId)) await this.deactivateAddon(addonId)
        console.warn(
          '[AddonLoader] Pacote bloqueado:',
          addonId,
          authorization.failure.messageKey,
        )
        return false
      }
      if (this.hasActiveAddon(addonId)) return true
      const requiredApiVersion = authorization.success.requiredApiVersion

      const isPlaywrightE2E = process.env.PLAYWRIGHT_TEST === '1'

      let currentVersion = sdkPkg.version
      if (this.hostSdkVersion) {
        currentVersion = this.hostSdkVersion
      }
      if (isPlaywrightE2E) {
        currentVersion = '-1'
      }

      if (!isApiVersionCompatible(requiredApiVersion, currentVersion)) {
        let reqDisplay = 'desconhecida'
        if (requiredApiVersion) {
          reqDisplay = requiredApiVersion
        }
        console.warn(
          `⚠️ [AddonLoader] Addon "${addonId}" ignorado: requer API ${reqDisplay}, mas o aplicativo suporta a API ${currentVersion}`,
        )
        return false
      }

      const possibleEntries = [
        join(addonFolderPath, 'dist', 'index.js'),
        join(addonFolderPath, 'dist', 'index.mjs'),
        join(addonFolderPath, 'index.js'),
      ]

      let targetEntry: string | null = null
      for (const entry of possibleEntries) {
        if (existsSync(entry)) {
          targetEntry = entry
          break
        }
      }

      if (!targetEntry) {
        console.warn(
          `⚠️ [AddonLoader] Ponto de entrada JS não encontrado para o addon "${addonId}" em: ${addonFolderPath}`,
        )
        return false
      }

      const fileUrl = pathToFileURL(targetEntry).href

      let metaName: string | undefined
      let metaIconUrl: string | undefined
      let parsedCapabilities: AddonCapabilityDescriptor[] | undefined
      const manifestPathYaml = join(addonFolderPath, 'manifest.yaml')
      const manifestPathYml = join(addonFolderPath, 'manifest.yml')
      const manifestPathJson = join(addonFolderPath, 'manifest.json')

      try {
        if (existsSync(manifestPathYaml)) {
          const parsed = yaml.load(readFileSync(manifestPathYaml, 'utf-8'))
          if (isRecord(parsed)) {
            if (isString(parsed.name)) metaName = parsed.name
            if (isString(parsed.iconUrl)) metaIconUrl = parsed.iconUrl
            parsedCapabilities = parseDiskManifestCapabilities(parsed)
          }
        }
        if (!metaName && existsSync(manifestPathYml)) {
          const parsed = yaml.load(readFileSync(manifestPathYml, 'utf-8'))
          if (isRecord(parsed)) {
            if (isString(parsed.name)) metaName = parsed.name
            if (isString(parsed.iconUrl)) metaIconUrl = parsed.iconUrl
            parsedCapabilities = parseDiskManifestCapabilities(parsed)
          }
        }
        if (!metaName && existsSync(manifestPathJson)) {
          const parsed = yaml.load(readFileSync(manifestPathJson, 'utf-8'))
          if (isRecord(parsed)) {
            if (isString(parsed.name)) metaName = parsed.name
            if (isString(parsed.iconUrl)) metaIconUrl = parsed.iconUrl
            parsedCapabilities = parseDiskManifestCapabilities(parsed)
          }
        }
      } catch {
        // Ignora erro de leitura de manifesto
      }

      const iconPngPath = join(addonFolderPath, 'icon.png')
      if (!metaIconUrl && existsSync(iconPngPath)) {
        try {
          const iconBuffer = readFileSync(iconPngPath)
          metaIconUrl = `data:image/png;base64,${iconBuffer.toString('base64')}`
        } catch {
          // Ignora erro de leitura de ícone
        }
      }

      if (metaName || metaIconUrl) {
        this.addonMetadata.set(addonId, {
          name: metaName,
          iconUrl: metaIconUrl,
        })
      }

      let diskManifest: IAddonManifest | undefined
      if (parsedCapabilities !== undefined) {
        let manifestName = addonId
        if (metaName) {
          manifestName = metaName
        }
        diskManifest = {
          id: addonId,
          name: manifestName,
          version: '1.0.0',
          categories: [],
          author: '',
          shortDescription: '',
          description: '',
          capabilities: parsedCapabilities,
        }
      }

      const loadedModule: object = await import(fileUrl)
      let exportedCandidate: object | Function = loadedModule
      if (isRecord(loadedModule) && hasProperty(loadedModule, 'default')) {
        const defaultExport = loadedModule.default
        if (isRecord(defaultExport) || isFunction(defaultExport)) {
          exportedCandidate = defaultExport
        }
      }

      if (isAddonConstructor(exportedCandidate)) {
        const addonInstance = new exportedCandidate()
        return await this.activateAddon(addonId, addonInstance, diskManifest)
      }

      if (isAddonInstance(exportedCandidate)) {
        return await this.activateAddon(
          addonId,
          exportedCandidate,
          diskManifest,
        )
      }

      console.warn(
        `⚠️ [AddonLoader] Exportação padrão inválida para o addon "${addonId}" em: ${targetEntry}`,
      )
      return false
    } catch (err) {
      let message = String(err)
      if (err instanceof Error) {
        message = err.message
      }
      console.error(
        `❌ [AddonLoader] Erro ao carregar addon "${addonId}" do disco (${addonFolderPath}):`,
        message,
      )
      return false
    }
  }

  public async loadInstalledAddons(
    addons: Array<{ id: string; path: string }>,
  ): Promise<void> {
    for (const addon of addons) {
      if (!addon.id || !addon.path) continue
      try {
        await this.loadAndActivateFromDisk(addon.id, addon.path)
      } catch (err) {
        let errMessage = String(err)
        if (err instanceof Error) {
          errMessage = err.message
        }
        console.error(
          `❌ [AddonLoader] Falha ao inicializar addon instalado "${addon.id}":`,
          errMessage,
        )
      }
    }
  }

  public getActiveWorkspaceId(): string | null {
    return this.activeWorkspaceId
  }

  public async getSettingsSchema(
    addonId: string,
    scope?: AddonVaultScope,
  ): Promise<AddonSettingsSchema> {
    const item = this.activeAddons.get(addonId)
    if (!item?.instance) return []

    let schema: AddonSettingsSchema = []

    const resolvedScope = scope
    let resolvedWorkspaceId: string | undefined = undefined
    if (resolvedScope?.kind === 'workspace') {
      resolvedWorkspaceId = resolvedScope.workspaceId
    }

    const provider = this.addonSettingsSchemas.get(addonId)
    if (Array.isArray(provider)) {
      schema = provider
    }
    if (provider && !Array.isArray(provider)) {
      schema = await provider({
        scope: resolvedScope,
        workspaceId: resolvedWorkspaceId,
      })
    }

    const dataSources = this.dataSourceRegistry.getItems()
    const isDataSource = dataSources.some((d) => d.id === addonId)

    if (isDataSource) {
      const instancesTab: AddonSettingsTab = {
        id: 'instances',
        label: 'Instâncias',
        fields: [
          {
            id: 'connection-manager',
            type: 'datasource-instances',
            label: 'Instâncias Conectadas',
          },
        ],
      }

      if (!Array.isArray(schema)) {
        return [instancesTab]
      }

      if (isFlatSettingsFieldList(schema)) {
        return [
          instancesTab,
          {
            id: 'general',
            label: 'Geral',
            fields: schema,
          },
        ]
      }

      if (!isFlatSettingsFieldList(schema)) {
        const filteredTabs = schema.filter(
          (tab) => !this.disabledCapabilities.has(`${addonId}:${tab.id}`),
        )
        return [instancesTab, ...filteredTabs]
      }

      return [instancesTab, ...schema]
    }

    if (Array.isArray(schema) && !isFlatSettingsFieldList(schema)) {
      return schema.filter(
        (tab) => !this.disabledCapabilities.has(`${addonId}:${tab.id}`),
      )
    }

    return schema
  }

  private validateAddonSettingsScope(
    addonId: string,
    scope: AddonVaultScope,
  ): Either<AppError, void> {
    if (scope.kind === 'capability') {
      return Either.success()
    }
    const caps = this.addonCapabilities.get(addonId)
    if (!caps || caps.length === 0) {
      return Either.success()
    }
    const enabledWithSettingsScope = caps.filter(
      (cap) =>
        !this.disabledCapabilities.has(`${addonId}:${cap.capabilityId}`) &&
        cap.settingsSchemaScope !== undefined,
    )
    if (enabledWithSettingsScope.length === 0) {
      return Either.success()
    }
    const matchesDeclaredScope = enabledWithSettingsScope.some(
      (cap) => cap.settingsSchemaScope === scope.kind,
    )
    if (!matchesDeclaredScope) {
      return Either.failure(
        AppError.ValidationError('CAPABILITY_SETTINGS_SCOPE_MISMATCH'),
      )
    }
    return Either.success()
  }

  public async getAddonSettings(
    addonId: string,
    scope: AddonVaultScope,
  ): Promise<Either<AppError, AddonSettingsView>> {
    const scopeValidation = this.validateAddonSettingsScope(addonId, scope)
    if (scopeValidation.isFailure()) {
      return scopeValidation.forwardFailure()
    }
    const schema = await this.getSettingsSchema(addonId, scope)
    return this.getAddonSettingsService.execute({ addonId, scope, schema })
  }

  private resolveSettingsScopeBinding(
    addonId: string,
    scope: AddonVaultScope,
  ): AddonBindingLifetime | undefined {
    const lifetime = this.lifetimes.get(addonId)
    if (!lifetime) return undefined
    if (scope.kind === 'capability') {
      return lifetime.binding(
        scope.workspaceId,
        scope.connectionInstanceId,
        scope.capabilityId,
      )
    }
    if (scope.kind === 'connection') {
      return lifetime.binding(scope.workspaceId, scope.connectionInstanceId)
    }
    if (scope.kind === 'workspace') {
      return lifetime.getBinding(`workspace:${scope.workspaceId}`)
    }
    return lifetime.getBinding('addon')
  }

  public async saveAddonSettings(
    addonId: string,
    scope: AddonVaultScope,
    expectedRevision: number,
    settings: AddonSettingsValues,
    credentials?: Record<string, string | null>,
  ): Promise<Either<AppError, AddonSettingsView>> {
    const scopeValidation = this.validateAddonSettingsScope(addonId, scope)
    if (scopeValidation.isFailure()) {
      return scopeValidation.forwardFailure()
    }
    const schema = await this.getSettingsSchema(addonId, scope)
    const result = await this.saveAddonSettingsService.execute({
      addonId,
      scope,
      expectedRevision,
      schema,
      patch: settings,
      credentials,
    })

    let persistedRevision: number | undefined
    let persistedValues: AddonSettingsValues | undefined

    if (result.isSuccess()) {
      persistedRevision = result.success.revision
      persistedValues = result.success.values
    }
    if (
      result.isFailure() &&
      result.failure.statusCode === 207 &&
      result.failure.messageKey === 'ADDON_CREDENTIAL_PARTIAL_FAILURE'
    ) {
      const snapshotRes = await this.vaultFor(addonId).getSettings(scope)
      if (snapshotRes.isSuccess()) {
        persistedRevision = snapshotRes.success.revision
        persistedValues = snapshotRes.success.values
      }
    }

    if (persistedRevision === undefined || persistedValues === undefined) {
      return result
    }

    const revKey = this.buildSettingsRevisionKey(addonId, scope)
    const prevStartedRev = this.latestStartedSettingsRevisions.get(revKey)
    if (prevStartedRev !== undefined && persistedRevision <= prevStartedRev) {
      return result
    }
    this.latestStartedSettingsRevisions.set(revKey, persistedRevision)

    const binding = this.resolveSettingsScopeBinding(addonId, scope)
    const applyHandler = this.addonSettingsApplyHandlers.get(addonId)

    if (applyHandler !== undefined && binding !== undefined) {
      const capturedGen = binding.startNextGeneration()
      const applyResult = await applyHandler({
        scope,
        revision: persistedRevision,
        values: persistedValues,
        events: binding.eventsForGeneration(
          this.systemEventEmitter,
          capturedGen,
        ),
        track: (cleanup) => binding.trackForGeneration(capturedGen, cleanup),
      })

      const latestStartedAfterAwait =
        this.latestStartedSettingsRevisions.get(revKey)
      const currentAppliedAfterAwait = this.appliedSettingsRevisions.get(revKey)
      const isSuperseded =
        (latestStartedAfterAwait !== undefined &&
          latestStartedAfterAwait > persistedRevision) ||
        (currentAppliedAfterAwait !== undefined &&
          currentAppliedAfterAwait >= persistedRevision)

      if (isSuperseded) {
        if (result.isFailure()) {
          return result
        }
        if (applyResult.isFailure()) {
          return applyResult.forwardFailure()
        }
        return result
      }

      if (!binding.isCurrentGeneration(capturedGen)) {
        binding.stopIfGeneration(capturedGen)
        if (result.isFailure()) {
          return result
        }
        return Either.failure(
          AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
        )
      }

      if (applyResult.isFailure()) {
        binding.stopIfGeneration(capturedGen)
        if (result.isFailure()) {
          return result
        }
        return applyResult.forwardFailure()
      }
    }

    const latestApplied = this.appliedSettingsRevisions.get(revKey)
    if (latestApplied === undefined || persistedRevision > latestApplied) {
      this.appliedSettingsRevisions.set(revKey, persistedRevision)
      this.systemEventEmitter.emit('addon:settings:saved', {
        addonId,
        scope,
        revision: persistedRevision,
        values: persistedValues,
      })
    }

    return result
  }

  public async executeAction(
    addonId: string,
    actionId: string,
    payload?: Record<string, string | number | boolean>,
    scope?: AddonVaultScope,
    workspaceId?: string,
  ): Promise<AddonActionResponse> {
    const item = this.activeAddons.get(addonId)
    if (!item) {
      return { isSuccess: false, error: 'ADDON_NOT_ACTIVE' }
    }
    const targetCommandId = `${addonId}:${actionId}`

    if (this.commandRegistry.has(targetCommandId)) {
      let commandPayload: Record<string, string | number | boolean> = {}
      if (payload) {
        commandPayload = { ...payload }
      }
      const effectiveWorkspaceId =
        workspaceId ||
        (scope?.kind === 'workspace' ? scope.workspaceId : undefined)

      if (effectiveWorkspaceId && !commandPayload.workspaceId) {
        commandPayload.workspaceId = effectiveWorkspaceId
      }
      const result = await this.commandRegistry.execute(
        targetCommandId,
        commandPayload,
      )
      if (isRecord(result) && isBoolean(result.isSuccess)) {
        let display: AddonActionResponse['display']
        if (isRecord(result.display)) {
          let title: string | undefined
          if (isString(result.display.title)) {
            title = result.display.title
          }
          let message: string | undefined
          if (isString(result.display.message)) {
            message = result.display.message
          }
          let avatarUrl: string | undefined
          if (isString(result.display.avatarUrl)) {
            avatarUrl = result.display.avatarUrl
          }
          let data: Record<string, string> | undefined
          if (isRecord(result.display.data)) {
            data = extractStringMap(result.display.data)
          }
          display = { title, message, avatarUrl, data }
        }
        let errorText: string | undefined
        if (isString(result.error)) {
          errorText = result.error
        }
        const response: AddonActionResponse = {
          isSuccess: result.isSuccess,
          error: errorText,
          display,
        }
        return response
      }
      return { isSuccess: true }
    }

    return { isSuccess: false, error: 'ACTION_NOT_FOUND' }
  }

  public getSidebarMenus(): SidebarMenuItem[] {
    return this.sidebarRegistry.getItems()
  }

  public getTimerbarMenus(): TimerbarMenuItem[] {
    return Array.from(this.addonTimerbarItems.values())
  }

  public getDataSource(dataSourceId: string): IDataSource | undefined {
    return this.dataSourceRegistry
      .getItems()
      .find((ds) => ds.id === dataSourceId)
  }

  public getThemes(): AddonTheme[] {
    return this.themesRegistry.getItems()
  }

  public getActiveTheme(): AddonTheme | null {
    if (this.activeThemeId === null) return null
    const themes = this.themesRegistry.getItems()
    const exact = themes.find((theme) => theme.id === this.activeThemeId)
    if (exact !== undefined) return exact
    const matches: AddonTheme[] = []
    for (const addonId of this.activeAddons.keys()) {
      const candidate = themes.find(
        (theme) => theme.id === `${addonId}:${this.activeThemeId}`,
      )
      if (candidate !== undefined) matches.push(candidate)
    }
    if (matches.length === 1) return matches[0]

    const byAddon = themes.filter((theme) =>
      theme.id.startsWith(`${this.activeThemeId}:`),
    )
    if (byAddon.length === 1) return byAddon[0]

    return null
  }

  public setActiveTheme(themeId: string | null): void {
    this.activeThemeId = themeId

    try {
      const currentSettings = getSettings()
      saveSettings({
        ...currentSettings,
        activeThemeId: themeId,
      })
    } catch (err) {
      console.error('❌ [AddonLoader] Erro ao salvar tema ativo:', err)
    }

    const activeTheme = this.getActiveTheme()
    let themeDisplay = 'Padrão (Nenhum)'
    if (themeId) {
      themeDisplay = themeId
    }
    console.log(`🎨 [AddonLoader] Tema ativo alterado para: ${themeDisplay}`)
    try {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('addons:theme-changed', activeTheme)
        }
      })
    } catch (err) {
      console.error(
        '❌ [AddonLoader] Erro ao enviar IPC de theme-changed:',
        err,
      )
    }
  }

  public async executeCommand(
    commandId: string,
    ...args: CommandArgument[]
  ): Promise<CommandResult> {
    return await this.commandRegistry.execute(commandId, ...args)
  }

  private getAddonSourceInfo(addonId: string): {
    id: string
    name: string
    imageUrl?: string
  } {
    const diskMeta = this.addonMetadata.get(addonId)

    let name = addonId
    const lastSegment = addonId.split('/').pop()
    if (lastSegment) {
      name = lastSegment
    }
    if (diskMeta?.name) {
      name = diskMeta.name
    }

    let imageUrl: string | undefined = undefined
    if (diskMeta?.iconUrl) {
      imageUrl = diskMeta.iconUrl
    }

    return {
      id: addonId,
      name,
      imageUrl,
    }
  }
}

function isAddonConstructor(
  candidate: object | Function,
): candidate is new () => IAddon {
  return isFunction(candidate)
}

function isAddonInstance(candidate: object | Function): candidate is IAddon {
  if (!isRecord(candidate)) return false
  return (
    hasProperty(candidate, 'onActivate') || hasProperty(candidate, 'activate')
  )
}

function extractStringMap(data: object): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    if (isString(value)) result[key] = value
  }
  return result
}

function isValidCapabilityKind(
  val: string,
): val is AddonCapabilityDescriptor['kind'] {
  return (
    val === 'dataSource' ||
    val === 'watcher' ||
    val === 'calendar' ||
    val === 'punch' ||
    val === 'theme' ||
    val === 'custom'
  )
}

function isValidSettingsSchemaScope(
  val: string,
): val is NonNullable<AddonCapabilityDescriptor['settingsSchemaScope']> {
  return (
    val === 'workspace' ||
    val === 'connection' ||
    val === 'capability' ||
    val === 'addon'
  )
}

function parseDiskManifestCapabilities(
  parsed: object,
): AddonCapabilityDescriptor[] | undefined {
  if (
    !hasProperty(parsed, 'capabilities') ||
    !Array.isArray(parsed.capabilities)
  )
    return undefined
  const descriptors: AddonCapabilityDescriptor[] = []
  for (const rawCap of parsed.capabilities) {
    if (!isRecord(rawCap)) continue
    if (!isNonEmptyString(rawCap.capabilityId)) continue
    if (!isString(rawCap.kind) || !isValidCapabilityKind(rawCap.kind)) continue
    if (!isNonEmptyString(rawCap.contractVersion)) continue
    const required = isBoolean(rawCap.required) ? rawCap.required : true

    let executionPolicy: AddonCapabilityDescriptor['executionPolicy'] = {
      kind: 'independent',
    }
    if (isRecord(rawCap.executionPolicy)) {
      if (rawCap.executionPolicy.kind === 'activeWorkspace') {
        const exclusivity =
          rawCap.executionPolicy.exclusivity === 'exclusiveSocket'
            ? 'exclusiveSocket'
            : rawCap.executionPolicy.exclusivity === 'none'
              ? 'none'
              : undefined
        executionPolicy = {
          kind: 'activeWorkspace',
          exclusivity,
        }
      }
    }

    let authRequirement: AddonCapabilityDescriptor['authRequirement'] = {
      kind: 'none',
    }
    if (
      isRecord(rawCap.authRequirement) &&
      rawCap.authRequirement.kind === 'required' &&
      isNonEmptyString(rawCap.authRequirement.connectionProfileId) &&
      isNonEmptyString(rawCap.authRequirement.authorizationRole)
    ) {
      authRequirement = {
        kind: 'required',
        connectionProfileId: rawCap.authRequirement.connectionProfileId,
        authorizationRole: rawCap.authRequirement.authorizationRole,
      }
    }

    const supportedOperations: string[] = []
    if (Array.isArray(rawCap.supportedOperations)) {
      for (const op of rawCap.supportedOperations) {
        if (isNonEmptyString(op)) {
          supportedOperations.push(op)
        }
      }
    }

    let settingsSchemaScope: AddonCapabilityDescriptor['settingsSchemaScope']
    if (
      isString(rawCap.settingsSchemaScope) &&
      isValidSettingsSchemaScope(rawCap.settingsSchemaScope)
    ) {
      settingsSchemaScope = rawCap.settingsSchemaScope
    }

    descriptors.push({
      capabilityId: rawCap.capabilityId,
      kind: rawCap.kind,
      contractVersion: rawCap.contractVersion,
      required,
      executionPolicy,
      authRequirement,
      supportedOperations,
      settingsSchemaScope,
    })
  }
  return descriptors
}
