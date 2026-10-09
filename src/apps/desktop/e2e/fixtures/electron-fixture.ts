import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  _electron as electronLauncher,
  type ElectronApplication,
  expect,
  type Page,
  test as baseTest,
} from '@playwright/test'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDir = dirname(currentFilePath)
const desktopRoot = resolve(currentDir, '../..')

function getElectronUserDataPath(workerIndex: number): string {
  return resolve(
    desktopRoot,
    'test-results',
    'electron-user-data',
    `worker-${workerIndex}`,
  )
}

function cleanDirectoryIfExists(dirPath: string): void {
  if (!existsSync(dirPath)) return
  try {
    rmSync(dirPath, { recursive: true, force: true })
  } catch {
    // Silencia se o diretório estiver em uso
  }
}

function cleanTestStorage(userDataPath: string): void {
  cleanDirectoryIfExists(join(userDataPath, 'IndexedDB'))
  cleanDirectoryIfExists(join(userDataPath, 'Local Storage'))
}

function ensureSeedWorkspaces(userDataPath: string): void {
  const targetWorkspacesFile = join(userDataPath, 'workspaces.json')

  mkdirSync(userDataPath, { recursive: true })
  const seedPath = resolve(currentDir, 'seed-workspaces.json')
  copyFileSync(seedPath, targetWorkspacesFile)
}

function ensureTestAddon(userDataPath: string): void {
  const addonsDir = join(userDataPath, 'addons')
  const targetAddonDir = join(addonsDir, 'mr-tick-datasource-fake')
  const sourceAddonDir = resolve(
    desktopRoot,
    '../../dev-addons/datasource-fake',
  )

  if (!existsSync(sourceAddonDir)) return

  mkdirSync(addonsDir, { recursive: true })

  if (existsSync(targetAddonDir)) {
    try {
      const stat = lstatSync(targetAddonDir)
      if (stat.isSymbolicLink()) return
    } catch {
      // continua para recriar se necessário
    }
  }

  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  try {
    symlinkSync(sourceAddonDir, targetAddonDir, linkType)
  } catch {
    // Silencia se já existir
  }
}

interface ElectronTestFixtures {
  electronApp: ElectronApplication
  page: Page
  electronNodeEnv: string
  runtimeProbeWorkspaceId: string
  runtimeProbeConnectionId: string
}

async function findMainWindow(
  electronApp: ElectronApplication,
): Promise<Page | null> {
  const windows = await electronApp.windows()
  for (const page of windows) {
    const browserWindow = await electronApp.browserWindow(page)
    const isMain = await browserWindow.evaluate(
      (window) => window.windowType === 'main',
    )
    await browserWindow.dispose()
    if (isMain) return page
  }
  return null
}
export const test = baseTest.extend<ElectronTestFixtures>({
  electronNodeEnv: ['test', { option: true }],
  runtimeProbeWorkspaceId: ['', { option: true }],
  runtimeProbeConnectionId: ['', { option: true }],
  electronApp: async (
    { electronNodeEnv, runtimeProbeWorkspaceId, runtimeProbeConnectionId },
    use,
    testInfo,
  ) => {
    const userDataPath = getElectronUserDataPath(testInfo.workerIndex)
    cleanTestStorage(userDataPath)
    ensureSeedWorkspaces(userDataPath)
    ensureTestAddon(userDataPath)

    const isVerbose = process.env.E2E_VERBOSE === 'true'
    const logs: string[] = []
    const appEnv = {
      ...process.env,
      NODE_ENV: electronNodeEnv,
      FAKE_DB_IN_MEMORY: 'true',
      PLAYWRIGHT_TEST: '1',
      MR_TICK_RUNTIME_PROBE_WORKSPACE: runtimeProbeWorkspaceId,
      MR_TICK_RUNTIME_PROBE_CONNECTION: runtimeProbeConnectionId,
      MR_TICK_TEST_USER_DATA_DIR: userDataPath,
    }
    delete appEnv.MR_TICK_OPEN_WIDGET_IN_TEST
    if (testInfo.file.includes('timerbar-'))
      appEnv.MR_TICK_OPEN_WIDGET_IN_TEST = 'true'

    const app = await electronLauncher.launch({
      args: ['.', '--window-size=1600,900', `--user-data-dir=${userDataPath}`],
      cwd: desktopRoot,
      env: appEnv,
    })

    app.process().stdout?.on('data', (data: Buffer) => {
      const text = data.toString().trim()
      if (!text) return
      if (isVerbose) console.log(`[MAIN]: ${text}`)
      logs.push(`[MAIN]: ${text}`)
    })
    app.process().stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim()
      if (!text) return
      if (isVerbose) console.error(`[MAIN ERROR]: ${text}`)
      logs.push(`[MAIN ERROR]: ${text}`)
    })

    app.on('window', async (win) => {
      const url = win.url()
      if (isVerbose) console.log(`[WIN OPENED]: ${url}`)
      logs.push(`[WIN OPENED]: ${url}`)
      win.on('console', (msg) => {
        const text = msg.text()
        const line = `[WIN CONSOLE ${msg.type()}]: ${text}`
        if (isVerbose) console.log(line)
        logs.push(line)
      })
      win.on('pageerror', (err) => {
        const line = `[WIN UNCAUGHT]: ${err.stack ?? err.message}`
        if (isVerbose) console.error(line)
        logs.push(line)
      })
      win.on('close', () => {
        if (isVerbose) console.log(`[WIN CLOSED]: ${url}`)
        logs.push(`[WIN CLOSED]: ${url}`)
      })
    })

    await use(app)

    if (testInfo.status !== testInfo.expectedStatus && logs.length > 0) {
      await testInfo.attach('main-process-logs', {
        body: logs.join('\n'),
        contentType: 'text/plain',
      })
    }

    await app.close()
  },

  page: async ({ electronApp }, use, testInfo) => {
    const isVerbose = process.env.E2E_VERBOSE === 'true'
    const rendererLogs: string[] = []
    await expect
      .poll(async () => (await findMainWindow(electronApp)) !== null, {
        timeout: 30000,
      })
      .toBe(true)
    const window = await findMainWindow(electronApp)
    if (!window) throw new Error('MAIN_WINDOW_NOT_FOUND')
    await window.setViewportSize({ width: 1600, height: 900 })
    await window.context().setOffline(false)

    window.on('console', (msg) => {
      const line = `[RENDERER ${msg.type()}]: ${msg.text()}`
      if (isVerbose) console.log(line)
      rendererLogs.push(line)
    })
    window.on('pageerror', (err) => {
      const line = `[RENDERER UNCAUGHT]: ${err.stack ?? err.message}`
      if (isVerbose) console.error(line)
      rendererLogs.push(line)
    })

    await window.waitForLoadState('domcontentloaded')
    try {
      await use(window)
    } finally {
      if (
        testInfo.status !== testInfo.expectedStatus &&
        rendererLogs.length > 0
      ) {
        await testInfo.attach('renderer-logs', {
          body: rendererLogs.join('\n'),
          contentType: 'text/plain',
        })
      }
      try {
        await window.context().setOffline(false)
      } catch {
        // Silencia se o contexto já estiver fechado
      }
    }
  },
})

export { expect }
