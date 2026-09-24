import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { ICredentialsStorage, TimeEntryRecordDTO } from '@mr-tick/application'
import {
  AddonActionResponse,
  AddonContext,
  AddonSettingsField,
  AddonSettingsSchema,
  AddonSettingsSchemaProvider,
  AddonSettingsTab,
  AddonTheme,
  CommandArgument,
  CommandHandler,
  CommandResult,
  generateOAuthState,
  generatePKCE,
  IAddon,
  IAddonEventsAPI,
  IAddonStorage,
  ICommandRegistry,
  IDataSource,
  IDataSourceRegistry,
  IMenusRegistry,
  INotificationService,
  IOAuthAPI,
  IRegistry,
  ISettingsRegistry,
  ITimeEntriesAPI,
  ITimerAPI,
  OAuthAuthorizeOptions,
  OAuthResult,
  SidebarMenuItem,
  TimerbarMenuItem,
} from '@mr-tick/sdk'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { ISystemEvents } from '@mr-tick/shared/transport'
import { BrowserWindow, shell } from 'electron'

import { getSettings, saveSettings } from '@/main/settings'

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

export class CommandRegistry implements ICommandRegistry {
  private handlers = new Map<string, CommandHandler>()

  register(id: string, handler: CommandHandler): void {
    this.handlers.set(id, handler)
  }

  unregister(id: string): void {
    this.handlers.delete(id)
  }

  async execute(
    id: string,
    ...args: CommandArgument[]
  ): Promise<CommandResult> {
    const handler = this.handlers.get(id)
    if (!handler) {
      throw new Error(`Comando '${id}' não encontrado.`)
    }
    return await handler(...args)
  }

  getItems(): Array<{ id: string }> {
    return Array.from(this.handlers.keys()).map((id) => ({ id }))
  }

  has(id: string): boolean {
    return this.handlers.has(id)
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

export class AddonLoader {
  private activeAddons = new Map<string, ActiveAddonInfo>()
  private activeTimerControllerAddonId: string | null = null
  private toastListeners: Array<(toastData: AddonToastEventData) => void> = []

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

  constructor(private credentialsStorage: ICredentialsStorage) {
    this.registerThemeCommands()
    this.restoreActiveTheme()
  }

  private registerThemeCommands(): void {
    this.commandRegistry.register('theme:set', async (themeId) => {
      const targetThemeId =
        typeof themeId === 'string' && themeId.length > 0 ? themeId : null
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
    const generatedId =
      toastId ||
      `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const toastData: AddonToastEventData = {
      action: 'show',
      type,
      message,
      title,
      toastId: generatedId,
    }
    console.log(
      `🔔 [AddonLoader] Broadcasting toast [${type}]: "${message}" (${title ?? ''})`,
    )
    this.toastListeners.forEach((listener) => listener(toastData))

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

  private activeWorkspaceId: string | null = null

  public setActiveWorkspace(workspaceId: string): void {
    if (workspaceId && workspaceId !== this.activeWorkspaceId) {
      const previousWorkspaceId = this.activeWorkspaceId
      this.activeWorkspaceId = workspaceId
      console.log(
        `[AddonLoader] 🔄 Workspace alterado de "${previousWorkspaceId || 'Nenhum'}" para "${workspaceId}"`,
      )
      this.systemEventEmitter.emit('workspace:changed', {
        previousWorkspaceId: previousWorkspaceId || undefined,
        currentWorkspaceId: workspaceId,
      })
    }
  }

  public createContext(addonId: string): AddonContext {
    const storage: IAddonStorage = {
      get: async (key: string) => {
        if (!this.activeWorkspaceId) return null
        const workspaceId = this.activeWorkspaceId
        const masterKey = `ws_${workspaceId}_config`
        const raw = await this.credentialsStorage.getToken(addonId, masterKey)
        if (!raw) return null
        try {
          const data = JSON.parse(raw)
          if (data && typeof data === 'object' && key in data) {
            return data[key]
          }
        } catch {
          // ignore
        }
        return null
      },
      set: async (key: string, value: string) => {
        if (!this.activeWorkspaceId) return
        const workspaceId = this.activeWorkspaceId
        const masterKey = `ws_${workspaceId}_config`
        let data: Record<string, string> = {}
        const raw = await this.credentialsStorage.getToken(addonId, masterKey)
        if (raw) {
          try {
            data = JSON.parse(raw) || {}
          } catch {
            data = {}
          }
        }
        data[key] = value
        await this.credentialsStorage.saveToken(
          addonId,
          masterKey,
          JSON.stringify(data),
        )
      },
      delete: async (key: string) => {
        if (!this.activeWorkspaceId) return
        const workspaceId = this.activeWorkspaceId
        const masterKey = `ws_${workspaceId}_config`
        const raw = await this.credentialsStorage.getToken(addonId, masterKey)
        if (raw) {
          try {
            const data = JSON.parse(raw) || {}
            delete data[key]
            if (Object.keys(data).length > 0) {
              await this.credentialsStorage.saveToken(
                addonId,
                masterKey,
                JSON.stringify(data),
              )
            } else {
              await this.credentialsStorage.deleteToken(addonId, masterKey)
            }
          } catch {
            await this.credentialsStorage.deleteToken(addonId, masterKey)
          }
        }
      },
    }

    const addonTimerbarRegistry: IRegistry<TimerbarMenuItem> = {
      register: (item: TimerbarMenuItem) => {
        // Restrição Estrutural: Cada addon possui no máximo 1 item na Timerbar
        const itemWithAddon = Object.assign(item, { addonId })
        this.addonTimerbarItems.set(addonId, itemWithAddon)
      },
      unregister: (id: string) => {
        this.addonTimerbarItems.delete(addonId)
      },
      getItems: () => {
        const item = this.addonTimerbarItems.get(addonId)
        return item ? [item] : []
      },
    }

    const menusRegistry: IMenusRegistry = {
      sidebar: this.sidebarRegistry,
      timerbar: addonTimerbarRegistry,
    }

    const notifications: INotificationService = {
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

    const timer: ITimerAPI = {
      getActiveEntry: async () => Either.success(null),
      requestControlLock: async () => {
        if (
          this.activeTimerControllerAddonId === null ||
          this.activeTimerControllerAddonId === addonId
        ) {
          this.activeTimerControllerAddonId = addonId
          return Either.success(true)
        }
        return Either.success(false)
      },
      releaseControlLock: async () => {
        if (this.activeTimerControllerAddonId === addonId) {
          this.activeTimerControllerAddonId = null
        }
        return Either.success(undefined)
      },
      isControlLockHeld: async () => {
        return Either.success(this.activeTimerControllerAddonId === addonId)
      },
      start: async (payload) => {
        if (
          this.activeTimerControllerAddonId &&
          this.activeTimerControllerAddonId !== addonId
        ) {
          return Either.failure(
            AppError.Unauthorized(
              `[TimerAPI] Controle exclusivo retido pelo addon ${this.activeTimerControllerAddonId}`,
            ),
          )
        }
        console.log(
          `⏱️ [TimerAPI] Iniciar timer por addon ${addonId}:`,
          payload,
        )
        return Either.success(undefined)
      },
      pause: async () => {
        if (
          this.activeTimerControllerAddonId &&
          this.activeTimerControllerAddonId !== addonId
        ) {
          return Either.failure(
            AppError.Unauthorized(
              `[TimerAPI] Controle exclusivo retido pelo addon ${this.activeTimerControllerAddonId}`,
            ),
          )
        }
        console.log(`⏱️ [TimerAPI] Pausar timer por addon ${addonId}`)
        return Either.success(undefined)
      },
      resume: async () => {
        if (
          this.activeTimerControllerAddonId &&
          this.activeTimerControllerAddonId !== addonId
        ) {
          return Either.failure(
            AppError.Unauthorized(
              `[TimerAPI] Controle exclusivo retido pelo addon ${this.activeTimerControllerAddonId}`,
            ),
          )
        }
        console.log(`⏱️ [TimerAPI] Retomar timer por addon ${addonId}`)
        return Either.success(undefined)
      },
      stop: async () => {
        if (
          this.activeTimerControllerAddonId &&
          this.activeTimerControllerAddonId !== addonId
        ) {
          return Either.failure(
            AppError.Unauthorized(
              `[TimerAPI] Controle exclusivo retido pelo addon ${this.activeTimerControllerAddonId}`,
            ),
          )
        }
        console.log(`⏱️ [TimerAPI] Parar timer por addon ${addonId}`)
        return Either.success(undefined)
      },
      logTime: async (payload) => {
        if (payload.timeSpentSeconds <= 0) {
          return Either.failure(
            AppError.ValidationError(
              '[TimerAPI] Apontamento não pode ser menor ou igual a zero.',
            ),
          )
        }
        if (payload.timeSpentSeconds > 86400) {
          return Either.failure(
            AppError.ValidationError(
              '[TimerAPI] Apontamento não pode exceder 24h (86400s).',
            ),
          )
        }
        console.log(`⏱️ [TimerAPI] Lançar horas por addon ${addonId}:`, payload)
        return Either.success(undefined)
      },
    }

    const timeEntries: ITimeEntriesAPI = {
      list: async () => Either.success([]),
      getById: async () => Either.success(null),
      create: async (payload) => {
        if (payload.timeSpentSeconds <= 0) {
          return Either.failure(
            AppError.ValidationError('[TimeEntriesAPI] Duração inválida.'),
          )
        }
        const record: TimeEntryRecordDTO = {
          id: `entry_${Date.now()}`,
          taskId: payload.taskId,
          comments: payload.comments,
          timeSpentSeconds: payload.timeSpentSeconds,
          pauseSeconds: payload.pauseSeconds ?? 0,
          status: payload.status ?? 'finished',
          source: payload.source ?? 'addon',
          createdAt: new Date().toISOString(),
        }
        return Either.success(record)
      },
      createSuggestion: async (payload) => {
        const now = new Date()
        const nowIso = now.toISOString()

        const endDate = payload.endDate || nowIso
        let startDate = payload.startDate

        if (!startDate) {
          const seconds = payload.timeSpentSeconds || 0
          startDate = new Date(
            new Date(endDate).getTime() - seconds * 1000,
          ).toISOString()
        }

        let timeSpentSeconds = payload.timeSpentSeconds
        if (!timeSpentSeconds && startDate && endDate) {
          timeSpentSeconds = Math.max(
            0,
            Math.round(
              (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                1000,
            ),
          )
        }

        if (timeSpentSeconds <= 0) {
          return Either.failure(
            AppError.ValidationError('[TimeEntriesAPI] Duração inválida.'),
          )
        }

        const addonSource = this.getAddonSourceInfo(addonId)

        console.log(
          `🤖 [TimeEntriesAPI] Sugestão de apontamento criada por addon ${addonId}:`,
          payload,
        )
        const item: TimeEntryRecordDTO = {
          id: `sug_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          taskId: payload.taskId,
          comments: payload.comments,
          startDate,
          endDate,
          timeSpentSeconds,
          pauseSeconds: payload.pauseSeconds ?? 0,
          status: 'suggestion',
          source: payload.source ?? 'ai_suggestion',
          addonSource,
          createdAt: nowIso,
        }

        try {
          const windows = BrowserWindow.getAllWindows()
          windows.forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send('addons:suggestion-created', item)
            }
          })
        } catch (err) {
          console.error('❌ [AddonLoader] Erro ao enviar IPC de sugestão:', err)
        }

        return Either.success(item)
      },
      acceptSuggestion: async (id) => {
        console.log(`✅ [TimeEntriesAPI] Sugestão aceita: ${id}`)
        const record: TimeEntryRecordDTO = {
          id,
          timeSpentSeconds: 3600,
          pauseSeconds: 0,
          status: 'finished',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        return Either.success(record)
      },
      dismissSuggestion: async (id) => {
        console.log(`🗑️ [TimeEntriesAPI] Sugestão descartada: ${id}`)
        return Either.success(true)
      },
      update: async (id, payload) => {
        if (payload.pauseSeconds !== undefined && payload.pauseSeconds < 0) {
          return Either.failure(
            AppError.ValidationError(
              '[TimeEntriesAPI] Tempo de pausa não pode ser negativo.',
            ),
          )
        }
        const record: TimeEntryRecordDTO = {
          id,
          timeSpentSeconds: payload.timeSpentSeconds ?? 3600,
          pauseSeconds: payload.pauseSeconds ?? 0,
          status: payload.status ?? 'finished',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        return Either.success(record)
      },
      delete: async () => Either.success(true),
    }

    const oauth: IOAuthAPI = {
      generatePKCE: () => generatePKCE(),
      generateState: (prefix?: string) => generateOAuthState(prefix || addonId),
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

            const state = options.state ?? generateOAuthState(addonId)
            const existingStateInUrl = parsedUrl.searchParams.get('state')

            if (existingStateInUrl && existingStateInUrl !== state) {
              return reject(
                new Error(
                  'Inconsistência de state: o state da authUrl não corresponde ao state esperado.',
                ),
              )
            }

            parsedUrl.searchParams.set('state', state)

            const timeoutMs =
              options.timeoutMs && options.timeoutMs > 0
                ? options.timeoutMs
                : 120000

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
              reject(
                new Error(
                  `Falha ao abrir navegador para autorização: ${err instanceof Error ? err.message : String(err)}`,
                ),
              )
            })
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        })
      },
    }

    const settingsRegistry: ISettingsRegistry = {
      register: (schema: AddonSettingsSchemaProvider) => {
        this.addonSettingsSchemas.set(addonId, schema)
      },
      getSchema: () => {
        const item = this.addonSettingsSchemas.get(addonId)
        if (typeof item === 'function') {
          return item()
        }
        return item
      },
    }

    const dataSourceRegistryProxy: IDataSourceRegistry = {
      register: (item: IDataSource) => {
        const itemWithId = Object.assign(item, { id: addonId })
        this.dataSourceRegistry.register(itemWithId)
      },
      unregister: (id: string) => {
        this.dataSourceRegistry.unregister(id)
      },
      getItems: () => this.dataSourceRegistry.getItems(),
    }

    const scopedCommands: ICommandRegistry = {
      register: (id: string, handler: CommandHandler) => {
        this.commandRegistry.register(id, handler)
        this.commandRegistry.register(`${addonId}:${id}`, handler)
      },
      unregister: (id: string) => {
        this.commandRegistry.unregister(id)
        this.commandRegistry.unregister(`${addonId}:${id}`)
      },
      execute: (id: string, ...args: CommandArgument[]) => {
        return this.commandRegistry.execute(id, ...args)
      },
      has: (id: string) => this.commandRegistry.has(id),
    }

    return {
      addonId,
      commands: scopedCommands,
      menus: menusRegistry,
      settings: settingsRegistry,
      dataSources: dataSourceRegistryProxy,
      themes: this.themesRegistry,
      events: this.systemEventEmitter,
      notifications,
      timer,
      timeEntries,
      storage,
      oauth,
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
      const error = params.error || params.error_description

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

      // Prevenção de replay: remove imediatamente e cancela timeout antes de resolver/rejeitar
      clearTimeout(req.timeoutId)
      this.pendingOAuthRequests.delete(state)

      if (error) {
        const errorDesc =
          params.error && params.error_description
            ? `${params.error}: ${params.error_description}`
            : error
        req.reject(new Error(errorDesc))
      } else if (code) {
        req.resolve({ code, state, ...params })
      } else {
        req.reject(new Error('Código de autorização não retornado.'))
      }

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
  ): Promise<void> {
    const context = this.createContext(addonId)
    await addonInstance.activate(context)
    this.activeAddons.set(addonId, { addonId, instance: addonInstance })
    console.log(`✅ [AddonLoader] Addon ativado com sucesso: ${addonId}`)
  }

  public async deactivateAddon(addonId: string): Promise<void> {
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
    if (item) {
      await item.instance.deactivate()
    }
    this.activeAddons.delete(addonId)
    this.addonSettingsSchemas.delete(addonId)
  }

  public hasActiveAddon(addonId: string): boolean {
    return this.activeAddons.has(addonId)
  }

  public async loadAndActivateFromDisk(
    addonId: string,
    addonFolderPath: string,
  ): Promise<boolean> {
    try {
      if (this.hasActiveAddon(addonId)) {
        return true
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
      const module = await import(fileUrl)
      const AddonClass = module.default || module

      if (typeof AddonClass === 'function') {
        const addonInstance: IAddon = new AddonClass()
        await this.activateAddon(addonId, addonInstance)
        return true
      }

      if (
        typeof AddonClass === 'object' &&
        AddonClass !== null &&
        isAddonInstance(AddonClass)
      ) {
        await this.activateAddon(addonId, AddonClass)
        return true
      }

      console.warn(
        `⚠️ [AddonLoader] Exportação padrão inválida para o addon "${addonId}" em: ${targetEntry}`,
      )
      return false
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
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
      } catch (err: any) {
        console.error(
          `❌ [AddonLoader] Falha ao inicializar addon instalado "${addon.id}":`,
          err?.message || err,
        )
      }
    }
  }

  public async getSettingsSchema(
    addonId: string,
  ): Promise<AddonSettingsSchema> {
    const item = this.activeAddons.get(addonId)
    if (!item?.instance) return []

    let schema: AddonSettingsSchema = []

    const provider = this.addonSettingsSchemas.get(addonId)
    if (typeof provider === 'function') {
      schema = await provider()
    } else if (provider) {
      schema = provider
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

      if (Array.isArray(schema)) {
        if (
          schema.length > 0 &&
          !('groups' in schema[0]) &&
          !('fields' in schema[0])
        ) {
          // Schema is a flat array of fields. Convert to tabs.
          const fields = schema as AddonSettingsField[]
          schema = [
            instancesTab,
            {
              id: 'general',
              label: 'Geral',
              fields,
            },
          ]
        } else {
          // Schema is already tabs (or empty)
          const tabs = schema as AddonSettingsTab[]
          schema = [instancesTab, ...tabs]
        }
      } else {
        schema = [instancesTab]
      }
    }

    return schema
  }

  public async getAddonSettings(
    addonId: string,
  ): Promise<Record<string, string | number | boolean | null>> {
    if (!this.activeWorkspaceId) return {}
    const workspaceId = this.activeWorkspaceId
    const masterKey = `ws_${workspaceId}_config`
    const raw = await this.credentialsStorage.getToken(addonId, masterKey)
    if (!raw) return {}
    return parseSettingsRecord(raw)
  }

  public async saveAddonSettings(
    addonId: string,
    settings: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    if (!this.activeWorkspaceId) return
    const workspaceId = this.activeWorkspaceId
    const masterKey = `ws_${workspaceId}_config`
    let data: Record<string, string | number | boolean | null> = {}
    const raw = await this.credentialsStorage.getToken(addonId, masterKey)
    if (raw) {
      data = parseSettingsRecord(raw)
    }
    Object.assign(data, settings)
    await this.credentialsStorage.saveToken(
      addonId,
      masterKey,
      JSON.stringify(data),
    )
  }

  public async executeAction(
    addonId: string,
    actionId: string,
    payload?: Record<string, string | number | boolean>,
  ): Promise<AddonActionResponse> {
    const item = this.activeAddons.get(addonId)
    if (!item) {
      return { isSuccess: false, error: 'ADDON_NOT_ACTIVE' }
    }
    if (payload && typeof payload === 'object' && 'workspaceId' in payload) {
      const wsId = payload.workspaceId
      if (typeof wsId === 'string') {
        this.setActiveWorkspace(wsId)
      }
    }

    const scopedCommandId = `${addonId}:${actionId}`
    const targetCommandId = this.commandRegistry.has(scopedCommandId)
      ? scopedCommandId
      : actionId

    if (this.commandRegistry.has(targetCommandId)) {
      const result = await this.commandRegistry.execute(
        targetCommandId,
        payload ?? {},
      )
      if (
        typeof result === 'object' &&
        result !== null &&
        'isSuccess' in result &&
        typeof result.isSuccess === 'boolean'
      ) {
        const response: AddonActionResponse = {
          isSuccess: result.isSuccess,
          error:
            'error' in result && typeof result.error === 'string'
              ? result.error
              : undefined,
          display:
            'display' in result &&
            typeof result.display === 'object' &&
            result.display !== null
              ? {
                  title:
                    'title' in result.display &&
                    typeof result.display.title === 'string'
                      ? result.display.title
                      : undefined,
                  message:
                    'message' in result.display &&
                    typeof result.display.message === 'string'
                      ? result.display.message
                      : undefined,
                  avatarUrl:
                    'avatarUrl' in result.display &&
                    typeof result.display.avatarUrl === 'string'
                      ? result.display.avatarUrl
                      : undefined,
                  data:
                    'data' in result.display &&
                    typeof result.display.data === 'object' &&
                    result.display.data !== null &&
                    !Array.isArray(result.display.data)
                      ? extractStringMap(result.display.data)
                      : undefined,
                }
              : undefined,
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

  public getActiveTheme(): AddonTheme | null {
    if (!this.activeThemeId) return null
    return (
      this.themesRegistry.getItems().find((t) => t.id === this.activeThemeId) ??
      null
    )
  }

  public setActiveTheme(themeId: string | null): void {
    this.activeThemeId = themeId

    // Persiste o tema nas configurações do aplicativo
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
    console.log(
      `🎨 [AddonLoader] Tema ativo alterado para: ${themeId || 'Padrão (Nenhum)'}`,
    )
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
    const active = this.activeAddons.get(addonId)
    const meta = active?.instance?.metadata

    const name = meta?.name || addonId.split('/').pop() || addonId
    const imageUrl = meta?.iconUrl

    return {
      id: addonId,
      name,
      imageUrl,
    }
  }
}

function isAddonInstance(candidate: object): candidate is IAddon {
  return 'onActivate' in candidate || 'activate' in candidate
}

function parseSettingsRecord(
  raw: string,
): Record<string, string | number | boolean | null> {
  try {
    const parsed = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed
    }
    return {}
  } catch {
    return {}
  }
}

function extractStringMap(data: object): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      result[key] = value
    }
  }
  return result
}
