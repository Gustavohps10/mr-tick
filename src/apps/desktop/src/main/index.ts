import {
  existsSync,
  readFileSync,
  unlinkSync,
  watch,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import {
  JSONWorkspacesQuery,
  JSONWorkspacesRepository,
} from '@mr-tick/adapters/data'
import { AddonsFacade } from '@mr-tick/adapters/facades'
import { HardDiskStorage, KeytarTokenStorage } from '@mr-tick/adapters/tools'
import { ContainerBuilder, PlatformDependencies } from '@mr-tick/IoC'
import {
  app,
  BrowserWindow,
  net,
  protocol,
  screen,
  shell,
  Tray,
} from 'electron'
import installExtension, {
  REACT_DEVELOPER_TOOLS,
} from 'electron-devtools-installer'

import { ElectronHttpClient } from '@/main/adapters/ElectronHttpClient'
import { ElectronJobEventEmitter } from '@/main/adapters/ElectronJobEventEmitter'
import { TimerRuntime } from '@/main/adapters/TimerRuntime'
import {
  ConnectionHandler,
  SessionHandler,
  TasksHandler,
  TimeEntriesHandler,
  TokenHandler,
  UpdaterHandler,
} from '@/main/handlers'
import { AddonsHandler } from '@/main/handlers/AddonsHandler'
import { MetadataHandler } from '@/main/handlers/MetadataHandler'
import { WorkspacesHandler } from '@/main/handlers/WorkspacesHandler'
import { DataSourceResolver } from '@/main/resolvers/data-source-resolver'
import { openIpcRoutes } from '@/main/routes'
import { AddonLoader } from '@/main/services/AddonLoader'
import { UpdaterService } from '@/main/services/UpdaterService'
import { getSettings } from '@/main/settings'
import { createTray } from '@/main/tray'

const requireNative = createRequire(import.meta.url)

export interface NativeOverlay {
  applyOverlayStyles: (handle: Buffer) => boolean
  setKeyEventListener: (
    callback: (data: { vkCode: number; key: string }) => void,
  ) => void
  startKeyboardInterception: () => void
  stopKeyboardInterception: () => void
  forceTopmost: () => void
}

export type IHandlersScope = {
  connectionHandler: typeof ConnectionHandler
  sessionHandler: typeof SessionHandler
  tasksHandler: typeof TasksHandler
  timeEntriesHandler: typeof TimeEntriesHandler
  tokenHandler: typeof TokenHandler
  workspacesHandler: typeof WorkspacesHandler
  addonsHandler: typeof AddonsHandler
  metadataHandler: typeof MetadataHandler
  updaterHandler: typeof UpdaterHandler
}

// --------------------------------------------------
// CONFIGURAÇÕES GLOBAIS & SINGLE INSTANCE LOCK
// --------------------------------------------------
app.name = 'mr-tick'

const userDataDir = app.getPath('userData')
const bridgeFilePath = join(userDataDir, 'oauth_bridge.tmp')

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // PROCESSO SECUNDÁRIO: Grava a URL no arquivo compartilhado e morre instantaneamente
  console.log('[Mr-tick Core] ❌ Instância secundária capturada.')

  const deepLink = process.argv.find((arg) => arg.includes('mr-tick-app://'))

  if (deepLink) {
    const cleanUrl = deepLink.substring(deepLink.indexOf('mr-tick-app://'))
    try {
      writeFileSync(bridgeFilePath, cleanUrl, 'utf-8')
      console.log(
        '[Mr-tick Core] 💾 URL gravada na ponte com sucesso:',
        cleanUrl,
      )
    } catch (err) {
      console.error('[Mr-tick Core] Erro ao gravar URL no arquivo ponte:', err)
    }
  }

  // Encerra a segunda instância de forma atômica
  app.exit(0)
} else {
  // --------------------------------------------------
  // PRIMEIRA INSTÂNCIA
  // --------------------------------------------------
  console.log('[Mr-tick Core] ✅ PRIMEIRA INSTÂNCIA EM EXECUÇÃO')

  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null
  let secondaryWindow: BrowserWindow | null = null
  let globalAddonLoader: AddonLoader | null = null
  let nativeOverlay: NativeOverlay | null = null

  const appIconPath = app.isPackaged
    ? join(process.resourcesPath, 'favicon.ico')
    : join(__dirname, '../../resources/favicon.ico')

  // FUNÇÃO CENTRALIZADA DE TRATAMENTO DE DEEP LINK
  function handleIncomingDeepLink(rawUrl: string) {
    const cleanUrl = rawUrl.replace(/\/$/, '').trim()
    console.log(
      '[Mr-tick Core] 🔗 Deep Link recebido e repassado ao AddonLoader:',
      cleanUrl,
    )

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }

    if (globalAddonLoader && cleanUrl.startsWith('mr-tick-app://')) {
      globalAddonLoader.handleOAuthCallbackUrl(cleanUrl)
    }
  }

  // WATCHER NATIVO DE ARQUIVO (Ponte direta do processo secundário)
  try {
    if (existsSync(bridgeFilePath)) {
      unlinkSync(bridgeFilePath)
    }

    watch(userDataDir, (_eventType, filename) => {
      if (filename === 'oauth_bridge.tmp' && existsSync(bridgeFilePath)) {
        try {
          const content = readFileSync(bridgeFilePath, 'utf-8').trim()
          if (content) {
            unlinkSync(bridgeFilePath)
            handleIncomingDeepLink(content)
          }
        } catch {
          // Ignora se o arquivo estiver bloqueado temporariamente durante a escrita
        }
      }
    })
  } catch (err) {
    console.error('[Mr-tick Core] Erro ao iniciar watcher da ponte:', err)
  }

  // CARREGAMENTO DO PLUGIN C++ NATIVO
  if (process.platform === 'win32') {
    try {
      const binaryPath = app.isPackaged
        ? join(process.resourcesPath, 'native-prebuilds/window_overlay.node')
        : join(__dirname, '../../native-prebuilds/window_overlay.node')

      nativeOverlay = requireNative(binaryPath)
      console.log('✅ [C++ plugin] ✓ Carregado: window_overlay.node')
    } catch (err) {
      console.error(
        '❌ [@mr-tick/desktop] Erro ao carregar window_overlay.node:',
        err,
      )
    }
  }

  if (process.platform === 'win32' && nativeOverlay) {
    nativeOverlay.setKeyEventListener((data) => {
      if (secondaryWindow && !secondaryWindow.isDestroyed()) {
        secondaryWindow.webContents.send('widget:raw-key-input', data)
      }
    })
  }

  // CHROMIUM FLAGS
  app.commandLine.appendSwitch('disable-background-timer-throttling')
  app.commandLine.appendSwitch(
    'disable-features',
    'CalculateNativeWinOcclusion',
  )

  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'mr-tick-app',
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ])

  // REGISTRO DO PROTOCOLO NO SO
  const currentCompiledFile = fileURLToPath(import.meta.url)

  if (!app.isPackaged) {
    console.log('[Mr-tick Core] 🔗 Registrando protocolo (Dev Monorepo):', {
      executable: process.execPath,
      compiledFile: currentCompiledFile,
    })

    app.setAsDefaultProtocolClient('mr-tick-app', process.execPath, [
      currentCompiledFile,
    ])
  } else {
    app.setAsDefaultProtocolClient('mr-tick-app')
  }

  // LISTENERS NATIVOS (Fallback & macOS)
  app.on('second-instance', (_event, commandLine) => {
    const rawDeepLink = commandLine.find((arg) =>
      arg.startsWith('mr-tick-app://'),
    )
    if (rawDeepLink) {
      handleIncomingDeepLink(rawDeepLink)
    }
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (url.startsWith('mr-tick-app://')) {
      handleIncomingDeepLink(url)
    }
  })

  // CRIAÇÃO DE JANELAS
  const createWindow = () => {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      show: false,
      frame: false,
      icon: appIconPath,
      titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'hidden',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
    ;(mainWindow as unknown as { windowType: string }).windowType = 'main'

    mainWindow.on('ready-to-show', () => {
      const settings = getSettings()
      settings.startMinimized ? mainWindow?.minimize() : mainWindow?.show()
    })

    mainWindow.on('maximize', () => {
      mainWindow?.webContents.send('window:maximized-change', true)
    })

    mainWindow.on('unmaximize', () => {
      mainWindow?.webContents.send('window:maximized-change', false)
    })

    let moveTimeout: NodeJS.Timeout | null = null

    mainWindow.on('will-move', () => {
      if (secondaryWindow && !secondaryWindow.isDestroyed()) {
        secondaryWindow.setIgnoreMouseEvents(true, { forward: false })

        if (moveTimeout) clearTimeout(moveTimeout)

        moveTimeout = setTimeout(() => {
          if (secondaryWindow && !secondaryWindow.isDestroyed()) {
            secondaryWindow.setIgnoreMouseEvents(true, { forward: true })
          }
        }, 150)
      }
    })

    mainWindow.on('moved', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const bounds = mainWindow.getBounds()
        mainWindow.webContents.send('window:bounds-changed', bounds)
      }
    })

    mainWindow.webContents.setWindowOpenHandler((d) => {
      shell.openExternal(d.url)
      return { action: 'deny' }
    })

    mainWindow.webContents.on('will-navigate', (event, url) => {
      // Se for navegação para URL externa (http/https), abre no navegador padrão do SO
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const isDevServer =
          is.dev &&
          process.env['ELECTRON_RENDERER_URL'] &&
          url.startsWith(process.env['ELECTRON_RENDERER_URL'])

        if (!isDevServer) {
          event.preventDefault()
          shell.openExternal(url)
        }
      }
    })

    mainWindow.on('closed', () => {
      mainWindow = null
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  const createSecondaryWindow = (
    activeWorkspaceId?: string,
    targetDisplayId?: number,
  ) => {
    const allDisplays = screen.getAllDisplays()
    const primaryDisplay = screen.getPrimaryDisplay()

    const targetDisplay =
      allDisplays.find((d) => d.id === targetDisplayId) || primaryDisplay
    const { x, y, width, height } = targetDisplay.workArea

    secondaryWindow = new BrowserWindow({
      width,
      height,
      x,
      y,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      focusable: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        contextIsolation: true,
        backgroundThrottling: false,
        sandbox: false,
      },
    })
    ;(secondaryWindow as unknown as { windowType: string }).windowType =
      'widget'

    if (process.platform === 'win32' && nativeOverlay) {
      const handle = secondaryWindow.getNativeWindowHandle()
      nativeOverlay.applyOverlayStyles(handle)
    }

    secondaryWindow.on('moved', () => {
      if (secondaryWindow && !secondaryWindow.isDestroyed()) {
        const bounds = secondaryWindow.getBounds()
        secondaryWindow.webContents.send('window:bounds-changed', bounds)
        secondaryWindow.setIgnoreMouseEvents(true, { forward: true })
      }
    })

    secondaryWindow.setIgnoreMouseEvents(true, { forward: true })

    secondaryWindow.once('ready-to-show', () => {
      secondaryWindow!.show()
    })

    secondaryWindow.on('closed', () => {
      secondaryWindow = null
    })

    const workspaceId = activeWorkspaceId ?? 'default'
    const widgetHashPath = `/workspaces/${workspaceId}/widgets/timer`

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      secondaryWindow.loadURL(
        `${process.env['ELECTRON_RENDERER_URL']}/#${widgetHashPath}`,
      )
    } else {
      secondaryWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: widgetHashPath,
      })
    }
  }

  // HANDLER DE PROTOCOLO INTERNO
  function handleProtocol() {
    protocol.handle('mr-tick-app', async (request) => {
      try {
        if (request.url.startsWith('mr-tick-app://oauth/callback')) {
          if (globalAddonLoader) {
            globalAddonLoader.handleOAuthCallbackUrl(request.url)
          }
          return new Response('OK', { status: 200 })
        }

        let filePath = request.url.replace('mr-tick-app://', '')
        filePath = filePath
          .replace(/[?&]buster=[^&]*/g, '')
          .replace(/[?&]$/, '')
        filePath = decodeURIComponent(filePath)

        if (process.platform === 'win32' && /^[a-zA-Z]\//.test(filePath)) {
          filePath = filePath[0].toUpperCase() + ':' + filePath.slice(1)
        }

        const fileUrl = pathToFileURL(filePath).toString()
        return net.fetch(fileUrl)
      } catch (error) {
        console.error('Erro no protocolo mr-tick-app:', error)
        return new Response('Resource not found', { status: 404 })
      }
    })
  }

  // CICLO DE VIDA DO ELECTRON
  app.whenReady().then(async () => {
    handleProtocol()

    const userDataPath = app.getPath('userData')
    const credentialsStorage = new KeytarTokenStorage()
    const addonLoader = new AddonLoader(credentialsStorage)
    globalAddonLoader = addonLoader

    // Cold-start link
    const initialDeepLink = process.argv.find((arg) =>
      arg.startsWith('mr-tick-app://'),
    )
    if (initialDeepLink) {
      handleIncomingDeepLink(initialDeepLink)
    }

    const timerRuntime = new TimerRuntime()
    timerRuntime.init(addonLoader)

    const workspacesRepository = new JSONWorkspacesRepository(userDataPath)
    const workspacesQuery = new JSONWorkspacesQuery(userDataPath)
    const eventEmitter = new ElectronJobEventEmitter(() => mainWindow)
    const nodeFileStorage = new HardDiskStorage(userDataPath, 'mr-tick-app://')
    const electronHttpClient = new ElectronHttpClient()

    // Carrega e ativa todos os addons instalados no disco
    try {
      const addonsFacade = new AddonsFacade(nodeFileStorage)
      const installedResult = await addonsFacade.listInstalled()
      if (installedResult.isSuccess() && installedResult.success.length > 0) {
        await addonLoader.loadInstalledAddons(installedResult.success)
        console.log(
          `🧩 [Mr-tick Core] ${installedResult.success.length} addon(s) instalado(s) carregado(s) no boot.`,
        )
      }
    } catch (err) {
      console.error(
        '❌ [Mr-tick Core] Erro ao carregar addons instalados no boot:',
        err,
      )
    }

    const updaterService = new UpdaterService()
    updaterService.init()

    const localDataSourceResolver = new DataSourceResolver(
      workspacesRepository,
      credentialsStorage,
      {
        addonsBasePath: join(__dirname, '../addons/datasource'),
        isDevelopment: !app.isPackaged,
        addonLoader,
      },
      electronHttpClient,
    )

    const platformDeps: PlatformDependencies = {
      jobEmitter: eventEmitter,
      credentialsStorage,
      workspacesRepository,
      workspacesQuery,
      fileStorage: nodeFileStorage,
      dataSourceResolver: localDataSourceResolver,
      httpClient: electronHttpClient,
    }

    const serviceProvider = new ContainerBuilder()
      .addPlatformDependencies(platformDeps)
      .addInfrastructure()
      .addApplicationServices()
      .addScoped<IHandlersScope>({
        connectionHandler: ConnectionHandler,
        sessionHandler: SessionHandler,
        tasksHandler: TasksHandler,
        timeEntriesHandler: TimeEntriesHandler,
        tokenHandler: TokenHandler,
        workspacesHandler: WorkspacesHandler,
        addonsHandler: AddonsHandler,
        metadataHandler: MetadataHandler,
        updaterHandler: UpdaterHandler,
      })
      .build()

    serviceProvider.include({ addonLoader, updaterService })

    openIpcRoutes(serviceProvider, nativeOverlay)

    electronApp.setAppUserModelId('com.electron')

    app.on('browser-window-created', (_, browserWindow) => {
      optimizer.watchWindowShortcuts(browserWindow)

      browserWindow.webContents.setWindowOpenHandler((details) => {
        if (
          details.url.startsWith('http://') ||
          details.url.startsWith('https://')
        ) {
          shell.openExternal(details.url)
        }
        return { action: 'deny' }
      })

      browserWindow.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          const isDevServer =
            is.dev &&
            process.env['ELECTRON_RENDERER_URL'] &&
            url.startsWith(process.env['ELECTRON_RENDERER_URL'])

          if (!isDevServer) {
            event.preventDefault()
            shell.openExternal(url)
          }
        }
      })

      browserWindow.webContents.on('before-input-event', (_, input) => {
        const f12 = input.key === 'F12'
        const ctrlShiftI =
          input.control && input.shift && input.key.toLowerCase() === 'i'
        const ctrlShiftR =
          input.control && input.shift && input.key.toLowerCase() === 'r'
        const ctrlR =
          input.control && !input.shift && input.key.toLowerCase() === 'r'
        const f5 = input.key === 'F5'

        if (input.type === 'keyDown') {
          if (f12 || ctrlShiftI) {
            browserWindow.webContents.toggleDevTools()
          }
          if (ctrlShiftR || ctrlR || f5) {
            browserWindow.webContents.reloadIgnoringCache()
          }
        }
      })
    })

    if (is.dev) {
      try {
        await installExtension(REACT_DEVELOPER_TOOLS, {
          loadExtensionOptions: { allowFileAccess: true },
        })
      } catch (err) {
        console.error('❌ Erro ao instalar a extensão React DevTools:', err)
      }
    }

    tray = createTray(
      () => secondaryWindow,
      () => createSecondaryWindow(),
    )
    createWindow()
    createSecondaryWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    app.on('before-quit', () => {
      if (tray) {
        tray.destroy()
        tray = null
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
