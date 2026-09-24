import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { homedir } from 'node:os'
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

function getElectronUserDataPath(): string {
  const platform = process.platform

  switch (platform) {
    case 'win32': {
      const appData = process.env.APPDATA
      if (appData) return join(appData, 'mr-tick')
      return join(homedir(), 'AppData', 'Roaming', 'mr-tick')
    }
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', 'mr-tick')
    case 'linux': {
      const xdgConfig = process.env.XDG_CONFIG_HOME
      if (xdgConfig) return join(xdgConfig, 'mr-tick')
      return join(homedir(), '.config', 'mr-tick')
    }
    default:
      return join(homedir(), '.config', 'mr-tick')
  }
}

function cleanTestStorage(): void {
  const userDataPath = getElectronUserDataPath()
  const indexedDbPath = join(userDataPath, 'IndexedDB')
  if (!existsSync(indexedDbPath)) return

  try {
    rmSync(indexedDbPath, { recursive: true, force: true })
  } catch {
    // Silencia se o diretório estiver em uso
  }
}

function ensureSeedWorkspaces(): void {
  const userDataPath = getElectronUserDataPath()
  const targetWorkspacesFile = join(userDataPath, 'workspaces.json')

  mkdirSync(userDataPath, { recursive: true })
  const seedPath = resolve(currentDir, 'seed-workspaces.json')
  copyFileSync(seedPath, targetWorkspacesFile)
}

function ensureTestAddon(): void {
  const userDataPath = getElectronUserDataPath()
  const addonsDir = join(userDataPath, 'addons')
  const targetAddonDir = join(addonsDir, 'mr-tick-datasource-fake')
  const sourceAddonDir = resolve(
    desktopRoot,
    '../../src/dev-addons/datasource-fake',
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
}

export const test = baseTest.extend<ElectronTestFixtures>({
  electronApp: async ({}, use, testInfo) => {
    cleanTestStorage()
    ensureSeedWorkspaces()
    ensureTestAddon()

    const isVerbose = process.env.E2E_VERBOSE === 'true'
    const logs: string[] = []

    const app = await electronLauncher.launch({
      args: ['.'],
      cwd: desktopRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        FAKE_DB_IN_MEMORY: 'true',
      },
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
    const window = await electronApp.firstWindow()
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
