import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SQLiteConnectionReservationRepository,
  SQLiteWorkspacesRepository,
} from '@mr-tick/adapters/data'
import { KeytarCredentialsVault } from '@mr-tick/adapters/tools'
import { CredentialReferenceFactory } from '@mr-tick/application'
import { Workspace } from '@mr-tick/domain'
import {
  _electron as electronLauncher,
  type ElectronApplication,
  expect,
  type Page,
  test as baseTest,
} from '@playwright/test'

import seedWorkspaces from './seed-workspaces.json' with { type: 'json' }

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
  cleanDirectoryIfExists(join(userDataPath, 'addons'))
  cleanDirectoryIfExists(join(userDataPath, 'linked-audit-source'))
  cleanDirectoryIfExists(join(userDataPath, 'addon-settings'))
  for (const name of ['workspaces.sqlite', 'workspaces.sqlite3']) {
    for (const ext of ['', '-wal', '-shm', '-journal']) {
      const file = join(userDataPath, `${name}${ext}`)
      if (existsSync(file)) {
        try {
          rmSync(file, { force: true })
        } catch {
          // Silencia se arquivo estiver em uso
        }
      }
    }
  }
}

async function ensureSeedWorkspaces(userDataPath: string): Promise<void> {
  const targetWorkspacesFile = join(userDataPath, 'workspaces.json')

  mkdirSync(userDataPath, { recursive: true })
  const seedPath = resolve(currentDir, 'seed-workspaces.json')
  copyFileSync(seedPath, targetWorkspacesFile)

  const repo = new SQLiteWorkspacesRepository(userDataPath)
  const reservationRepo = new SQLiteConnectionReservationRepository(
    userDataPath,
  )
  const vault = new KeytarCredentialsVault()
  for (const rawWs of seedWorkspaces.workspaces) {
    const ws = Workspace.hydrate({
      id: rawWs.id,
      name: rawWs.name,
      description: rawWs.description || undefined,
      avatarUrl: rawWs.avatarUrl || undefined,
      status: rawWs.status === 'configured' ? 'configured' : 'draft',
      connections: rawWs.connections.map((c) => ({
        id: c.id,
        status:
          c.status === 'connected'
            ? 'connected'
            : c.status === 'archived'
              ? 'archived'
              : 'disconnected',
        addonId: c.addonId,
        connectionProfileId: c.connectionProfileId,
        cardinality: c.cardinality === 'single' ? 'single' : 'multi',
        generation: c.generation,
        authorizations:
          c.status === 'connected'
            ? [
                {
                  authorizationId: `seed-auth-${c.id}`,
                  authorizationRole: 'primary',
                  authProfileId: c.connectionProfileId,
                  credentialReferenceId: CredentialReferenceFactory.create({
                    ownerId: c.addonId,
                    workspaceId: rawWs.id,
                    connectionId: c.id,
                    authorizationId: `seed-auth-${c.id}`,
                  }).id,
                  identity: {
                    kind: 'human',
                    providerId: 'fake',
                    tenantId: 'fake.mr-tick-app.local',
                    providerSubjectId: '1',
                    displayName: 'Alex Silva',
                  },
                  generation: 1,
                  status: 'active',
                  createdAt: rawWs.createdAt,
                  updatedAt: rawWs.updatedAt,
                },
              ]
            : [],
        ...(c.status === 'connected'
          ? {
              authorizationId: `seed-auth-${c.id}`,
              identity: {
                kind: 'human',
                providerId: 'fake',
                tenantId: 'fake.mr-tick-app.local',
                providerSubjectId: '1',
                displayName: 'Alex Silva',
              },
              config: c.config,
            }
          : {}),
      })),
      createdAt: new Date(rawWs.createdAt),
      updatedAt: new Date(rawWs.updatedAt),
    })
    for (const c of rawWs.connections) {
      await reservationRepo.reserveConnectionSlot({
        reservationId: `seed-reservation-${c.id}`,
        workspaceId: rawWs.id,
        addonId: c.addonId,
        connectionProfileId: c.connectionProfileId,
        connectionId: c.id,
        cardinality: c.cardinality === 'single' ? 'single' : 'multi',
        default: true,
      })
      if (c.status === 'connected') {
        await vault.writeCredential(
          CredentialReferenceFactory.create({
            ownerId: c.addonId,
            workspaceId: rawWs.id,
            connectionId: c.id,
            authorizationId: `seed-auth-${c.id}`,
          }),
          JSON.stringify({ apiKey: 'fake-api-key' }),
        )
      }
    }
    const createRes = await repo.create(ws)
    if (createRes.isFailure()) {
      console.error('SEED_WORKSPACE_CREATE_FAILED:', createRes.failure)
    }
  }
  await reservationRepo.close()
  await repo.close()
}

function ensureTestAddon(
  userDataPath: string,
  includePendingWorkArchiveProbe: boolean,
  includeSingleCardinalityProbe: boolean,
): void {
  const addonsDir = join(userDataPath, 'addons')
  const targetAddonDir = join(addonsDir, 'mr-tick-datasource-fake')
  const sourceAddonDir = resolve(
    desktopRoot,
    '../../dev-addons/datasource-fake',
  )

  if (!existsSync(sourceAddonDir)) return

  mkdirSync(addonsDir, { recursive: true })

  if (includePendingWorkArchiveProbe) {
    const probeAddonId = 'connection-pending-work-probe'
    const probeAddonDir = join(addonsDir, probeAddonId)
    const probeDistDir = join(probeAddonDir, 'dist')
    const manifest = readFileSync(join(sourceAddonDir, 'manifest.yaml'), 'utf8')
    const bundle = readFileSync(
      join(sourceAddonDir, 'dist', 'index.js'),
      'utf8',
    )
    const addonIdLine = 'id: mr-tick-datasource-fake'
    const registrationAnchor =
      'console.log("\\u{1F7E2} [FakeDataSourceAddon] Registrando FakeDataSource...");'
    const probeCommand = `\n    context.contributions.commands.register("pending-work:archive-connection", async (scope) => {\n      const result = await context.core.connections.archive(scope);\n      if (result.isFailure()) return { ok: false, error: result.failure.messageKey, statusCode: result.failure.statusCode };\n      return { ok: true };\n    });`
    if (!manifest.includes(addonIdLine) || !bundle.includes(registrationAnchor))
      throw new Error('PENDING_WORK_ARCHIVE_PROBE_ANCHOR_MISSING')
    cleanDirectoryIfExists(probeAddonDir)
    cpSync(sourceAddonDir, probeAddonDir, { recursive: true })
    writeFileSync(
      join(probeAddonDir, 'manifest.yaml'),
      manifest.replace(addonIdLine, `id: ${probeAddonId}`),
    )
    writeFileSync(
      join(probeDistDir, 'index.js'),
      bundle.replace(
        registrationAnchor,
        `${registrationAnchor}${probeCommand}`,
      ),
    )
  }

  if (includeSingleCardinalityProbe) {
    const probeAddonId = 'connection-cardinality-e2e'
    const probeProfileId = 'single-primary'
    const probeAddonDir = join(addonsDir, probeAddonId)
    const probeDistDir = join(probeAddonDir, 'dist')
    const manifest = readFileSync(join(sourceAddonDir, 'manifest.yaml'), 'utf8')
    const bundle = readFileSync(
      join(sourceAddonDir, 'dist', 'index.js'),
      'utf8',
    )
    const addonIdLine = 'id: mr-tick-datasource-fake'
    const originalProfile =
      'connectionProfileId: "fake-main",\n        cardinality: "multi",\n        default: true'
    const targetProfile = `connectionProfileId: "${probeProfileId}",\n        cardinality: "single",\n        default: true`
    if (!manifest.includes(addonIdLine) || !bundle.includes(originalProfile))
      throw new Error('SINGLE_CARDINALITY_PROBE_ANCHOR_MISSING')
    cleanDirectoryIfExists(probeAddonDir)
    cpSync(sourceAddonDir, probeAddonDir, { recursive: true })
    writeFileSync(
      join(probeAddonDir, 'manifest.yaml'),
      manifest.replace(addonIdLine, `id: ${probeAddonId}`),
    )
    writeFileSync(
      join(probeAddonDir, 'package.json'),
      JSON.stringify({ name: probeAddonId, version: '1.0.0', type: 'module' }),
    )
    writeFileSync(
      join(probeDistDir, 'index.js'),
      bundle.replace(originalProfile, targetProfile),
    )
  }

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
  pendingWorkArchiveProbe: boolean
  singleCardinalityProbe: boolean
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
  pendingWorkArchiveProbe: [false, { option: true }],
  singleCardinalityProbe: [false, { option: true }],
  electronApp: async (
    {
      electronNodeEnv,
      runtimeProbeWorkspaceId,
      runtimeProbeConnectionId,
      pendingWorkArchiveProbe,
      singleCardinalityProbe,
    },
    use,
    testInfo,
  ) => {
    const userDataPath = getElectronUserDataPath(testInfo.workerIndex)
    cleanTestStorage(userDataPath)
    await ensureSeedWorkspaces(userDataPath)
    ensureTestAddon(
      userDataPath,
      pendingWorkArchiveProbe,
      singleCardinalityProbe,
    )

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
    if (
      testInfo.file.includes('timerbar-') ||
      testInfo.file.includes('suggestions')
    )
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
