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
}

export const test = baseTest.extend<ElectronTestFixtures>({
  electronApp: async ({}, use, testInfo) => {
    const userDataPath = getElectronUserDataPath(testInfo.workerIndex)
    cleanTestStorage(userDataPath)
    ensureSeedWorkspaces(userDataPath)
    ensureTestAddon(userDataPath)

    const isVerbose = process.env.E2E_VERBOSE === 'true'
    const logs: string[] = []

    const app = await electronLauncher.launch({
      args: ['.', '--window-size=1600,900', `--user-data-dir=${userDataPath}`],
      cwd: desktopRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        FAKE_DB_IN_MEMORY: 'true',
        PLAYWRIGHT_TEST: '1',
        MR_TICK_TEST_USER_DATA_DIR: userDataPath,
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
