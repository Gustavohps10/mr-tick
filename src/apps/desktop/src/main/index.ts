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
  JSONAddonSettingsRepository,
  SQLiteConnectionLifecycleRepository,
  SQLiteConnectionLifecycleTransactionBoundary,
  SQLiteConnectionReservationRepository,
  SQLiteWorkspaceCredentialReferenceRegistry,
  SQLiteWorkspacesRepository,
} from '@mr-tick/adapters/data'
import {
  HardDiskStorage,
  KeytarCredentialsVault,
} from '@mr-tick/adapters/tools'
import {
  IAddonAccessService,
  IAddonAuthenticatorRegistry,
  IAddonConnectionProfilesRegistry,
  IConnectAddonConnectionUseCase,
  IConnectionLifecycleCoordinator,
  ICoreAddonCapabilities,
  IDisconnectAddonConnectionUseCase,
  ILinkConnectionUseCase,
  IOAuthAttemptCoordinator,
  IUnlinkConnectionUseCase,
} from '@mr-tick/application'
import { IAddonsFacade, ILicensingFacade } from '@mr-tick/application'
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

import {
  DefaultElectronFetchTransport,
  ElectronHttpClientFactory,
} from '@/main/adapters/ElectronHttpClient'
import { ElectronJobEventEmitter } from '@/main/adapters/ElectronJobEventEmitter'
import { TimerRuntime } from '@/main/adapters/TimerRuntime'
import {
  LicensingHandler,
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
import { AddonLoader } from '@/main/services/addons/loader/AddonLoader'
import { DesktopCredentialRecovery } from '@/main/services/credentials/DesktopCredentialRecovery'
import { LocalRuntimeDispatcher } from '@/main/services/local-runtime/LocalRuntimeDispatcher'
import { UpdaterService } from '@/main/services/updates/UpdaterService'
import { getSettings } from '@/main/settings'
import { createTray } from '@/main/tray'

import sdkPackage from '../../../sdk/package.json'
import {
  addonPackageVerificationConfiguration,
  licensingApiConfiguration,
  offlineAuthorizationVerificationConfiguration,
} from './securityConfiguration'
import { AddonCoreCapabilities } from './services/addons/core/AddonCoreCapabilities'

const requireNative = createRequire(import.meta.url)

export interface NativeOverlay {
  applyOverlayStyles: (handle: Buffer) => boolean
  removeOverlayStyles?: (handle: Buffer) => void
  cleanupOverlay?: () => void
  isKeyboardInterceptionActive?: () => boolean
  setKeyEventListener: (
    callback: (data: { vkCode: number; key: string }) => void,
  ) => void
  startKeyboardInterception: () => void
  stopKeyboardInterception: () => void
  forceTopmost: () => void
}

export type IHandlersScope = {
  sessionHandler: typeof SessionHandler
  tasksHandler: typeof TasksHandler
  timeEntriesHandler: typeof TimeEntriesHandler
  tokenHandler: typeof TokenHandler
  workspacesHandler: typeof WorkspacesHandler
  addonsHandler: typeof AddonsHandler
  licensingHandler: typeof LicensingHandler
  metadataHandler: typeof MetadataHandler
  updaterHandler: typeof UpdaterHandler
}

const oauthCallbackProtocol = app.isPackaged ? 'mr-tick' : 'electron'

function findDeepLinkInArgs(args: string[]): string | undefined {
  for (const arg of args) {
    const oauthPrefix = `${oauthCallbackProtocol}://`
    if (arg.includes(oauthPrefix))
      return arg.substring(arg.indexOf(oauthPrefix))
    if (arg.includes('mr-tick-app://')) {
      return arg.substring(arg.indexOf('mr-tick-app://'))
    }
    if (arg.includes('mistertick://')) {
      return arg.substring(arg.indexOf('mistertick://'))
    }
  }
  return undefined
}

function extractActivationKeyFromDeepLink(cleanUrl: string): string | null {
  try {
    let normalized = ''
    if (cleanUrl.startsWith('mistertick://')) {
      normalized = cleanUrl.replace('mistertick://', 'http://localhost/')
    }
    if (cleanUrl.startsWith('mr-tick-app://')) {
      normalized = cleanUrl.replace('mr-tick-app://', 'http://localhost/')
    }
    if (!normalized) return null

    const parsed = new URL(normalized)
    if (parsed.pathname !== '/activate') return null
    const key = parsed.searchParams.get('key')
    if (!key || key.trim().length === 0) return null
    return key.trim()
  } catch {
    return null
  }
}

app.name = 'mr-tick'

const testUserDataPath = process.env.MR_TICK_TEST_USER_DATA_DIR
if (process.env.NODE_ENV === 'test' && testUserDataPath)
  app.setPath('userData', testUserDataPath)

const userDataDir = app.getPath('userData')
const bridgeFilePath = join(userDataDir, 'oauth_bridge.tmp')

const isTestMode = process.env.NODE_ENV === 'test'
let gotTheLock = true
if (!isTestMode) {
  gotTheLock = app.requestSingleInstanceLock()
}

if (!gotTheLock) {
  console.log('[Mr-tick Core] ❌ Instância secundária capturada.')

  const cleanUrl = findDeepLinkInArgs(process.argv)

  if (cleanUrl) {
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

  app.exit(0)
}

if (gotTheLock) {
  console.log('[Mr-tick Core] ✅ PRIMEIRA INSTÂNCIA EM EXECUÇÃO')

  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null
  let secondaryWindow: BrowserWindow | null = null
  let globalAddonLoader: AddonLoader | null = null
  let globalLicensingFacade: ILicensingFacade | null = null
  let pendingActivationKey: string | null = null
  let nativeOverlay: NativeOverlay | null = null

  let appIconPath = join(__dirname, '../../resources/favicon.ico')
  if (app.isPackaged) {
    appIconPath = join(process.resourcesPath, 'favicon.ico')
  }

  async function processActivationDeepLinkKey(key: string): Promise<void> {
    if (!globalLicensingFacade) {
      pendingActivationKey = key
      return
    }
    const result = await globalLicensingFacade.activateLicense(key)
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('licensing:updated')
      }
    }
    if (result.isSuccess()) {
      globalAddonLoader?.showToast(
        'success',
        'Sua assinatura Mr. Tick Plus foi ativada neste dispositivo!',
        'Mr. Tick Plus Ativado',
      )
      return
    }
    globalAddonLoader?.showToast(
      'error',
      `Não foi possível ativar a licença: ${result.failure.messageKey}`,
      'Falha na Ativação Plus',
    )
  }

  function handleIncomingDeepLink(rawUrl: string) {
    const cleanUrl = rawUrl.replace(/\/$/, '').trim()
    console.log('[Mr-tick Core] 🔗 Deep Link recebido:', cleanUrl)

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }

    const activationKey = extractActivationKeyFromDeepLink(cleanUrl)
    if (activationKey) {
      void processActivationDeepLinkKey(activationKey)
      return
    }

    if (
      globalAddonLoader &&
      cleanUrl.startsWith(`${oauthCallbackProtocol}://`)
    ) {
      globalAddonLoader.handleOAuthCallbackUrl(cleanUrl)
    }
  }

  try {
    if (existsSync(bridgeFilePath)) {
      unlinkSync(bridgeFilePath)
    }

    watch(userDataDir, (eventType, filename) => {
      if (
        eventType &&
        filename === 'oauth_bridge.tmp' &&
        existsSync(bridgeFilePath)
      ) {
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

  if (process.platform === 'win32') {
    try {
      let binaryPath = join(
        __dirname,
        '../../native-prebuilds/window_overlay.node',
      )
      if (app.isPackaged) {
        binaryPath = join(
          process.resourcesPath,
          'native-prebuilds/window_overlay.node',
        )
      }

      nativeOverlay = requireNative(binaryPath)
      globalThis.nativeOverlayInstance = nativeOverlay
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

  app.commandLine.appendSwitch('disable-background-timer-throttling')
  app.commandLine.appendSwitch(
    'disable-features',
    'CalculateNativeWinOcclusion',
  )

  const remoteDebugPort =
    process.env.MR_TICK_REMOTE_DEBUG_PORT ||
    (process.env.MR_TICK_DEBUG === '1' ? '9333' : null)
  if (remoteDebugPort) {
    app.commandLine.appendSwitch('remote-debugging-port', remoteDebugPort)
    console.log(
      `🐞 [Mr-tick Core] Remote debugging port ativo: http://localhost:${remoteDebugPort}`,
    )
  }

  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'mr-tick-app',
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
    {
      scheme: 'mistertick',
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ])

  const currentCompiledFile = fileURLToPath(import.meta.url)

  if (!app.isPackaged) {
    console.log('[Mr-tick Core] 🔗 Registrando protocolos (Dev Monorepo):', {
      executable: process.execPath,
      compiledFile: currentCompiledFile,
    })

    app.setAsDefaultProtocolClient(oauthCallbackProtocol, process.execPath, [
      currentCompiledFile,
    ])
    app.setAsDefaultProtocolClient('mr-tick-app', process.execPath, [
      currentCompiledFile,
    ])
    app.setAsDefaultProtocolClient('mistertick', process.execPath, [
      currentCompiledFile,
    ])
  }
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient(oauthCallbackProtocol)
    app.setAsDefaultProtocolClient('mr-tick-app')
    app.setAsDefaultProtocolClient('mistertick')
  }

  app.on('second-instance', (event, commandLine) => {
    if (!event) return
    const rawDeepLink = findDeepLinkInArgs(commandLine)
    if (rawDeepLink) {
      handleIncomingDeepLink(rawDeepLink)
    }
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (
      url.startsWith(`${oauthCallbackProtocol}://`) ||
      url.startsWith('mr-tick-app://') ||
      url.startsWith('mistertick://')
    ) {
      handleIncomingDeepLink(url)
    }
  })

  const createWindow = () => {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      show: false,
      frame: false,
      icon: appIconPath,
      titleBarStyle: 'hidden',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
    mainWindow.windowType = 'main'

    mainWindow.on('ready-to-show', () => {
      const settings = getSettings()
      if (settings.startMinimized) {
        mainWindow?.minimize()
        return
      }
      mainWindow?.show()
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
      return
    }
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  const createSecondaryWindow = (
    activeWorkspaceId?: string,
    targetDisplayId?: number,
  ) => {
    const allDisplays = screen.getAllDisplays()
    const primaryDisplay = screen.getPrimaryDisplay()

    let targetDisplay = primaryDisplay
    const matchedDisplay = allDisplays.find((d) => d.id === targetDisplayId)
    if (matchedDisplay) {
      targetDisplay = matchedDisplay
    }
    const { x, y, width, height } = targetDisplay.workArea
    secondaryWindow = new BrowserWindow({
      width,
      height,
      x,
      y,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
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
    secondaryWindow.windowType = 'widget'

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
      secondaryWindow?.show()
    })

    secondaryWindow.on('closed', () => {
      if (process.platform === 'win32' && nativeOverlay) {
        try {
          if (typeof nativeOverlay.cleanupOverlay === 'function') {
            nativeOverlay.cleanupOverlay()
          }
        } catch (err) {
          console.error('[Mr-tick Core] Erro ao limpar overlay nativo:', err)
        }
      }
      secondaryWindow = null
    })

    let widgetHashPath = '/widgets/timer'
    if (activeWorkspaceId) {
      widgetHashPath = `/workspaces/${activeWorkspaceId}/widgets/timer`
    }

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      secondaryWindow.loadURL(
        `${process.env['ELECTRON_RENDERER_URL']}/#${widgetHashPath}`,
      )
      return
    }
    secondaryWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: widgetHashPath,
    })
  }

  function handleProtocol() {
    protocol.handle('mr-tick-app', async (request) => {
      try {
        if (request.url.startsWith('mr-tick-app://activate')) {
          handleIncomingDeepLink(request.url)
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

    protocol.handle('mistertick', async (request) => {
      handleIncomingDeepLink(request.url)
      return new Response('OK', { status: 200 })
    })
  }

  app
    .whenReady()
    .then(async () => {
      handleProtocol()

      const userDataPath = app.getPath('userData')
      const credentialsVault = new KeytarCredentialsVault()
      const workspacesRepository = new SQLiteWorkspacesRepository(userDataPath)
      const lifecycleRepository = new SQLiteConnectionLifecycleRepository(
        workspacesRepository.db,
      )
      const credentialRegistry = new SQLiteWorkspaceCredentialReferenceRegistry(
        workspacesRepository.db,
      )
      const reservationRepository = new SQLiteConnectionReservationRepository(
        workspacesRepository.db,
      )
      const transactionBoundary =
        new SQLiteConnectionLifecycleTransactionBoundary(
          workspacesRepository.db,
        )

      const credentialRecovery = new DesktopCredentialRecovery(
        credentialRegistry,
        lifecycleRepository,
        reservationRepository,
        credentialsVault,
        workspacesRepository,
        transactionBoundary,
      )
      const recoveryResult = await credentialRecovery.execute()
      if (recoveryResult.isFailure()) {
        console.error(
          'Credential recovery failed before desktop startup:',
          recoveryResult.failure.messageKey,
        )
        app.quit()
        return
      }
      const runtimeWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: join(__dirname, '../preload/index.mjs'),
          sandbox: false,
          contextIsolation: true,
          backgroundThrottling: false,
        },
      })
      runtimeWindow.windowType = 'runtime'
      const localRuntime = new LocalRuntimeDispatcher(runtimeWindow)
      const nodeFileStorage = new HardDiskStorage(
        userDataPath,
        'mr-tick-app://',
      )
      const containerBuilder = new ContainerBuilder()
        .addSecurityDependencies({
          credentialsVault,
          fileStorage: nodeFileStorage,
          licensingApiConfiguration,
          offlineAuthorizationVerificationConfiguration,
          addonPackageVerificationConfiguration,
        })
        .addInfrastructure()
        .addApplicationServices()
      const serviceProvider = containerBuilder.build()
      serviceProvider.include({
        pendingWorkGuard: localRuntime,
      })
      const addonAccessService =
        serviceProvider.resolve<IAddonAccessService>('addonAccessService')
      const oauthAttemptCoordinator =
        serviceProvider.resolve<IOAuthAttemptCoordinator>(
          'oauthAttemptCoordinator',
        )
      let addonLoader: AddonLoader
      addonLoader = new AddonLoader(
        credentialsVault,
        localRuntime,
        sdkPackage.version,
        (addonId: string): ICoreAddonCapabilities =>
          new AddonCoreCapabilities(
            workspacesRepository,
            localRuntime,
            addonId,
            serviceProvider.resolve<IConnectionLifecycleCoordinator>(
              'connectionLifecycleCoordinator',
            ),
            serviceProvider.resolve<ILinkConnectionUseCase>(
              'linkConnectionService',
            ),
            serviceProvider.resolve<IConnectAddonConnectionUseCase>(
              'connectAddonConnectionService',
            ),
            serviceProvider.resolve<IDisconnectAddonConnectionUseCase>(
              'disconnectAddonConnectionService',
            ),
            serviceProvider.resolve<IUnlinkConnectionUseCase>(
              'unlinkConnectionService',
            ),
            serviceProvider.resolve<IAddonAuthenticatorRegistry>(
              'authenticatorRegistry',
            ),
            serviceProvider.resolve<IAddonConnectionProfilesRegistry>(
              'profilesResolver',
            ),
            oauthAttemptCoordinator,
            addonLoader.systemEventEmitter,
          ),
        addonAccessService,
        credentialRegistry,
        new JSONAddonSettingsRepository(userDataPath),
        serviceProvider.resolve<IAddonAuthenticatorRegistry>(
          'authenticatorRegistry',
        ),
        serviceProvider.resolve<IAddonConnectionProfilesRegistry>(
          'profilesResolver',
        ),
        oauthAttemptCoordinator,
      )
      globalAddonLoader = addonLoader

      const initialDeepLink = findDeepLinkInArgs(process.argv)
      if (initialDeepLink) {
        handleIncomingDeepLink(initialDeepLink)
      }

      const timerRuntime = new TimerRuntime()
      timerRuntime.init(addonLoader, (generation) =>
        localRuntime.acceptsGeneration(generation),
      )

      const eventEmitter = new ElectronJobEventEmitter(() => mainWindow)
      const electronHttpClientFactory = new ElectronHttpClientFactory(
        {},
        new DefaultElectronFetchTransport(),
      )
      const electronHttpClient = electronHttpClientFactory.createClient({})

      if (!app.isPackaged && process.env.PLAYWRIGHT_TEST === '1') {
        const { registerElectronHttpTransportTestProbe } =
          await import('@/main/testing/electron-http-transport-test-probe')
        registerElectronHttpTransportTestProbe(() => {
          if (mainWindow === null) return null
          if (mainWindow.isDestroyed()) return null
          return mainWindow.webContents
        })
      }

      const updaterService = new UpdaterService()
      if (process.env.NODE_ENV !== 'test') updaterService.init()

      const localDataSourceResolver = new DataSourceResolver(
        workspacesRepository,
        credentialsVault,
        {
          addonsBasePath: join(__dirname, '../addons/datasource'),
          isDevelopment: !app.isPackaged,
          addonLoader,
        },
        electronHttpClientFactory,
      )

      const platformDeps: PlatformDependencies = {
        jobEmitter: eventEmitter,
        credentialsVault,
        workspacesRepository,
        lifecycleRepository,
        reservationRepository,
        credentialRegistry,
        fileStorage: nodeFileStorage,
        dataSourceResolver: localDataSourceResolver,
        httpClient: electronHttpClient,
        httpClientFactory: electronHttpClientFactory,
        addonReloader: addonLoader,
        transactionBoundary,
        systemEventEmitter: addonLoader.systemEventEmitter,
      }

      containerBuilder
        .addPlatformDependencies(platformDeps)
        .addScoped<IHandlersScope>({
          sessionHandler: SessionHandler,
          tasksHandler: TasksHandler,
          timeEntriesHandler: TimeEntriesHandler,
          tokenHandler: TokenHandler,
          workspacesHandler: WorkspacesHandler,
          addonsHandler: AddonsHandler,
          licensingHandler: LicensingHandler,
          metadataHandler: MetadataHandler,
          updaterHandler: UpdaterHandler,
        })

      serviceProvider.include({ addonLoader, updaterService })

      const licensingFacade =
        serviceProvider.resolve<ILicensingFacade>('licensingFacade')
      globalLicensingFacade = licensingFacade
      addonLoader.setLicensingFacade(licensingFacade)

      if (pendingActivationKey) {
        const keyToActivate = pendingActivationKey
        pendingActivationKey = null
        void processActivationDeepLinkKey(keyToActivate)
      }

      if (process.env.NODE_ENV !== 'test') {
        const refreshedLicense = await licensingFacade.refreshLicense()
        if (refreshedLicense.isFailure())
          console.warn(
            '[Licensing] Renovação pendente:',
            refreshedLicense.failure.messageKey,
          )
      }

      try {
        const addonsFacade =
          serviceProvider.resolve<IAddonsFacade>('addonsFacade')
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

      openIpcRoutes(serviceProvider, nativeOverlay)

      electronApp.setAppUserModelId('com.electron')

      app.on('browser-window-created', (event, browserWindow) => {
        if (!event) return
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

        browserWindow.webContents.on('will-navigate', (navEvent, url) => {
          if (url.startsWith('http://') || url.startsWith('https://')) {
            const isDevServer =
              is.dev &&
              process.env['ELECTRON_RENDERER_URL'] &&
              url.startsWith(process.env['ELECTRON_RENDERER_URL'])

            if (!isDevServer) {
              navEvent.preventDefault()
              shell.openExternal(url)
            }
          }
        })

        browserWindow.webContents.on(
          'before-input-event',
          (inputEvent, input) => {
            if (!inputEvent) return
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
          },
        )
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

      const getTargetWorkspaceId = async (): Promise<string | undefined> => {
        try {
          const settings = getSettings()
          if (!settings.lastSelectedWorkspaceId) return undefined
          const workspaceResult = await workspacesRepository.getById(
            settings.lastSelectedWorkspaceId,
          )
          const workspace = workspaceResult.success
          if (!workspace || workspace.status !== 'configured') return undefined
          return workspace.id
        } catch {
          return undefined
        }
      }

      tray = createTray(
        () => secondaryWindow,
        async () => {
          const targetWsId = await getTargetWorkspaceId()
          createSecondaryWindow(targetWsId)
        },
      )
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        await runtimeWindow.loadURL(
          `${process.env['ELECTRON_RENDERER_URL']}#/runtime`,
        )
      }
      if (!is.dev || !process.env['ELECTRON_RENDERER_URL']) {
        await runtimeWindow.loadFile(
          join(__dirname, '../renderer/index.html'),
          {
            hash: '/runtime',
          },
        )
      }
      const runtimeReady = await localRuntime.whenReady()
      if (!runtimeReady)
        console.error(
          '[LocalRuntime] Executor did not become ready before startup deadline',
        )
      createWindow()
      if (
        process.env.NODE_ENV !== 'test' ||
        process.env.MR_TICK_OPEN_WIDGET_IN_TEST === 'true'
      ) {
        const targetWsId = await getTargetWorkspaceId()
        createSecondaryWindow(targetWsId)
      }

      app.on('activate', () => {
        if (!mainWindow || mainWindow.isDestroyed()) createWindow()
      })

      app.on('before-quit', () => {
        timerRuntime.dispose()
        updaterService.stopAutoCheck()
        if (process.platform === 'win32' && nativeOverlay) {
          try {
            if (typeof nativeOverlay.cleanupOverlay === 'function') {
              nativeOverlay.cleanupOverlay()
            }
          } catch (err) {
            console.error(
              '[Mr-tick Core] Erro ao liberar overlay no quit:',
              err,
            )
          }
        }
        if (tray) {
          tray.destroy()
          tray = null
        }
      })
    })
    .catch((err) => {
      console.error('STARTUP_ERROR_CAUGHT:', err)
    })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
