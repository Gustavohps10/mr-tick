import {
  AppSettings,
  IDataSourceResolver,
  IServiceProvider,
} from '@mr-tick/application'
import { IRequest } from '@mr-tick/shared/transport'
import { app, BrowserWindow, screen } from 'electron'

import { NativeOverlay } from '@/main'
import { IpcHandler } from '@/main/adapters/IpcHandler'
import {
  SessionHandler,
  TasksHandler,
  TimeEntriesHandler,
  TokenHandler,
  UpdaterHandler,
} from '@/main/handlers'
import { AddonsHandler } from '@/main/handlers/AddonsHandler'
import { MetadataHandler } from '@/main/handlers/MetadataHandler'
import { WorkspacesHandler } from '@/main/handlers/WorkspacesHandler'
import { getSettings, saveSettings } from '@/main/settings'

function getWindowByType(
  event: Electron.IpcMainInvokeEvent,
  windowType?: string,
): BrowserWindow | null {
  if (!windowType) {
    return BrowserWindow.fromWebContents(event.sender)
  }
  return (
    BrowserWindow.getAllWindows().find((win) => {
      if (win.isDestroyed()) return false
      const customWin = win as unknown as { windowType?: string }
      return customWin.windowType === windowType
    }) ?? null
  )
}

export function openIpcRoutes(
  serviceProvider: IServiceProvider,
  nativeOverlay?: NativeOverlay | null,
): void {
  const tokenHandler = serviceProvider.resolve<TokenHandler>('tokenHandler')
  const workspacesHandler =
    serviceProvider.resolve<WorkspacesHandler>('workspacesHandler')
  const sessionHandler =
    serviceProvider.resolve<SessionHandler>('sessionHandler')
  const metadataHandler =
    serviceProvider.resolve<MetadataHandler>('metadataHandler')
  const tasksHandler = serviceProvider.resolve<TasksHandler>('tasksHandler')
  const timeEntriesHandler =
    serviceProvider.resolve<TimeEntriesHandler>('timeEntriesHandler')
  const addonsHandler = serviceProvider.resolve<AddonsHandler>('addonsHandler')
  const dataSourceResolver =
    serviceProvider.resolve<IDataSourceResolver>('dataSourceResolver')
  const updaterHandler =
    serviceProvider.resolve<UpdaterHandler>('updaterHandler')

  // --- SYSTEM ---
  IpcHandler.register('UPDATER_CHECK', (e) => updaterHandler.checkForUpdates(e))
  IpcHandler.register('UPDATER_DOWNLOAD', (e) =>
    updaterHandler.downloadUpdate(e),
  )
  IpcHandler.register('UPDATER_INSTALL', (e) =>
    updaterHandler.quitAndInstall(e),
  )

  IpcHandler.register('SYSTEM_VERSION', () => Promise.resolve(app.getVersion()))
  IpcHandler.register('SYSTEM_GET_ENVIRONMENT', () =>
    Promise.resolve({
      isDevelopment: !app.isPackaged,
      platform: process.platform,
    }),
  )

  // --- TOKEN STORAGE ---
  IpcHandler.register('SAVE_TOKEN', (e, req) => tokenHandler.saveToken(e, req))
  IpcHandler.register('GET_TOKEN', (e, req) => tokenHandler.getToken(e, req))
  IpcHandler.register('DELETE_TOKEN', (e, req) =>
    tokenHandler.deleteToken(e, req),
  )

  // --- WORKSPACES & CONNECTIONS ---
  IpcHandler.register('WORKSPACES_MARK_AS_CONFIGURED', (e, req) =>
    workspacesHandler.markWorkspaceAsConfigured(e, req),
  )
  IpcHandler.register('WORKSPACES_CREATE', (e, req) =>
    workspacesHandler.create(e, req),
  )
  IpcHandler.register('WORKSPACES_GET_BY_ID', (e, req) =>
    workspacesHandler.getById(e, req),
  )
  IpcHandler.register('WORKSPACES_GET_ALL', () => workspacesHandler.listAll())
  IpcHandler.register('WORKSPACES_LINK_DATASOURCE', (e, req) =>
    workspacesHandler.linkDataSource(e, req),
  )
  IpcHandler.register('WORKSPACES_UNLINK_DATASOURCE', (e, req) =>
    workspacesHandler.unlinkDataSource(e, req),
  )
  IpcHandler.register('WORKSPACES_CONNECT_DATASOURCE', (e, req) =>
    workspacesHandler.connectDataSource(e, req),
  )
  IpcHandler.register('WORKSPACES_DISCONNECT_DATASOURCE', (e, req) =>
    workspacesHandler.disconnectDataSource(e, req),
  )
  IpcHandler.register('WORKSPACES_UPDATE_IDENTITY', (e, req) =>
    workspacesHandler.updateIdentity(e, req),
  )
  IpcHandler.register('WORKSPACES_DELETE', (e, req) =>
    workspacesHandler.delete(e, req),
  )

  // --- SESSION ---
  IpcHandler.register('GET_CURRENT_USER', (e, req) =>
    sessionHandler.getCurrentUser(e, req),
  )

  IpcHandler.register(
    'DATA_SOURCE_GET_FIELDS',
    (_e, req: IRequest<{ pluginId: string }>) => {
      const pluginId = req?.body?.pluginId
      if (!pluginId)
        return Promise.reject(
          new Error('getDataSourceFields requer body.pluginId'),
        )
      return dataSourceResolver.getConfigFields(pluginId)
    },
  )

  // --- SYNC / DATA PULL (Authenticated) ---
  IpcHandler.register('METADATA_PULL', (e, req) => metadataHandler.pull(e, req))
  IpcHandler.register('TASKS_PULL', (e, req) => tasksHandler.pull(e, req))
  IpcHandler.register('TASKS_LIST', (e, req) => tasksHandler.listTasks(e, req))
  IpcHandler.register('LIST_TIME_ENTRIES', (e, req) =>
    timeEntriesHandler.listTimeEntries(e, req),
  )
  IpcHandler.register(
    'TIME_ENTRIES_PULL',

    (e, req) => timeEntriesHandler.pull(e, req),
  )
  IpcHandler.register(
    'TIME_ENTRIES_PUSH',

    (e, req) => timeEntriesHandler.push(e, req),
  )

  // --- ADDONS / MARKETPLACE ---
  IpcHandler.register('ADDONS_LIST_AVAILABLE', () =>
    addonsHandler.listAvailable(),
  )
  IpcHandler.register('ADDONS_LIST_INSTALLED', () =>
    addonsHandler.listInstalled(),
  )
  IpcHandler.register('ADDONS_GETINSTALLED_BY_ID', (e, req) =>
    addonsHandler.getInstalledById(e, req),
  )
  IpcHandler.register('ADDONS_UPDATE_LOCAL', (e, req) =>
    addonsHandler.updateLocal(e, req),
  )
  IpcHandler.register('ADDONS_IMPORT', (e, req) => addonsHandler.import(e, req))
  IpcHandler.register('ADDONS_GET_INSTALLER', (e, req) =>
    addonsHandler.getInstaller(e, req),
  )
  IpcHandler.register('ADDONS_INSTALL', (e, req) =>
    addonsHandler.install(e, req),
  )
  IpcHandler.register('ADDONS_UNINSTALL', (e, req) =>
    addonsHandler.uninstall(e, req),
  )
  IpcHandler.register('ADDONS_GET_SIDEBAR_MENUS', () =>
    addonsHandler.getSidebarMenus(),
  )
  IpcHandler.register('ADDONS_GET_TIMERBAR_MENUS', () =>
    addonsHandler.getTimerbarMenus(),
  )
  IpcHandler.register('ADDONS_EXECUTE_COMMAND', (e, req) =>
    addonsHandler.executeCommand(e, req),
  )
  IpcHandler.register('ADDONS_SHOW_TOAST', (e, req) =>
    addonsHandler.showToast(e, req),
  )
  IpcHandler.register('ADDONS_DISMISS_TOAST', (e, req) =>
    addonsHandler.dismissToast(e, req),
  )
  IpcHandler.register('ADDON_GET_SCHEMA', (e, req) =>
    addonsHandler.getSchema(e, req),
  )
  IpcHandler.register('ADDON_GET_SETTINGS', (e, req) =>
    addonsHandler.getSettings(e, req),
  )
  IpcHandler.register('ADDON_SAVE_SETTINGS', (e, req) =>
    addonsHandler.saveSettings(e, req),
  )
  IpcHandler.register('ADDON_EXECUTE_ACTION', (e, req) =>
    addonsHandler.executeAction(e, req),
  )
  IpcHandler.register('ADDONS_SET_ACTIVE_WORKSPACE', (e, req) =>
    addonsHandler.setActiveWorkspace(e, req),
  )
  IpcHandler.register('ADDONS_GET_ACTIVE_THEME', () =>
    addonsHandler.getActiveTheme(),
  )
  IpcHandler.register('ADDONS_SET_ACTIVE_THEME', (e, req) =>
    addonsHandler.setActiveTheme(e, req),
  )

  // --- WIDGET / MOUSE EVENTS ---
  IpcHandler.register('WIDGET_SET_IGNORE_MOUSE', (event, req) => {
    const ignore = req?.body?.ignore ?? true
    const forward = req?.body?.forward ?? true
    const win = BrowserWindow.fromWebContents(event.sender)

    if (win && !win.isDestroyed()) {
      const winType = (win as unknown as { windowType?: string }).windowType
      if (winType === 'widget') {
        // Passa a flag forward explicitamente conforme recebida no payload
        win.setIgnoreMouseEvents(ignore, { forward })
      }
    }

    return Promise.resolve({ success: true })
  })

  IpcHandler.register(
    'SYSTEM_MINIMIZE_WINDOW',
    (event, req: IRequest<{ windowType?: string }>) => {
      const win = getWindowByType(event, req?.body?.windowType)
      if (win && !win.isDestroyed()) {
        win.minimize()
      }
      return Promise.resolve()
    },
  )

  IpcHandler.register(
    'SYSTEM_MAXIMIZE_WINDOW',
    (event, req: IRequest<{ windowType?: string }>) => {
      const win = getWindowByType(event, req?.body?.windowType)
      if (win && !win.isDestroyed()) {
        win.maximize()
      }
      return Promise.resolve()
    },
  )

  IpcHandler.register(
    'SYSTEM_UNMAXIMIZE_WINDOW',
    (event, req: IRequest<{ windowType?: string }>) => {
      const win = getWindowByType(event, req?.body?.windowType)
      if (win && !win.isDestroyed()) {
        win.unmaximize()
      }
      return Promise.resolve()
    },
  )

  IpcHandler.register(
    'SYSTEM_CLOSE_WINDOW',
    (event, req: IRequest<{ windowType?: string }>) => {
      const win = getWindowByType(event, req?.body?.windowType)
      if (win && !win.isDestroyed()) {
        win.close()
      }
      return Promise.resolve()
    },
  )

  IpcHandler.register(
    'SYSTEM_HIDE_WINDOW',
    (event, req: IRequest<{ windowType?: string }>) => {
      const win = getWindowByType(event, req?.body?.windowType)
      if (win && !win.isDestroyed()) {
        win.hide()
      }
      return Promise.resolve()
    },
  )

  IpcHandler.register(
    'SYSTEM_SHOW_WINDOW',
    (event, req: IRequest<{ windowType?: string }>) => {
      const win = getWindowByType(event, req?.body?.windowType)
      if (win && !win.isDestroyed()) {
        win.show()
      }
      return Promise.resolve()
    },
  )

  IpcHandler.register(
    'SYSTEM_IS_MAXIMIZED',
    (event, req: IRequest<{ windowType?: string }>) => {
      const win = getWindowByType(event, req?.body?.windowType)
      if (win && !win.isDestroyed()) {
        return Promise.resolve(win.isMaximized())
      }
      return Promise.resolve(false)
    },
  )

  IpcHandler.register('SYSTEM_GET_SETTINGS', () => {
    return Promise.resolve(getSettings())
  })

  IpcHandler.register(
    'SYSTEM_SAVE_SETTINGS',
    (_e, req: IRequest<AppSettings>) => {
      saveSettings(req?.body ?? {})
      return Promise.resolve({ success: true })
    },
  )

  IpcHandler.register('SYSTEM_GET_DISPLAYS', () => {
    const primaryDisplay = screen.getPrimaryDisplay()

    const displays = screen.getAllDisplays().map((display, index) => {
      const isPrimary = display.id === primaryDisplay.id

      // Pega o nome do hardware (ex: "ASUS VG279", "DELL P2419H")
      const deviceName = display.label?.trim() || `Monitor ${index + 1}`

      return {
        id: display.id,
        label: `${deviceName}${isPrimary ? ' (Principal)' : ''}`,
        name: deviceName,
        isPrimary,
        bounds: display.bounds,
        workArea: display.workArea,
      }
    })

    return Promise.resolve(displays)
  })

  IpcHandler.register(
    'SYSTEM_MOVE_TO_DISPLAY',
    (event, req: IRequest<{ displayId: number; windowType?: string }>) => {
      const displayId = req?.body?.displayId
      const targetWindowType = req?.body?.windowType

      if (!displayId) return Promise.resolve({ success: false })

      let targetWindow: BrowserWindow | null = null

      if (targetWindowType) {
        targetWindow =
          BrowserWindow.getAllWindows().find((win) => {
            if (win.isDestroyed()) return false
            const customWin = win as unknown as { windowType?: string }
            return customWin.windowType === targetWindowType
          }) ?? null
      } else {
        targetWindow = BrowserWindow.fromWebContents(event.sender)
      }

      if (!targetWindow || targetWindow.isDestroyed()) {
        return Promise.resolve({ success: false })
      }

      const targetDisplay = screen
        .getAllDisplays()
        .find((d) => d.id === displayId)

      if (targetDisplay) {
        const { x, y, width, height } = targetDisplay.workArea
        targetWindow.setBounds({ x, y, width, height })

        // --- CORREÇÃO AQUI ---
        // O SO reseta o click-through ao mudar de monitor, forçamos a re-aplicação.
        const winType =
          targetWindowType ||
          (targetWindow as unknown as { windowType?: string }).windowType
        if (winType === 'widget') {
          targetWindow.setIgnoreMouseEvents(true, { forward: true })
        }
        // ---------------------

        // Notifica o Renderer
        targetWindow.webContents.send('window:bounds-changed', {
          x,
          y,
          width,
          height,
        })
      }

      return Promise.resolve({ success: true })
    },
  )

  // --- WIDGET NATIVE OVERLAY / KEYBOARD HOOK ---
  IpcHandler.register('WIDGET_FORCE_TOPMOST', () => {
    if (process.platform === 'win32' && nativeOverlay) {
      nativeOverlay.forceTopmost()
    }
    return Promise.resolve({ success: true })
  })

  IpcHandler.register('WIDGET_START_KEY_CAPTURE', () => {
    if (process.platform === 'win32' && nativeOverlay) {
      nativeOverlay.startKeyboardInterception()
    }
    return Promise.resolve({ success: true })
  })

  IpcHandler.register('WIDGET_STOP_KEY_CAPTURE', () => {
    if (process.platform === 'win32' && nativeOverlay) {
      nativeOverlay.stopKeyboardInterception()
    }
    return Promise.resolve({ success: true })
  })

  IpcHandler.register(
    'SYSTEM_TOGGLE_THEME',
    (_event, req: IRequest<{ theme: 'light' | 'dark' | 'system' }>) => {
      const nextTheme = req?.body?.theme
      if (!nextTheme) return Promise.resolve({ success: false })

      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('theme:changed', nextTheme)
        }
      })

      return Promise.resolve({ success: true })
    },
  )
}
