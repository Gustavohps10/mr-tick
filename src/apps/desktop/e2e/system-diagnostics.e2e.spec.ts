import { appendFile, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ElectronApplication, Page } from '@playwright/test'

import { expect, test } from './fixtures/electron-fixture'
import { fakeSyncDiagnostics } from './fixtures/fake-sync-observer'
import seedWorkspaces from './fixtures/seed-workspaces.json' with { type: 'json' }

const currentFilePath = fileURLToPath(import.meta.url)
const currentDir = dirname(currentFilePath)
const desktopRoot = resolve(currentDir, '..')

async function findRuntimeWindow(
  electronApp: ElectronApplication,
): Promise<Page | null> {
  for (const page of await electronApp.windows()) {
    const browserWindow = await electronApp.browserWindow(page)
    const isRuntime = await browserWindow.evaluate(
      (window) => window.windowType === 'runtime',
    )
    await browserWindow.dispose()
    if (isRuntime) return page
  }
  return null
}

function getTargetWorkspaceScope() {
  const workspace = seedWorkspaces.workspaces.find((w) => w.name === 'TESTE')
  if (!workspace) {
    throw new Error('TARGET_TESTE_WORKSPACE_NOT_FOUND_IN_SEED')
  }
  const connection = workspace.connections.find(
    (c) => c.addonId === 'mr-tick-datasource-fake',
  )
  if (!connection) {
    throw new Error('TARGET_FAKE_CONNECTION_NOT_FOUND_IN_SEED')
  }
  return { workspace, connection }
}

test.describe('E2E - Saúde do Sistema e Diagnóstico de Runtime (Bloco C)', () => {
  test('cenario saudavel: executa verificacao manual, valida envelopes reais, leitura operacional e responsividade visual', async ({
    page,
  }, testInfo) => {
    const { workspace } = getTargetWorkspaceScope()

    // 1. Obtém métricas de sincronização antes da verificação (não indução de escrita)
    const syncBefore = await fakeSyncDiagnostics(page)

    // 2. Aguarda a inicialização e abre o diálogo global de configurações pelo app-rail
    const settingsBtn = page.locator('[data-testid="app-rail-settings-btn"]')
    await expect(settingsBtn).toBeVisible({ timeout: 15000 })
    await settingsBtn.click()

    const settingsDialog = page.locator(
      '[data-testid="global-settings-dialog"]',
    )
    await expect(settingsDialog).toBeVisible({ timeout: 10000 })

    // 3. Navega para a aba "Dados e Diagnóstico"
    const systemDataNavTab = page.locator(
      '[data-testid="settings-nav-tab-system-data"]',
    )
    await expect(systemDataNavTab).toBeVisible({ timeout: 5000 })
    await systemDataNavTab.click()

    const systemDataTab = page.locator(
      '[data-testid="system-data-settings-tab"]',
    )
    await expect(systemDataTab).toBeVisible({ timeout: 10000 })

    // Captura snapshot baseline antes do clique em "Verificar agora"
    const baselineSnapshotResponse = await page.evaluate(async () => {
      return await window.api.diagnostics.getSnapshot()
    })
    expect(baselineSnapshotResponse.isSuccess).toBe(true)
    const baselineSnapshot = baselineSnapshotResponse.data
    if (!baselineSnapshot) {
      throw new Error('BASELINE_SNAPSHOT_UNDEFINED')
    }
    const baselineEmittedMs = Date.parse(baselineSnapshot.emittedAt)

    // 4. Executa "Verificar agora" para rodar o ciclo completo de probes reais
    const checkNowBtn = page.locator(
      '[data-testid="diagnostics-check-now-btn"]',
    )
    await expect(checkNowBtn).toBeVisible({ timeout: 5000 })
    await checkNowBtn.click()

    // Aguarda conclusão do ciclo de checagens (botão volta ao estado desabilitado=false)
    await expect(checkNowBtn).not.toHaveAttribute('disabled', {
      timeout: 15000,
    })
    await expect(checkNowBtn).toContainText('Verificar agora')

    // 5. Confere não indução de escrita pelo diagnóstico
    const syncAfter = await fakeSyncDiagnostics(page)
    expect(syncAfter.createAttempts).toBe(syncBefore.createAttempts)
    expect(syncAfter.updateAttempts).toBe(syncBefore.updateAttempts)
    expect(syncAfter.deleteAttempts).toBe(syncBefore.deleteAttempts)

    // 6. Consulta o snapshot REAL retornado pela API para obter dados e IDs dinâmicos
    const snapshotResponse = await page.evaluate(async () => {
      return await window.api.diagnostics.getSnapshot()
    })
    expect(snapshotResponse.isSuccess).toBe(true)
    const snapshot = snapshotResponse.data
    if (!snapshot) {
      throw new Error('SNAPSHOT_DATA_UNDEFINED')
    }

    // Exige mesmo sessionId e observedGeneration, e revisão estritamente posterior
    expect(snapshot.sessionId).toBe(baselineSnapshot.sessionId)
    expect(snapshot.observedGeneration).toBe(
      baselineSnapshot.observedGeneration,
    )
    expect(snapshot.revision).toBeGreaterThan(baselineSnapshot.revision)

    // 7. Valida Ciclo de Vida e Provas Reais no UI
    const readyBadge = page.locator('[data-testid="lifecycle-badge-ready"]')
    await expect(readyBadge).toBeVisible()
    await expect(readyBadge).toContainText('Pronto')

    const generationElement = page.locator(
      '[data-testid="lifecycle-generation"]',
    )
    await expect(generationElement).toBeVisible()
    const observedGen = await generationElement.textContent()
    expect(observedGen).toBe(snapshot.observedGeneration)

    const sessionElement = page.locator('[data-testid="lifecycle-session-id"]')
    await expect(sessionElement).toBeVisible()
    const sessionId = await sessionElement.textContent()
    expect(sessionId).toBe(snapshot.sessionId)

    // 8. Valida checks essenciais reais usando dados do snapshot
    // Prova que foram coletados no ciclo disparado (finishedAt >= baselineEmittedMs)
    // Check de processo principal / dispatcher
    const mainCheck = snapshot.checks.find(
      (candidate) =>
        candidate.source === 'main' &&
        candidate.capability === 'dispatcher.lifecycle',
    )
    expect(mainCheck).toBeDefined()
    expect(mainCheck?.status).toBe('pass')
    if (mainCheck?.status === 'pass') {
      expect(mainCheck.provenOperation).toBeTruthy()
      expect(Date.parse(mainCheck.finishedAt)).toBeGreaterThanOrEqual(
        baselineEmittedMs,
      )
    }
    const mainCheckLocator = page.locator(
      `[data-testid="diagnostic-check-${mainCheck?.id}"]`,
    )
    await expect(mainCheckLocator).toBeVisible()

    // Check de leitura de metadados SQLite
    const metadataCheck = snapshot.checks.find(
      (candidate) =>
        candidate.source === 'metadata' &&
        candidate.capability === 'metadata.read',
    )
    expect(metadataCheck).toBeDefined()
    expect(metadataCheck?.status).toBe('pass')
    if (metadataCheck?.status === 'pass') {
      expect(metadataCheck.provenOperation).toBeTruthy()
      expect(Date.parse(metadataCheck.finishedAt)).toBeGreaterThanOrEqual(
        baselineEmittedMs,
      )
    }
    const metadataCheckLocator = page.locator(
      `[data-testid="diagnostic-check-${metadataCheck?.id}"]`,
    )
    await expect(metadataCheckLocator).toBeVisible()

    // Check de leitura operacional do workspace alvo explícito
    const workspaceOpCheck = snapshot.checks.find(
      (candidate) =>
        candidate.scope.type === 'workspace' &&
        candidate.scope.workspaceId === workspace.id &&
        candidate.capability === 'storage.read',
    )
    expect(workspaceOpCheck).toBeDefined()
    expect(workspaceOpCheck?.status).toBe('pass')
    if (workspaceOpCheck?.status === 'pass') {
      expect(workspaceOpCheck.provenOperation).toBeTruthy()
      expect(Date.parse(workspaceOpCheck.finishedAt)).toBeGreaterThanOrEqual(
        baselineEmittedMs,
      )
    }
    const workspaceCheckLocator = page.locator(
      `[data-testid="diagnostic-check-${workspaceOpCheck?.id}"]`,
    )
    await expect(workspaceCheckLocator).toBeVisible()

    // 9. Valida Armazenamentos por Capacidade Funcional
    const storageCard = page.locator('[data-testid="system-storage-card"]')
    await expect(storageCard).toBeVisible()

    const metadataStorage = snapshot.storages.find(
      (candidate) => candidate.role === 'metadata',
    )
    expect(metadataStorage).toBeDefined()
    expect(metadataStorage?.technology).toBeTruthy()
    const metadataStorageItem = page.locator(
      `[data-testid="storage-item-${metadataStorage?.id}"]`,
    )
    await expect(metadataStorageItem).toBeVisible()

    // 10. Valida Armazenamento Operacional por Workspace
    const workspaceStatusItem = page.locator(
      `[data-testid="workspace-status-item-${workspace.id}"]`,
    )
    await expect(workspaceStatusItem).toBeVisible()

    // Confere que os contadores e status de replicação estão presentes
    await expect(
      workspaceStatusItem.locator('[data-testid="ws-pending-writes"]'),
    ).toBeVisible()
    await expect(
      workspaceStatusItem.locator('[data-testid="ws-receipts-count"]'),
    ).toBeVisible()
    await expect(
      workspaceStatusItem.locator('[data-testid="ws-tombstones-count"]'),
    ).toBeVisible()
    await expect(
      workspaceStatusItem.locator('[data-testid="ws-replication-status"]'),
    ).toBeVisible()

    // 11. Validação visual e registro de screenshot em janela normal (1600x900)
    await page.setViewportSize({ width: 1600, height: 900 })
    const normalScreenshot = await page.screenshot()
    await testInfo.attach('system-diagnostics-healthy-1600x900.png', {
      body: normalScreenshot,
      contentType: 'image/png',
    })

    // 12. Validação de layout responsivo em janela menor (1024x768)
    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(systemDataTab).toBeVisible()
    const smallScreenshot = await page.screenshot()
    await testInfo.attach('system-diagnostics-healthy-1024x768.png', {
      body: smallScreenshot,
      contentType: 'image/png',
    })

    // Restaura tamanho padrão do viewport
    await page.setViewportSize({ width: 1600, height: 900 })
  })

  test('cenario de startup do executor: falha 503 no handler de listagem exibe causa explicita e preserva metadata consultavel', async ({
    electronApp,
    page,
  }, testInfo) => {
    // 1. Localiza a Page oculta do runtime executor
    await expect
      .poll(async () => (await findRuntimeWindow(electronApp)) !== null)
      .toBe(true)
    const runtimePage = await findRuntimeWindow(electronApp)
    if (!runtimePage) {
      throw new Error('RUNTIME_WINDOW_NOT_FOUND')
    }

    // Identidade das janelas antes do reload
    const mainWindowBefore = await electronApp.browserWindow(page)
    const mainWindowIdBefore = await mainWindowBefore.evaluate((w) => w.id)
    const mainWindowTypeBefore = await mainWindowBefore.evaluate(
      (w) => w.windowType,
    )
    await mainWindowBefore.dispose()

    const runtimeWindowBefore = await electronApp.browserWindow(runtimePage)
    const runtimeWindowIdBefore = await runtimeWindowBefore.evaluate(
      (w) => w.id,
    )
    const runtimeWindowTypeBefore = await runtimeWindowBefore.evaluate(
      (w) => w.windowType,
    )
    await runtimeWindowBefore.dispose()
    const runtimeUrlBefore = runtimePage.url()

    expect(mainWindowIdBefore).not.toBe(runtimeWindowIdBefore)
    expect(mainWindowTypeBefore).toBe('main')
    expect(runtimeWindowTypeBefore).toBe('runtime')

    // 2. Abre o diálogo de configurações e navega para a aba Dados e Diagnóstico ANTES de injetar o 503
    const settingsBtn = page.locator('[data-testid="app-rail-settings-btn"]')
    await expect(settingsBtn).toBeVisible({ timeout: 15000 })
    await settingsBtn.click()

    const systemDataNavTab = page.locator(
      '[data-testid="settings-nav-tab-system-data"]',
    )
    await expect(systemDataNavTab).toBeVisible({ timeout: 5000 })
    await systemDataNavTab.click()

    const systemDataTab = page.locator(
      '[data-testid="system-data-settings-tab"]',
    )
    await expect(systemDataTab).toBeVisible({ timeout: 10000 })

    // Obtém geração inicial
    const initialSnapshotResponse = await page.evaluate(async () => {
      return await window.api.diagnostics.getSnapshot()
    })
    const initialGeneration =
      initialSnapshotResponse.data?.dispatcher.generation

    // 3. Substitui SOMENTE no processo isolado do Electron o handler WORKSPACES_GET_ALL por 503
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('WORKSPACES_GET_ALL')
      ipcMain.handle('WORKSPACES_GET_ALL', async () => ({
        isSuccess: false,
        statusCode: 503,
        error: 'DISPATCHER_STARTUP_FAILED_WORKSPACE_503',
      }))
    })

    // 4. Recarrega a Page do runtime (e NÃO a UI principal) para que owner.start() real execute e encontre o 503
    await runtimePage.reload({ waitUntil: 'domcontentloaded' })

    // Confere IDs e tipos das janelas após o reload, conferindo que a URL da runtime continua esperada
    const mainWindowAfter = await electronApp.browserWindow(page)
    const mainWindowIdAfter = await mainWindowAfter.evaluate((w) => w.id)
    const mainWindowTypeAfter = await mainWindowAfter.evaluate(
      (w) => w.windowType,
    )
    await mainWindowAfter.dispose()

    const runtimeWindowAfter = await electronApp.browserWindow(runtimePage)
    const runtimeWindowIdAfter = await runtimeWindowAfter.evaluate((w) => w.id)
    const runtimeWindowTypeAfter = await runtimeWindowAfter.evaluate(
      (w) => w.windowType,
    )
    await runtimeWindowAfter.dispose()

    expect(mainWindowIdAfter).toBe(mainWindowIdBefore)
    expect(mainWindowTypeAfter).toBe('main')
    expect(runtimeWindowTypeAfter).toBe('runtime')
    expect(runtimePage.url()).toBe(runtimeUrlBefore)

    // Confere que a page principal continua aberta e respondendo à API diretamente
    const pingResponse = await page.evaluate(async () => {
      return await window.api.diagnostics.getSnapshot()
    })
    expect(pingResponse.isSuccess).toBe(true)

    // 5. Confere que a falha de startup do dispatcher é exposta de forma explícita na UI principal viva
    const failureBanner = page.locator(
      '[data-testid="lifecycle-startup-failure-banner"]',
    )
    await expect(failureBanner).toBeVisible({ timeout: 15000 })
    await expect(failureBanner).toContainText(
      'DISPATCHER_STARTUP_FAILED_WORKSPACE_503',
    )

    // 6. Confere nova geração e detalhes da falha no snapshot real da API
    const postFailureSnapshot = await page.evaluate(async () => {
      return await window.api.diagnostics.getSnapshot()
    })
    expect(postFailureSnapshot.isSuccess).toBe(true)
    const failureData = postFailureSnapshot.data
    expect(failureData).toBeDefined()
    expect(failureData?.dispatcher.generation).not.toBe(initialGeneration)
    expect(failureData?.dispatcher.lastStartupFailure?.kind).toBe('explicit')
    expect(failureData?.dispatcher.lastStartupFailure?.stage).toBe(
      'owner.start',
    )
    expect(failureData?.dispatcher.lastStartupFailure?.messageKey).toBe(
      'DISPATCHER_STARTUP_FAILED_WORKSPACE_503',
    )

    // 7. Confere que o diagnóstico de Metadata SQLite continua consultável e visível
    const metadataStorage = failureData?.storages.find(
      (candidate) => candidate.role === 'metadata',
    )
    expect(metadataStorage).toBeDefined()
    const metadataStorageItem = page.locator(
      `[data-testid="storage-item-${metadataStorage?.id}"]`,
    )
    await expect(metadataStorageItem).toBeVisible()

    // 8. Captura de evidência visual do estado com falha de startup
    const failureScreenshot = await page.screenshot()
    await testInfo.attach('system-diagnostics-startup-failure.png', {
      body: failureScreenshot,
      contentType: 'image/png',
    })
  })

  test('cenario de autorizacao: chamada privilegiada de sender incorreto nao altera geracao nem saude do executor', async ({
    electronApp,
    page,
  }) => {
    // 1. Identidade das janelas principal e runtime: confere IDs distintos e windowTypes corretos
    const mainWindow = await electronApp.browserWindow(page)
    const mainWindowId = await mainWindow.evaluate((w) => w.id)
    const mainWindowType = await mainWindow.evaluate((w) => w.windowType)
    await mainWindow.dispose()

    await expect
      .poll(async () => (await findRuntimeWindow(electronApp)) !== null)
      .toBe(true)
    const runtimePage = await findRuntimeWindow(electronApp)
    if (!runtimePage) {
      throw new Error('RUNTIME_WINDOW_NOT_FOUND')
    }

    const runtimeWindow = await electronApp.browserWindow(runtimePage)
    const runtimeWindowId = await runtimeWindow.evaluate((w) => w.id)
    const runtimeWindowType = await runtimeWindow.evaluate((w) => w.windowType)
    await runtimeWindow.dispose()

    expect(mainWindowId).not.toBe(runtimeWindowId)
    expect(mainWindowType).toBe('main')
    expect(runtimeWindowType).toBe('runtime')

    // 2. Consulta snapshot legítimo (baseline) antes da tentativa
    const initialSnapshotResponse = await page.evaluate(async () => {
      return await window.api.diagnostics.getSnapshot()
    })
    expect(initialSnapshotResponse.isSuccess).toBe(true)
    const baseline = initialSnapshotResponse.data
    expect(baseline).toBeTruthy()
    const baselineGeneration = baseline?.dispatcher.generation
    const baselineState = baseline?.dispatcher.state
    const baselineFailure = baseline?.dispatcher.lastStartupFailure
    if (!baselineGeneration) {
      throw new Error('CURRENT_GENERATION_NOT_FOUND')
    }

    // 3. Tenta invocar 'local-runtime:failed' a partir da janela principal não autorizada
    // Utiliza window.electron.ipcRenderer com pacote completo e geração atual
    const unauthorizedFailureAttempt = await page.evaluate(
      async (generation) => {
        return await window.electron.ipcRenderer.invoke(
          'local-runtime:failed',
          {
            generation,
            error: {
              messageKey: 'UNAUTHORIZED_SPOOF_FAIL',
              statusCode: 500,
            },
            stage: 'startup',
          },
        )
      },
      baselineGeneration,
    )
    // O handler recusa sender de janela não autorizada retornando explicitamente null
    expect(unauthorizedFailureAttempt).toBeNull()

    // 4. Tenta invocar 'local-runtime:ready' a partir da janela principal não autorizada
    const unauthorizedReadyAttempt = await page.evaluate(async (generation) => {
      return await window.electron.ipcRenderer.invoke(
        'local-runtime:ready',
        generation,
      )
    }, baselineGeneration)
    // O handler recusa sender de janela não autorizada retornando explicitamente null
    expect(unauthorizedReadyAttempt).toBeNull()

    // 5. Confere que state, generation e lastStartupFailure permanecem idênticos ao baseline
    const postSnapshotResponse = await page.evaluate(async () => {
      return await window.api.diagnostics.getSnapshot()
    })
    expect(postSnapshotResponse.isSuccess).toBe(true)
    const postSnapshot = postSnapshotResponse.data
    expect(postSnapshot?.dispatcher.generation).toBe(baselineGeneration)
    expect(postSnapshot?.dispatcher.state).toBe(baselineState)
    expect(postSnapshot?.dispatcher.lastStartupFailure).toEqual(baselineFailure)
  })

  test('cenario de relatorio: gera relatorio sanitizado, preserva snapshot e assegura ausencia de credenciais confidenciais', async ({
    electronApp,
    page,
  }, testInfo) => {
    // 1. Consulta o snapshot atual antes de gerar relatório
    const beforeSnapshotResponse = await page.evaluate(async () => {
      return await window.api.diagnostics.getSnapshot()
    })
    expect(beforeSnapshotResponse.isSuccess).toBe(true)
    const beforeSnapshot = beforeSnapshotResponse.data
    expect(beforeSnapshot).toBeTruthy()
    const sessionId = beforeSnapshot?.sessionId
    if (!sessionId) {
      throw new Error('SESSION_ID_NOT_FOUND_IN_SNAPSHOT')
    }

    // 2. Controle positivo de sanitização:
    // Obtém app.getPath('userData') e valida path exato da fixture worker antes de escrever
    const userData = await electronApp.evaluate(({ app }) =>
      app.getPath('userData'),
    )
    const expectedUserData = resolve(
      desktopRoot,
      'test-results',
      'electron-user-data',
      `worker-${testInfo.workerIndex}`,
    )
    expect(resolve(userData)).toBe(expectedUserData)

    const diagnosticsDir = join(userData, 'diagnostics')
    const currentJournalFile = join(diagnosticsDir, 'boot-current.jsonl')

    // Linha JSON válida contendo stage 'e2e:privacy-probe', mensagem com chave e propriedade EXTRA sintética
    const syntheticExtraMarker = 'SYNTHETIC_EXTRA_SECRET_PROPERTY_MARKER_9988'
    const syntheticPayload = {
      sequence: 9999,
      sessionId,
      origin: 'boot',
      level: 'warn',
      stage: 'e2e:privacy-probe',
      message: 'Probe event with apiKey=fake-api-key and confidential token',
      timestamp: new Date().toISOString(),
      extraPropertyShouldBeDropped: syntheticExtraMarker,
    }

    // Acrescenta a linha no boot-current.jsonl do perfil isolado do teste
    await appendFile(
      currentJournalFile,
      JSON.stringify(syntheticPayload) + '\n',
      'utf-8',
    )

    // Confere que o arquivo bruto em disco realmente contém os marcadores antes da geração
    const rawFileContent = await readFile(currentJournalFile, 'utf-8')
    expect(rawFileContent).toContain('apiKey=fake-api-key')
    expect(rawFileContent).toContain(syntheticExtraMarker)

    // 3. Gera o relatório sanitizado através da API real exposta
    const reportResponse = await page.evaluate(async () => {
      return await window.api.diagnostics.generateReport()
    })

    expect(reportResponse.isSuccess).toBe(true)
    expect(reportResponse.statusCode).toBe(200)
    expect(reportResponse.data).toBeTruthy()

    const report = reportResponse.data
    if (!report) {
      throw new Error('SANITIZED_REPORT_DATA_UNDEFINED')
    }

    // 4. Valida campos do envelope de relatório
    expect(report.formatVersion).toBe('1.0')
    expect(report.sessionId).toBe(beforeSnapshot?.sessionId)
    expect(report.platform).toBeTruthy()
    expect(report.appVersion).toBeTruthy()
    expect(Array.isArray(report.bootJournal)).toBe(true)
    expect(report.snapshot).toBeTruthy()

    // 5. Controle positivo de sanitização comprovado:
    // Localiza o evento sintético no bootJournal do relatório
    const syntheticEventInReport = report.bootJournal.find(
      (ev) => ev.stage === 'e2e:privacy-probe',
    )
    expect(syntheticEventInReport).toBeDefined()
    // Exige presença do marcador [REDACTED] na mensagem
    expect(syntheticEventInReport?.message).toContain('[REDACTED]')
    // Exige ausência total do segredo bruto
    expect(syntheticEventInReport?.message).not.toContain('fake-api-key')
    // Exige ausência total da propriedade EXTRA
    const eventRecord = syntheticEventInReport
    if (eventRecord) {
      expect('extraPropertyShouldBeDropped' in eventRecord).toBe(false)
    }

    // Validação geral do relatório serializado: nenhum segredo ou propriedade extra vazou
    const serializedReport = JSON.stringify(report)
    expect(serializedReport).not.toContain('fake-api-key')
    expect(serializedReport).not.toContain(syntheticExtraMarker)
    expect(serializedReport).not.toContain('"password":')

    // 6. Confere que o snapshot original não foi mutado pela exportação (revisão monotônica)
    const afterSnapshotResponse = await page.evaluate(async () => {
      return await window.api.diagnostics.getSnapshot()
    })
    expect(afterSnapshotResponse.isSuccess).toBe(true)
    const afterSnapshot = afterSnapshotResponse.data
    expect(afterSnapshot?.sessionId).toBe(beforeSnapshot?.sessionId)
    expect(afterSnapshot?.observedGeneration).toBe(
      beforeSnapshot?.observedGeneration,
    )
    expect(afterSnapshot?.storages.map((s) => s.id)).toEqual(
      beforeSnapshot?.storages.map((s) => s.id),
    )
    expect(afterSnapshot?.workspaces.map((w) => w.workspaceId)).toEqual(
      beforeSnapshot?.workspaces.map((w) => w.workspaceId),
    )

    if (beforeSnapshot && afterSnapshot) {
      expect(afterSnapshot.revision).toBeGreaterThanOrEqual(
        beforeSnapshot.revision,
      )
    }
  })
})
