import { EventEmitter } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { IAddonAccessService } from '@mr-tick/application'
import {
  IAddonReloader,
  ICoreReadAPI,
  ICredentialsVault,
  ILicensingFacade,
  ILocalRuntimeAPI,
} from '@mr-tick/application'
import {
  AddonActionResponse,
  AddonContext,
  AddonRuntimeCapabilities,
  AddonSettingsField,
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
  IAddonDataSourcesAPI,
  IAddonEventsAPI,
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
  hasProperty,
  isApiVersionCompatible,
  isBoolean,
  isFunction,
  isNonEmptyString,
  isRecord,
  isString,
} from '@mr-tick/shared/helpers'
import { ISystemEvents } from '@mr-tick/shared/transport'
import { BrowserWindow, Notification, shell } from 'electron'
import yaml from 'js-yaml'

import { getSettings, saveSettings } from '@/main/settings'

import sdkPkg from '../../../../sdk/package.json'
import { AddonLifetime } from './AddonLifetime'
import { AddonScopedVault } from './AddonScopedVault'

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

  constructor(
    private credentialsVault: ICredentialsVault,
    private readonly localRuntime: ILocalRuntimeAPI,
    private readonly hostSdkVersion: string,
    private readonly core: ICoreReadAPI,
    private readonly addonAccessService: IAddonAccessService,
  ) {
    this.registerThemeCommands()
    this.restoreActiveTheme()
  }

  public setLicensingFacade(licensingFacade: ILicensingFacade): void {
    this.licensingFacade = licensingFacade
  }

  public getHostSdkVersion(): string {
    return this.hostSdkVersion
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

  private readonly addonVaults = new Map<string, AddonScopedVault>()
  private readonly lifetimes = new Map<string, AddonLifetime>()

  private vaultFor(addonId: string): AddonScopedVault {
    const existing = this.addonVaults.get(addonId)
    if (existing !== undefined) return existing
    const vault = new AddonScopedVault(addonId, this.credentialsVault)
    this.addonVaults.set(addonId, vault)
    return vault
  }

  private activeWorkspaceId: string | null = null

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
      register: (schema: AddonSettingsSchemaProvider) => {
        if (!lifetime.isActive()) return
        this.addonSettingsSchemas.set(addonId, schema)
        lifetime.track(() => this.addonSettingsSchemas.delete(addonId))
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
        const itemWithId: IDataSource & { id: string } = {
          id: addonId,
          getConnectionSchema: () => item.getConnectionSchema(),
          createInstance: (context) =>
            item.createInstance({
              ...context,
              oauth: context.oauth ?? oauth,
            }),
        }
        if (item.getMappingFields !== undefined)
          itemWithId.getMappingFields = item.getMappingFields.bind(item)
        this.dataSourceRegistry.register(itemWithId)
        lifetime.track(() => this.dataSourceRegistry.unregister(addonId))
      },
      unregister: (id: string) => {
        if (lifetime.isActive() && id === addonId)
          this.dataSourceRegistry.unregister(addonId)
      },
      getItems: () => this.dataSourceRegistry.getItems(),
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
        runtime: lifetime.availability(this.core.runtime),
        workspaces: this.core.workspaces,
        connections: this.core.connections,
        tasks: this.core.tasks,
        metadata: this.core.metadata,
        timer,
        timeEntries,
      },
      contributions: {
        commands: scopedCommands,
        menus: menusRegistry,
        settings: settingsRegistry,
        dataSources: dataSourceRegistryProxy,
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
  ): Promise<boolean> {
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
      const manifestPathYaml = join(addonFolderPath, 'manifest.yaml')
      const manifestPathYml = join(addonFolderPath, 'manifest.yml')
      const manifestPathJson = join(addonFolderPath, 'manifest.json')

      try {
        if (existsSync(manifestPathYaml)) {
          const parsed = yaml.load(readFileSync(manifestPathYaml, 'utf-8'))
          if (isRecord(parsed)) {
            if (isString(parsed.name)) metaName = parsed.name
            if (isString(parsed.iconUrl)) metaIconUrl = parsed.iconUrl
          }
        }
        if (!metaName && existsSync(manifestPathYml)) {
          const parsed = yaml.load(readFileSync(manifestPathYml, 'utf-8'))
          if (isRecord(parsed)) {
            if (isString(parsed.name)) metaName = parsed.name
            if (isString(parsed.iconUrl)) metaIconUrl = parsed.iconUrl
          }
        }
        if (!metaName && existsSync(manifestPathJson)) {
          const raw: unknown = JSON.parse(
            readFileSync(manifestPathJson, 'utf-8'),
          )
          if (isRecord(raw)) {
            if (isString(raw.name)) metaName = raw.name
            if (isString(raw.iconUrl)) metaIconUrl = raw.iconUrl
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
        return await this.activateAddon(addonId, addonInstance)
      }

      if (isAddonInstance(exportedCandidate)) {
        return await this.activateAddon(addonId, exportedCandidate)
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

    let resolvedScope = scope
    if (!resolvedScope && this.activeWorkspaceId) {
      resolvedScope = { kind: 'workspace', workspaceId: this.activeWorkspaceId }
    }
    const resolvedWorkspaceId =
      resolvedScope?.kind === 'workspace'
        ? resolvedScope.workspaceId
        : this.activeWorkspaceId || undefined

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

      return [instancesTab, ...schema]
    }

    return schema
  }

  public getAddonSettings(addonId: string, scope: AddonVaultScope) {
    return this.vaultFor(addonId).getSettings(scope)
  }

  public saveAddonSettings(
    addonId: string,
    scope: AddonVaultScope,
    settings: AddonSettingsValues,
  ) {
    return this.vaultFor(addonId).saveSettings(scope, settings)
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
        (scope?.kind === 'workspace' ? scope.workspaceId : undefined) ||
        this.activeWorkspaceId ||
        undefined

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

function isFlatSettingsFieldList(
  schema: AddonSettingsSchema,
): schema is AddonSettingsField[] {
  const first = schema[0]
  if (!first) return false
  return hasProperty(first, 'type')
}

function extractStringMap(data: object): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    if (isString(value)) result[key] = value
  }
  return result
}
