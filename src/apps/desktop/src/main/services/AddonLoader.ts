import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { ICredentialsStorage } from '@mr-tick/application'
import {
  AddonActionResponse,
  AddonContext,
  AddonSettingsField,
  AddonSettingsSchema,
  AddonSettingsTab,
  AddonTheme,
  CommandHandler,
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
  ITimeEntriesAPI,
  ITimerAPI,
  OAuthAuthorizeOptions,
  OAuthResult,
  SidebarMenuItem,
  TimerbarMenuItem,
} from '@mr-tick/sdk'
import { IEventEmitter, ISystemEvents } from '@mr-tick/shared/transport'
import { BrowserWindow, shell } from 'electron'

import { getSettings, saveSettings } from '@/main/settings'

export class MemoryRegistry<T extends { id: string }> implements IRegistry<T> {
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

  async execute<T = void>(
    id: string,
    ...args: Array<string | number | boolean | Record<string, string>>
  ): Promise<T> {
    const handler = this.handlers.get(id)
    if (!handler) {
      throw new Error(`Comando '${id}' não encontrado.`)
    }
    return await handler(...args)
  }

  getItems(): Array<{ id: string }> {
    return Array.from(this.handlers.keys()).map((id) => ({ id }))
  }
}

export class SimpleEventEmitter<
  TEvents extends Record<string, any>,
> implements IEventEmitter<TEvents> {
  private listeners = new Map<string, Set<(payload: any) => void>>()

  on<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): () => void {
    const key = String(event)
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key)!.add(handler)
    return () => this.off(event, handler)
  }

  once<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): void {
    const wrapper = (payload: TEvents[K]) => {
      this.off(event, wrapper)
      handler(payload)
    }
    this.on(event, wrapper)
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const key = String(event)
    const set = this.listeners.get(key)
    if (set) {
      set.forEach((fn) => {
        try {
          fn(payload)
        } catch (err) {
          console.error(`Erro ao disparar evento ${String(event)}:`, err)
        }
      })
    }
  }

  off<K extends keyof TEvents>(
    event: K,
    handler: (payload: TEvents[K]) => void,
  ): void {
    const key = String(event)
    const set = this.listeners.get(key)
    if (set) {
      set.delete(handler)
    }
  }
}

export interface ActiveAddonInfo {
  addonId: string
  instance: IAddon & { metadata?: { name?: string; iconUrl?: string } }
}

export class AddonEventEmitter
  extends SimpleEventEmitter<ISystemEvents>
  implements IAddonEventsAPI
{
  onTimerStart(callback: (payload: ISystemEvents['timer:start']) => void) {
    return this.on('timer:start', callback)
  }
  onTimerPause(callback: (payload: ISystemEvents['timer:pause']) => void) {
    return this.on('timer:pause', callback)
  }
  onTimerResume(callback: (payload: ISystemEvents['timer:resume']) => void) {
    return this.on('timer:resume', callback)
  }
  onTimerStop(callback: (payload: ISystemEvents['timer:stop']) => void) {
    return this.on('timer:stop', callback)
  }
  onTimerUpdate(callback: (payload: ISystemEvents['timer:update']) => void) {
    return this.on('timer:update', callback)
  }
  onSystemIdle(callback: (payload: ISystemEvents['system:idle']) => void) {
    return this.on('system:idle', callback)
  }
  onSystemActive(callback: (payload: ISystemEvents['system:active']) => void) {
    return this.on('system:active', callback)
  }
  onTimeEntryCreated(
    callback: (payload: ISystemEvents['timeEntry:created']) => void,
  ) {
    return this.on('timeEntry:created', callback)
  }
  onTimeEntryUpdated(
    callback: (payload: ISystemEvents['timeEntry:updated']) => void,
  ) {
    return this.on('timeEntry:updated', callback)
  }
  onTimeEntryDeleted(
    callback: (payload: ISystemEvents['timeEntry:deleted']) => void,
  ) {
    return this.on('timeEntry:deleted', callback)
  }
  onWorkspaceChange(
    callback: (payload: ISystemEvents['workspace:changed']) => void,
  ) {
    return this.on('workspace:changed', callback)
  }
}

export class AddonLoader {
  private activeAddons = new Map<string, ActiveAddonInfo>()
  private activeTimerControllerAddonId: string | null = null
  private toastListeners: Array<(toastData: any) => void> = []

  public readonly sidebarRegistry = new MemoryRegistry<SidebarMenuItem>()
  private addonTimerbarItems = new Map<string, TimerbarMenuItem>()
  public readonly dataSourceRegistry: IDataSourceRegistry =
    new MemoryRegistry<IDataSource>()
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
      const targetThemeId = typeof themeId === 'string' ? themeId : null
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
    const toastData = {
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
    const toastData = { action: 'dismiss', toastId }
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

  public onToast(listener: (toastData: any) => void): () => void {
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
        const itemWithAddon = { ...item, addonId }
        this.addonTimerbarItems.set(addonId, itemWithAddon)
      },
      unregister: (_id: string) => {
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
      getActiveEntry: async () => null,
      requestControlLock: async () => {
        if (
          this.activeTimerControllerAddonId === null ||
          this.activeTimerControllerAddonId === addonId
        ) {
          this.activeTimerControllerAddonId = addonId
          return true
        }
        return false
      },
      releaseControlLock: async () => {
        if (this.activeTimerControllerAddonId === addonId) {
          this.activeTimerControllerAddonId = null
        }
      },
      isControlLockHeld: async () => {
        return this.activeTimerControllerAddonId === addonId
      },
      start: async (payload) => {
        if (
          this.activeTimerControllerAddonId &&
          this.activeTimerControllerAddonId !== addonId
        ) {
          throw new Error(
            `[TimerAPI] Controle exclusivo retido pelo addon ${this.activeTimerControllerAddonId}`,
          )
        }
        console.log(
          `⏱️ [TimerAPI] Iniciar timer por addon ${addonId}:`,
          payload,
        )
      },
      pause: async () => {
        if (
          this.activeTimerControllerAddonId &&
          this.activeTimerControllerAddonId !== addonId
        ) {
          throw new Error(
            `[TimerAPI] Controle exclusivo retido pelo addon ${this.activeTimerControllerAddonId}`,
          )
        }
        console.log(`⏱️ [TimerAPI] Pausar timer por addon ${addonId}`)
      },
      stop: async () => {
        if (
          this.activeTimerControllerAddonId &&
          this.activeTimerControllerAddonId !== addonId
        ) {
          throw new Error(
            `[TimerAPI] Controle exclusivo retido pelo addon ${this.activeTimerControllerAddonId}`,
          )
        }
        console.log(`⏱️ [TimerAPI] Parar timer por addon ${addonId}`)
      },
      logTime: async (payload) => {
        if (payload.timeSpentSeconds <= 0) {
          throw new Error(
            '[TimerAPI] Apontamento não pode ser menor ou igual a zero.',
          )
        }
        if (payload.timeSpentSeconds > 86400) {
          throw new Error(
            '[TimerAPI] Apontamento não pode exceder 24h (86400s).',
          )
        }
        console.log(`⏱️ [TimerAPI] Lançar horas por addon ${addonId}:`, payload)
      },
    }

    const timeEntries: ITimeEntriesAPI = {
      list: async () => [],
      getById: async () => null,
      create: async (payload) => {
        if (payload.timeSpentSeconds <= 0) {
          throw new Error('[TimeEntriesAPI] Duração inválida.')
        }
        return {
          id: `entry_${Date.now()}`,
          taskId: payload.taskId,
          comments: payload.comments,
          timeSpentSeconds: payload.timeSpentSeconds,
          pauseSeconds: payload.pauseSeconds ?? 0,
          status: payload.status ?? 'finished',
          source: payload.source ?? 'addon',
          createdAt: new Date().toISOString(),
        }
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
          throw new Error('[TimeEntriesAPI] Duração inválida.')
        }

        const addonSource = this.getAddonSourceInfo(addonId)

        console.log(
          `🤖 [TimeEntriesAPI] Sugestão de apontamento criada por addon ${addonId}:`,
          payload,
        )
        const item = {
          id: `sug_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          taskId: payload.taskId,
          comments: payload.comments,
          startDate,
          endDate,
          timeSpentSeconds,
          pauseSeconds: payload.pauseSeconds ?? 0,
          status: 'suggestion' as const,
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

        return item
      },
      acceptSuggestion: async (id) => {
        console.log(`✅ [TimeEntriesAPI] Sugestão aceita: ${id}`)
        return {
          id,
          timeSpentSeconds: 3600,
          pauseSeconds: 0,
          status: 'finished',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      },
      dismissSuggestion: async (id) => {
        console.log(`🗑️ [TimeEntriesAPI] Sugestão descartada: ${id}`)
        return true
      },
      update: async (id, payload) => {
        if (payload.pauseSeconds !== undefined && payload.pauseSeconds < 0) {
          throw new Error(
            '[TimeEntriesAPI] Tempo de pausa não pode ser negativo.',
          )
        }
        return {
          id,
          timeSpentSeconds: payload.timeSpentSeconds ?? 3600,
          pauseSeconds: payload.pauseSeconds ?? 0,
          status: payload.status ?? 'finished',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      },
      delete: async () => true,
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

    return {
      addonId,
      commands: this.commandRegistry,
      menus: menusRegistry,
      dataSources: this.dataSourceRegistry,
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
    if (item && item.instance.deactivate) {
      await item.instance.deactivate()
    }
    this.activeAddons.delete(addonId)
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

    if (item.instance.getSettingsSchema) {
      schema = await item.instance.getSettingsSchema()
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
    if (!item?.instance?.executeAction) {
      return { isSuccess: false, error: 'ADDON_NOT_ACTIVE' }
    }
    if (payload && typeof payload === 'object' && 'workspaceId' in payload) {
      const wsId = payload.workspaceId
      if (typeof wsId === 'string') {
        this.setActiveWorkspace(wsId)
      }
    }
    return await item.instance.executeAction(actionId, payload)
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

  public async executeCommand<T = void>(
    commandId: string,
    ...args: Array<string | number | boolean | Record<string, string>>
  ): Promise<T> {
    return await this.commandRegistry.execute<T>(commandId, ...args)
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
  return 'activate' in candidate
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
