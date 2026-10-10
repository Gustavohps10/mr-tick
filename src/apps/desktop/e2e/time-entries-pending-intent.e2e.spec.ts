import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page } from '@playwright/test'
import { z } from 'zod'

import type { IHostBridge } from '../../../packages/application/src/contracts/host/IHostBridge'
import { expect, test } from './fixtures/electron-fixture'
import { fakeSyncScope, localSyncEntries } from './fixtures/fake-sync-observer'

declare global {
  interface Window {
    api: IHostBridge
  }
}

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const diagnosticsSchema = z.object({
  timeEntryCount: z.number(),
  remoteIds: z.array(z.string()),
  canonicalReadFailures: z.number(),
  retainedCanonicalReads: z.number(),
  canonicalReadPaused: z.boolean(),
  findByIdAttempts: z.number(),
  updatePaused: z.boolean(),
  deletePaused: z.boolean(),
  tombstonePulls: z.number(),
  pullAttempts: z.number(),
  retainedPulls: z.number(),
  updateFailures: z.number(),
  deleteFailures: z.number(),
  updateAttempts: z.number(),
  deleteAttempts: z.number(),
  createAttempts: z.number(),
  entries: z.array(
    z.object({ id: z.string().optional(), comments: z.string().optional() }),
  ),
})

async function command(page: Page, commandId: string) {
  const result = await page.evaluate(
    (id) => window.api.addons.executeCommand({ body: { commandId: id } }),
    commandId,
  )
  expect(result.isSuccess).toBe(true)
  return result.data
}

async function diagnostics(page: Page) {
  return diagnosticsSchema.parse(
    await command(page, 'fake-db:get-time-entry-sync-diagnostics'),
  )
}

async function openWorkspace(page: Page) {
  await page.locator('nav a[href*="/workspaces/" ]').first().click()
  await expect(
    page.getByTestId('time-entry-actions-trigger').first(),
  ).toBeVisible({ timeout: 30000 })
}

async function editFirstComment(page: Page, comments: string) {
  await page.getByTestId('time-entry-actions-trigger').first().click()
  const edit = page.getByTestId('time-entry-edit-btn')
  await expect(edit).toBeVisible()
  await edit.click()
  const input = page.getByTestId('time-entry-comment-input').first()
  await expect(input).toBeVisible()
  await input.fill(comments)
  await input.press('Enter')
  const save = page.getByTestId('time-entry-save-btn').first()
  await save.click()
  await expect(save).not.toBeVisible()
}

async function connectSecondFakeConnection(page: Page) {
  const href = await page
    .locator('nav a[href*="/workspaces/"]')
    .first()
    .getAttribute('href')
  expect(href).not.toBeNull()
  if (!href) return
  const workspaceId = href
    .split('/')
    .filter(Boolean)
    .find((part, index, parts) => parts[index - 1] === 'workspaces')
  expect(workspaceId).toBeDefined()
  if (!workspaceId) return
  const workspace = await page.evaluate(
    (id) => window.api.workspaces.getById({ body: { workspaceId: id } }),
    workspaceId,
  )
  expect(workspace.isSuccess).toBe(true)
  const source = workspace.data?.dataSourceConnections.find(
    (connection) => connection.status === 'connected',
  )
  expect(source).toBeDefined()
  if (!source) return
  const configuration = z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .parse(source.config)
  const connectionInstanceId = crypto.randomUUID()
  const linked = await page.evaluate(
    (body) => window.api.workspaces.linkDataSource({ body }),
    {
      workspaceId,
      dataSourceId: source.dataSourceId,
      connectionInstanceId,
    },
  )
  expect(linked.isSuccess).toBe(true)
  const connected = await page.evaluate(
    (body) => window.api.workspaces.connectDataSource({ body }),
    {
      workspaceId,
      pluginId: source.dataSourceId,
      connectionInstanceId,
      credentials: configuration,
      configuration,
    },
  )
  expect(connected.isSuccess).toBe(true)
  await page.reload()
  await expect(page.getByTestId('sync-status-indicator')).toHaveAttribute(
    'aria-label',
    'Sincronizado',
    { timeout: 60000 },
  )
  return connectionInstanceId
}

async function openDetectedConflict(page: Page) {
  const dialog = page.getByRole('dialog', {
    name: 'Conflito de Sincronização',
    exact: true,
  })
  await expect(async () => {
    if (await dialog.isVisible()) return
    const conflictButton = page
      .getByRole('button', { name: 'Conflito', exact: true })
      .first()
    if (await conflictButton.isVisible().catch(() => false)) {
      await conflictButton.click()
      await expect(dialog).toBeVisible({ timeout: 3000 })
      return
    }
    const resolverBtn = page.getByRole('button', { name: 'Resolver' }).first()
    if (await resolverBtn.isVisible().catch(() => false)) {
      await resolverBtn.click()
      await expect(dialog).toBeVisible({ timeout: 3000 })
      return
    }
    const statusBtn = page
      .locator('[data-testid="sync-status-indicator"]')
      .first()
    if (await statusBtn.isVisible().catch(() => false)) {
      await statusBtn.click({ force: true })
      const syncAllBtn = page.locator('[data-testid="sync-all-button"]').first()
      if (
        (await syncAllBtn.isVisible().catch(() => false)) &&
        (await syncAllBtn.isEnabled().catch(() => false))
      ) {
        await syncAllBtn.click({ force: true })
      }
      const popoverResolver = page
        .getByRole('button', { name: 'Resolver' })
        .first()
      if (await popoverResolver.isVisible().catch(() => false)) {
        await popoverResolver.click()
        await expect(dialog).toBeVisible({ timeout: 3000 })
        return
      }
      await page.keyboard.press('Escape')
    }
    await expect(conflictButton.or(resolverBtn)).toBeVisible({ timeout: 3000 })
    if (await conflictButton.isVisible().catch(() => false)) {
      await conflictButton.click()
      await expect(dialog).toBeVisible({ timeout: 5000 })
      return
    }
    if (await resolverBtn.isVisible().catch(() => false)) {
      await resolverBtn.click()
    }
    await expect(dialog).toBeVisible({ timeout: 5000 })
  }).toPass({ timeout: 25000 })
  return dialog
}

async function openDuplicateWindow(
  electronApp: import('@playwright/test').ElectronApplication,
): Promise<{ second: Page; duplicateWindowId: number }> {
  const duplicateWindowId = await electronApp.evaluate(
    ({ BrowserWindow }, appPath) => {
      const sourceWindow = BrowserWindow.getAllWindows().find(
        (window) => window.windowType === 'main',
      )
      if (!sourceWindow) throw new Error('VISIBLE_WINDOW_NOT_FOUND')

      const duplicateWindow = new BrowserWindow({
        ...sourceWindow.getBounds(),
        webPreferences: {
          ...sourceWindow.webContents.getLastWebPreferences(),
          preload: appPath,
          sandbox: false,
        },
      })
      duplicateWindow.windowType = 'main'
      void duplicateWindow.loadURL(sourceWindow.webContents.getURL())
      return duplicateWindow.id
    },
    resolve(desktopRoot, 'out/preload/index.mjs'),
  )

  let second: Page | undefined
  await expect
    .poll(async () => {
      for (const candidate of await electronApp.windows()) {
        const browserWindow = await electronApp.browserWindow(candidate)
        const id = await browserWindow.evaluate((window) => window.id)
        await browserWindow.dispose()
        if (id !== duplicateWindowId) continue
        second = candidate
        return true
      }
      return false
    })
    .toBe(true)

  if (!second) throw new Error('SECOND_WINDOW_NOT_FOUND')
  return { second, duplicateWindowId }
}

test.describe('E2E - Intenção pendente após falha remota', () => {
  test('PUT 503 é repetido automaticamente sem nova edição ou criação', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000)
    await openWorkspace(page)
    const before = await diagnostics(page)
    await command(page, 'fake-db:fail-next-time-entry-update')
    const comments = 'RETRY_UPDATE_' + testInfo.testId
    await editFirstComment(page, comments)
    await expect
      .poll(async () => (await diagnostics(page)).updateFailures)
      .toBe(before.updateFailures + 1)
    await expect
      .poll(
        async () =>
          (await diagnostics(page)).entries.some(
            (entry) => entry.comments === comments,
          ),
        { timeout: 45000 },
      )
      .toBe(true)
    const after = await diagnostics(page)
    expect(after.updateAttempts).toBe(before.updateAttempts + 2)
    expect(after.createAttempts).toBe(before.createAttempts)
    expect(after.timeEntryCount).toBe(before.timeEntryCount)
  })

  test('DELETE 503 mantém tombstone e é repetido automaticamente', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await openWorkspace(page)
    const before = await diagnostics(page)
    await command(page, 'fake-db:fail-next-time-entry-delete')
    await page.getByTestId('time-entry-actions-trigger').first().click()
    await page.getByTestId('time-entry-delete-btn').click()
    await expect
      .poll(async () => (await diagnostics(page)).deleteFailures)
      .toBe(before.deleteFailures + 1)
    await expect
      .poll(async () => (await diagnostics(page)).timeEntryCount, {
        timeout: 45000,
      })
      .toBe(before.timeEntryCount - 1)
    expect((await diagnostics(page)).deleteAttempts).toBe(
      before.deleteAttempts + 2,
    )
  })

  test('pull após PUT 503 não troca o baseline e protege alteração externa', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000)
    await openWorkspace(page)
    const before = await diagnostics(page)
    await command(page, 'fake-db:fail-update-and-edit-remote')
    const comments = 'LOCAL_PENDING_' + testInfo.testId
    await editFirstComment(page, comments)
    await expect
      .poll(async () => (await diagnostics(page)).updateFailures)
      .toBe(before.updateFailures + 1)
    await page.getByTestId('sync-status-indicator').click()
    await page.getByTestId('sync-all-button').click()
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('button', { name: 'Conflito', exact: true }).first(),
    ).toBeVisible({ timeout: 45000 })
    const after = await diagnostics(page)
    expect(
      after.entries.some(
        (entry) => entry.comments === 'EXTERNAL_EDIT_AFTER_FAILED_UPDATE',
      ),
    ).toBe(true)
    expect(after.entries.some((entry) => entry.comments === comments)).toBe(
      false,
    )
  })

  test('aceitar remoto estabelece baseline para a próxima edição', async ({
    page,
  }, testInfo) => {
    await openWorkspace(page)
    await command(page, 'fake-db:touch-conflict')
    await editFirstComment(page, 'DISCARDED_' + testInfo.testId)
    const dialog = await openDetectedConflict(page)
    await dialog.getByRole('button', { name: 'Selecionar Tudo Remoto' }).click()
    await dialog.getByRole('button', { name: 'Aceitar Mesclagem' }).click()
    await expect(dialog).not.toBeVisible()
    const comments = 'EDIT_AFTER_REMOTE_ACCEPT_' + testInfo.testId
    await editFirstComment(page, comments)
    await expect
      .poll(
        async () =>
          (await diagnostics(page)).entries.some(
            (entry) => entry.comments === comments,
          ),
        { timeout: 15000 },
      )
      .toBe(true)
    await expect(
      page.getByRole('button', { name: 'Conflito', exact: true }),
    ).not.toBeVisible()
  })

  test('pull em outra janela respeita tombstone importado sem correlação', async ({
    page,
    electronApp,
  }) => {
    await page
      .locator(`nav a[href="#/workspaces/${fakeSyncScope.workspaceId}"]`)
      .click()
    await expect(
      page.getByTestId('time-entry-actions-trigger').first(),
    ).toBeVisible({
      timeout: 30000,
    })
    const created = z
      .object({
        created: z.object({
          id: z.string(),
          comments: z.string(),
          correlationId: z.undefined().optional(),
        }),
      })
      .parse(await command(page, 'fake-db:inject-today')).created
    await page.getByTestId('sync-status-indicator').click()
    await page.getByTestId('sync-all-button').click()
    await page.keyboard.press('Escape')
    const targetRow = page.locator('tr').filter({
      has: page.getByText(created.comments, { exact: true }),
    })
    await expect(targetRow).toHaveCount(1)
    const localId = await targetRow.getAttribute('data-entry-id')
    if (!localId) return expect.fail('IMPORTED_DELETE_ENTRY_ID_MISSING')
    await expect
      .poll(async () =>
        (await localSyncEntries(page)).some((entry) => entry.id === localId),
      )
      .toBe(true)
    const before = await diagnostics(page)
    expect(
      before.entries.filter((entry) => entry.comments === created.comments),
    ).toEqual([{ id: created.id, comments: created.comments }])
    expect(before.remoteIds).toContain(created.id)
    const expectedRemoteIds = before.remoteIds
      .filter((id) => id !== created.id)
      .sort()
    try {
      await command(page, 'fake-db:pause-next-time-entry-delete')
      await targetRow.getByTestId('time-entry-actions-trigger').click()
      await page.getByTestId('time-entry-delete-btn').click()
      await expect(targetRow).toHaveCount(0)
      await expect
        .poll(async () =>
          (await localSyncEntries(page)).some((entry) => entry.id === localId),
        )
        .toBe(false)
      await expect
        .poll(async () => (await diagnostics(page)).deletePaused)
        .toBe(true)
      const { second } = await openDuplicateWindow(electronApp)
      await second.waitForLoadState('domcontentloaded')
      await second
        .locator(`nav a[href="#/workspaces/${fakeSyncScope.workspaceId}"]`)
        .click()
      await expect(
        second.getByTestId('time-entry-actions-trigger').first(),
      ).toBeVisible({
        timeout: 30000,
      })
      await expect
        .poll(async () => (await diagnostics(page)).pullAttempts)
        .toBeGreaterThan(before.pullAttempts)
      await expect
        .poll(async () => (await diagnostics(page)).tombstonePulls)
        .toBeGreaterThan(before.tombstonePulls)
      await expect(
        second.locator(
          `[data-testid="time-entry-row"][data-entry-id="${localId}"]`,
        ),
      ).toHaveCount(0)
      await expect(
        second.getByText(created.comments, { exact: true }),
      ).toHaveCount(0)
      await expect
        .poll(async () =>
          (await localSyncEntries(second)).some(
            (entry) =>
              entry.id === localId || entry.comments === created.comments,
          ),
        )
        .toBe(false)
      const paused = await diagnostics(page)
      expect(paused.remoteIds.sort()).toEqual([...before.remoteIds].sort())
      expect(paused.deleteAttempts).toBe(before.deleteAttempts + 1)
    } finally {
      await command(page, 'fake-db:release-paused-time-entry-delete')
    }
    await expect
      .poll(async () => (await diagnostics(page)).remoteIds.sort())
      .toEqual(expectedRemoteIds)
    const after = await diagnostics(page)
    // This scenario checks the deletion effect; transport retries are not exactly-once.
    expect(after.deleteAttempts).toBeGreaterThanOrEqual(
      before.deleteAttempts + 1,
    )
    expect(after.createAttempts).toBe(before.createAttempts)
    expect(after.updateAttempts).toBe(before.updateAttempts)
  })

  test('provedor com atualização condicional protege edição externa entre GET e PUT', async ({
    page,
  }, testInfo) => {
    await openWorkspace(page)
    await command(page, 'fake-db:pause-next-time-entry-update')
    const comments = 'LOCAL_RACING_' + testInfo.testId
    await editFirstComment(page, comments)
    await expect
      .poll(async () => (await diagnostics(page)).updatePaused)
      .toBe(true)
    try {
      const result = await command(page, 'fake-db:change-paused-update-remote')
      expect(z.object({ changed: z.boolean() }).parse(result).changed).toBe(
        true,
      )
    } finally {
      await command(page, 'fake-db:release-paused-time-entry-update')
    }
    await expect(
      page.getByRole('button', { name: 'Conflito', exact: true }).first(),
    ).toBeVisible({ timeout: 15000 })
    const after = await diagnostics(page)
    expect(
      after.entries.some(
        (entry) => entry.comments === 'EXTERNAL_DURING_UPDATE',
      ),
    ).toBe(true)
    expect(after.entries.some((entry) => entry.comments === comments)).toBe(
      false,
    )
  })

  test('DELETE 422 permanece visível globalmente e não é repetido por pull manual', async ({
    page,
  }) => {
    await openWorkspace(page)
    const before = await diagnostics(page)
    await command(page, 'fake-db:reject-next-time-entry-delete')
    await page.getByTestId('time-entry-actions-trigger').first().click()
    await page.getByTestId('time-entry-delete-btn').click()
    await expect
      .poll(async () => (await diagnostics(page)).deleteFailures)
      .toBe(before.deleteFailures + 1)
    const indicator = page.getByTestId('sync-status-indicator')
    await expect(indicator).toHaveAttribute('aria-label', 'Erro técnico')
    await indicator.click()
    await page
      .getByRole('dialog')
      .getByText('Apontamentos', { exact: true })
      .locator('..')
      .locator('.cursor-help')
      .hover()
    await expect(
      page
        .getByText('FAKE_TIME_ENTRY_DELETE_UNAVAILABLE', { exact: true })
        .first(),
    ).toBeVisible()
    const syncAll = page.getByTestId('sync-all-button')
    await expect(syncAll).toBeEnabled()
    await syncAll.click()
    await expect(syncAll).toBeEnabled({ timeout: 30000 })
    await page.keyboard.press('Escape')
    await expect(indicator).toHaveAttribute('aria-label', 'Erro técnico')
    await page.reload()
    await expect(indicator).toHaveAttribute('aria-label', 'Erro técnico', {
      timeout: 30000,
    })
    const after = await diagnostics(page)
    expect(after.deleteAttempts).toBe(before.deleteAttempts + 1)
    expect(after.timeEntryCount).toBe(before.timeEntryCount)
  })

  test('PUT confirmado sem snapshot com GET503 repete somente a leitura canônica', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000)
    await openWorkspace(page)
    const before = await diagnostics(page)
    await command(page, 'fake-db:legacy-update-and-lose-canonical-read')
    const comments = 'LEGACY_CONFIRMED_WRITE_' + testInfo.testId
    await editFirstComment(page, comments)
    await expect
      .poll(async () => (await diagnostics(page)).canonicalReadFailures)
      .toBe(before.canonicalReadFailures + 1)
    await expect
      .poll(async () => (await diagnostics(page)).findByIdAttempts, {
        timeout: 45000,
      })
      .toBeGreaterThanOrEqual(before.findByIdAttempts + 3)
    const row = page.locator('tr').filter({ hasText: comments }).first()
    await expect(
      row.getByRole('button', { name: 'Conflito', exact: true }),
    ).not.toBeVisible()
    await expect(
      row.getByRole('textbox', { name: '00:00', exact: true }).first(),
    ).toHaveValue('12:00')
    const after = await diagnostics(page)
    expect(after.updateAttempts).toBe(before.updateAttempts + 1)
    expect(after.createAttempts).toBe(before.createAttempts)
    await expect(page.getByTestId('sync-status-indicator')).toHaveAttribute(
      'aria-label',
      'Sincronizado',
    )
  })

  test('pull atualiza um apontamento sincronizado sem nenhuma edição local', async ({
    page,
  }) => {
    await openWorkspace(page)
    const before = await diagnostics(page)
    const result = z
      .object({ updated: z.object({ comments: z.string() }) })
      .parse(await command(page, 'fake-db:touch-conflict'))
    await page.getByTestId('sync-status-indicator').click()
    await page.getByTestId('sync-all-button').click()
    await expect
      .poll(async () => (await diagnostics(page)).pullAttempts)
      .toBeGreaterThan(before.pullAttempts)
    await page.keyboard.press('Escape')
    await expect(
      page.getByText(result.updated.comments, { exact: true }).first(),
    ).toBeVisible()
    expect((await diagnostics(page)).updateAttempts).toBe(before.updateAttempts)
  })
  test('HTTP401 com mensagem arbitrária solicita autenticação pelo código original', async ({
    page,
  }) => {
    await openWorkspace(page)
    const before = await diagnostics(page)
    await command(page, 'fake-db:auth-next-time-entry-delete')
    await page.getByTestId('time-entry-actions-trigger').first().click()
    await page.getByTestId('time-entry-delete-btn').click()
    await expect
      .poll(async () => (await diagnostics(page)).deleteFailures)
      .toBe(before.deleteFailures + 1)
    const indicator = page.getByTestId('sync-status-indicator')
    await expect(indicator).toHaveAttribute(
      'aria-label',
      'Autenticação necessária',
    )
    await indicator.click()
    await page
      .getByRole('dialog')
      .getByText('Apontamentos', { exact: true })
      .locator('..')
      .locator('.cursor-help')
      .hover()
    await expect(
      page.getByText('SESSION_REQUIRES_LOGIN', { exact: true }).first(),
    ).toBeVisible()
  })
  test('exclusão durante leitura canônica pendente confirma DELETE e limpa o ledger', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000)
    await openWorkspace(page)
    const before = await diagnostics(page)
    await command(page, 'fake-db:legacy-update-and-lose-canonical-read')
    const comments = 'DELETE_CONFIRMED_WRITE_' + testInfo.testId
    await editFirstComment(page, comments)
    await expect
      .poll(async () => (await diagnostics(page)).canonicalReadFailures)
      .toBe(before.canonicalReadFailures + 1)
    const row = page.locator('tr').filter({ hasText: comments }).first()
    await row.getByTestId('time-entry-actions-trigger').click()
    await page.getByTestId('time-entry-delete-btn').click()
    await expect
      .poll(async () => (await diagnostics(page)).timeEntryCount, {
        timeout: 45000,
      })
      .toBe(before.timeEntryCount - 1)
    await expect(page.getByTestId('sync-status-indicator')).toHaveAttribute(
      'aria-label',
      'Sincronizado',
    )
    const after = await diagnostics(page)
    expect(after.deleteAttempts).toBe(before.deleteAttempts + 1)
    expect(after.updateAttempts).toBe(before.updateAttempts + 1)
    await page.reload()
    await expect(page.getByTestId('sync-status-indicator')).toHaveAttribute(
      'aria-label',
      'Sincronizado',
      { timeout: 30000 },
    )
    const restarted = await diagnostics(page)
    expect(restarted.deleteAttempts).toBe(before.deleteAttempts + 1)
    expect(restarted.createAttempts).toBe(before.createAttempts)
    expect(restarted.timeEntryCount).toBe(before.timeEntryCount - 1)
  })
  test('ausência remota após PUT confirmado permite recriação explicitamente autorizada', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000)
    await openWorkspace(page)
    const before = await diagnostics(page)
    await command(page, 'fake-db:legacy-update-and-lose-canonical-read')
    const comments = 'MISSING_CONFIRMED_WRITE_' + testInfo.testId
    await editFirstComment(page, comments)
    await expect
      .poll(async () => (await diagnostics(page)).canonicalReadFailures)
      .toBe(before.canonicalReadFailures + 1)
    const removed = z
      .object({ deleted: z.boolean() })
      .parse(await command(page, 'fake-db:delete-last-legacy-confirmed-entry'))
    expect(removed.deleted).toBe(true)
    const row = page.locator('tr').filter({ hasText: comments }).first()
    const ambiguous = row.getByTestId('sync-status-creation-ambiguous')
    await expect(ambiguous).toBeVisible({ timeout: 45000 })
    expect((await diagnostics(page)).createAttempts).toBe(before.createAttempts)
    await ambiguous.click()
    await page.getByTestId('confirm-retry-ambiguous-create').click()
    await expect
      .poll(
        async () =>
          (await diagnostics(page)).entries.some(
            (entry) => entry.comments === comments,
          ),
        { timeout: 45000 },
      )
      .toBe(true)
    await expect(ambiguous).not.toBeVisible()
    const after = await diagnostics(page)
    expect(after.createAttempts).toBe(before.createAttempts + 1)
    expect(after.updateAttempts).toBe(before.updateAttempts + 1)
    expect(after.timeEntryCount).toBe(before.timeEntryCount)
    await expect(page.getByTestId('sync-status-indicator')).toHaveAttribute(
      'aria-label',
      'Sincronizado',
    )
  })

  test('confirmação canônica pendente bloqueia troca de conexão', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000)
    await openWorkspace(page)
    const secondConnectionId = await connectSecondFakeConnection(page)
    expect(secondConnectionId).toBeDefined()
    const href = await page
      .locator('nav a[href*="/workspaces/"]')
      .first()
      .getAttribute('href')
    expect(href).not.toBeNull()
    if (href === null) throw new Error('FIXTURE_WORKSPACE_LINK_REQUIRED')
    const workspaceId = href
      .split('/')
      .filter(Boolean)
      .find((part, index, parts) => parts[index - 1] === 'workspaces')
    if (workspaceId === undefined)
      throw new Error('FIXTURE_WORKSPACE_ID_REQUIRED')
    const workspace = await page.evaluate(
      (id) => window.api.workspaces.getById({ body: { workspaceId: id } }),
      workspaceId,
    )
    const before = await diagnostics(page)
    const comments = 'BLOCK_CONNECTION_LEDGER_' + testInfo.testId
    let entryId: string | undefined
    let originalConnectionId: string | undefined
    await command(page, 'fake-db:pause-canonical-recovery')
    try {
      await command(page, 'fake-db:legacy-update-and-lose-canonical-read')
      await editFirstComment(page, comments)
      await expect
        .poll(async () => (await diagnostics(page)).canonicalReadFailures)
        .toBe(before.canonicalReadFailures + 1)
      await expect
        .poll(async () => (await diagnostics(page)).retainedCanonicalReads)
        .toBeGreaterThan(before.retainedCanonicalReads)
      expect((await diagnostics(page)).canonicalReadPaused).toBe(true)

      const entries = await page.evaluate(
        (scope) =>
          window.api.localRuntime.request({
            action: 'list',
            workspaceId: scope.workspaceId,
            filter: {},
          }),
        { workspaceId },
      )
      expect(entries.ok).toBe(true)
      if (!entries.ok) throw new Error('FIXTURE_LOCAL_ENTRY_QUERY_FAILED')
      const entry = entries.value.entries.find(
        (candidate) => candidate.comments === comments,
      )
      expect(entry).toBeDefined()
      if (entry === undefined) throw new Error('FIXTURE_EDITED_ENTRY_REQUIRED')
      entryId = entry.id
      const originalConnection = workspace.data?.dataSourceConnections.find(
        (connection) =>
          connection.id === entry.connectionInstanceId &&
          connection.status === 'connected',
      )
      if (originalConnection === undefined)
        throw new Error('FIXTURE_ORIGINAL_CONNECTION_REQUIRED')
      originalConnectionId = originalConnection.id
      expect(
        workspace.data?.dataSourceConnections.filter(
          (connection) => connection.status === 'connected',
        ).length,
      ).toBeGreaterThanOrEqual(2)
      expect(entry.connectionInstanceId).toBe(originalConnectionId)
      const row = page.locator('tr').filter({ hasText: comments }).first()
      await expect(row.getByTestId('sync-status-pending-push')).toBeVisible()
      await row.getByTestId('time-entry-actions-trigger').click()
      await page.getByTestId('time-entry-edit-btn').click()
      await page.getByTestId('time-entry-task-popover-trigger').first().click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('combobox').last().click()
      await page.locator('[role="option"][data-state="unchecked"]').click()
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')

      const held = await diagnostics(page)
      expect(held.canonicalReadPaused).toBe(true)
      expect(held.retainedCanonicalReads).toBeGreaterThan(
        before.retainedCanonicalReads,
      )
      const pending = await page.evaluate(
        (scope) =>
          window.api.localRuntime.request({
            action: 'get',
            workspaceId: scope.workspaceId,
            entryId: scope.entryId,
          }),
        { workspaceId, entryId },
      )
      expect(pending.ok).toBe(true)
      if (pending.ok)
        expect(pending.value.entry?.connectionInstanceId).toBe(
          originalConnectionId,
        )
      await page.getByTestId('time-entry-save-btn').first().click()
      await expect(
        page
          .getByText('Confirme a operação remota antes de trocar a conexão', {
            exact: true,
          })
          .first(),
      ).toBeVisible()
      await expect(
        page.getByTestId('time-entry-save-btn').first(),
      ).toBeVisible()
      expect((await diagnostics(page)).createAttempts).toBe(
        before.createAttempts,
      )
      const preserved = await page.evaluate(
        (scope) =>
          window.api.localRuntime.request({
            action: 'get',
            workspaceId: scope.workspaceId,
            entryId: scope.entryId,
          }),
        { workspaceId, entryId },
      )
      expect(preserved.ok).toBe(true)
      if (preserved.ok)
        expect(preserved.value.entry?.connectionInstanceId).toBe(
          originalConnectionId,
        )
      await page.getByTestId('time-entry-cancel-btn').first().click()
    } finally {
      await command(page, 'fake-db:release-canonical-recovery')
    }
    if (entryId === undefined) throw new Error('FIXTURE_ENTRY_NOT_SELECTED')
    if (originalConnectionId === undefined)
      throw new Error('FIXTURE_ORIGINAL_CONNECTION_REQUIRED')
    await expect
      .poll(async () => (await diagnostics(page)).canonicalReadPaused)
      .toBe(false)
    await expect(
      page
        .locator('tr')
        .filter({ hasText: comments })
        .first()
        .getByTestId('sync-status-synced'),
    ).toBeVisible({ timeout: 30000 })
    const confirmed = await page.evaluate(
      (scope) =>
        window.api.localRuntime.request({
          action: 'get',
          workspaceId: scope.workspaceId,
          entryId: scope.entryId,
        }),
      { workspaceId, entryId },
    )
    expect(confirmed.ok).toBe(true)
    if (confirmed.ok)
      expect(confirmed.value.entry?.connectionInstanceId).toBe(
        originalConnectionId,
      )
    expect((await diagnostics(page)).createAttempts).toBe(before.createAttempts)
  })
  test('cancelar edição temporária não reverte a confirmação de uma alteração direta anterior', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000)
    await openWorkspace(page)
    const comments = 'CANCEL_PENDING_LEDGER_' + testInfo.testId
    await editFirstComment(page, comments)
    await expect
      .poll(async () =>
        (await diagnostics(page)).entries.some(
          (entry) => entry.comments === comments,
        ),
      )
      .toBe(true)
    await expect(page.getByTestId('sync-status-indicator')).toHaveAttribute(
      'aria-label',
      'Sincronizado',
    )
    const before = await diagnostics(page)
    await command(page, 'fake-db:legacy-update-and-lose-canonical-read')
    const row = page.locator('tr').filter({ hasText: comments }).first()
    const start = row
      .getByRole('textbox', { name: '00:00', exact: true })
      .first()
    await start.fill('09:45')
    await start.press('Enter')
    await expect
      .poll(async () => (await diagnostics(page)).canonicalReadFailures)
      .toBe(before.canonicalReadFailures + 1)
    await row.getByTestId('time-entry-actions-trigger').click()
    await page.getByTestId('time-entry-edit-btn').click()
    await page
      .getByTestId('time-entry-comment-input')
      .first()
      .fill('DISCARDED_TEMPORARY_EDIT')
    await page.getByTestId('time-entry-cancel-btn').first().click()
    await expect
      .poll(async () => (await diagnostics(page)).findByIdAttempts, {
        timeout: 45000,
      })
      .toBeGreaterThanOrEqual(before.findByIdAttempts + 3)
    await expect(start).toHaveValue('12:00')
    await expect(
      page.getByText('DISCARDED_TEMPORARY_EDIT', { exact: true }),
    ).not.toBeVisible()
    const after = await diagnostics(page)
    expect(after.updateAttempts).toBe(before.updateAttempts + 1)
    expect(after.createAttempts).toBe(before.createAttempts)
    expect(after.deleteAttempts).toBe(before.deleteAttempts)
    await expect(
      row.getByRole('button', { name: 'Conflito', exact: true }),
    ).not.toBeVisible()
  })

  test('erro definitivo atrasado da conexão anterior não contamina a nova identidade', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000)
    await openWorkspace(page)
    await connectSecondFakeConnection(page)
    const before = await diagnostics(page)
    await command(page, 'fake-db:reject-next-time-entry-update')
    await command(page, 'fake-db:pause-next-time-entry-update')
    const comments = 'STALE_CONNECTION_RESPONSE_' + testInfo.testId
    await editFirstComment(page, comments)
    await expect
      .poll(async () => (await diagnostics(page)).updatePaused)
      .toBe(true)
    try {
      const row = page.locator('tr').filter({ hasText: comments }).first()
      await row.getByTestId('time-entry-actions-trigger').click()
      await page.getByTestId('time-entry-edit-btn').click()
      await page.getByTestId('time-entry-task-popover-trigger').first().click()
      await page.getByRole('dialog').getByRole('combobox').last().click()
      await page.locator('[role="option"][data-state="unchecked"]').click()
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      const save = page.getByTestId('time-entry-save-btn').first()
      await save.click()
      await expect(save).not.toBeVisible()
      await expect
        .poll(async () => (await diagnostics(page)).createAttempts)
        .toBe(before.createAttempts + 1)
    } finally {
      await command(page, 'fake-db:release-paused-time-entry-update')
    }
    await expect
      .poll(async () => (await diagnostics(page)).updateFailures)
      .toBe(before.updateFailures + 1)
    await expect(page.getByTestId('sync-status-indicator')).toHaveAttribute(
      'aria-label',
      'Sincronizado',
      { timeout: 45000 },
    )
    const after = await diagnostics(page)
    expect(after.createAttempts).toBe(before.createAttempts + 1)
    expect(after.updateAttempts).toBe(before.updateAttempts + 1)
    expect(after.deleteAttempts).toBe(before.deleteAttempts)
    expect(after.timeEntryCount).toBe(before.timeEntryCount + 1)
    await expect(
      page.getByRole('button', { name: 'Conflito', exact: true }),
    ).not.toBeVisible()
  })
  test('pull retido não reverte PUT já confirmado', async ({ page }) => {
    await openWorkspace(page)
    const r1 = 'pull-observed-R1-' + crypto.randomUUID()
    const r2 = 'pull-confirmed-R2-' + crypto.randomUUID()
    await editFirstComment(page, r1)
    await expect
      .poll(async () =>
        (await diagnostics(page)).entries.some(
          (entry) => entry.comments === r1,
        ),
      )
      .toBe(true)
    await command(page, 'fake-db:pause-one-time-entry-pull')
    try {
      await page.getByTestId('sync-status-indicator').click()
      await page.getByTestId('sync-all-button').click()
      await page.keyboard.press('Escape')
      await expect
        .poll(async () => (await diagnostics(page)).retainedPulls)
        .toBe(1)
      await editFirstComment(page, r2)
      await expect
        .poll(async () =>
          (await diagnostics(page)).entries.some(
            (entry) => entry.comments === r2,
          ),
        )
        .toBe(true)
      await expect(page.getByRole('row').filter({ hasText: r2 })).toHaveCount(1)
      await command(page, 'fake-db:release-time-entry-pulls')
      await expect(page.getByTestId('sync-status-indicator')).toHaveAttribute(
        'aria-label',
        'Sincronizado',
        { timeout: 30000 },
      )
      await expect(page.getByRole('row').filter({ hasText: r2 })).toHaveCount(1)
      await expect(page.getByRole('row').filter({ hasText: r1 })).toHaveCount(0)
    } finally {
      await command(page, 'fake-db:release-time-entry-pulls')
    }
  })

  test('duas janelas importam um novo remoto sem duplicar linhas locais', async ({
    page,
    electronApp,
  }) => {
    await openWorkspace(page)
    const { second } = await openDuplicateWindow(electronApp)
    await second.waitForLoadState('domcontentloaded')
    await openWorkspace(second)
    const created = z
      .object({ created: z.object({ comments: z.string() }) })
      .parse(await command(page, 'fake-db:inject-today')).created
    await command(page, 'fake-db:pause-two-time-entry-pulls')
    try {
      for (const window of [page, second]) {
        await window.getByTestId('sync-status-indicator').click()
        const syncBtn = window.getByTestId('sync-all-button')
        if (await syncBtn.isEnabled().catch(() => false)) {
          await syncBtn.click({ force: true })
        }
        await window.keyboard.press('Escape')
      }
      await expect
        .poll(async () => (await diagnostics(page)).retainedPulls)
        .toBeGreaterThanOrEqual(1)
      await command(page, 'fake-db:release-time-entry-pulls')
      for (const window of [page, second]) {
        await expect(
          window.getByTestId('sync-status-indicator'),
        ).toHaveAttribute('aria-label', 'Sincronizado', { timeout: 30000 })
        await expect(
          window.getByRole('row').filter({ hasText: created.comments }),
        ).toHaveCount(1)
      }
    } finally {
      await command(page, 'fake-db:release-time-entry-pulls')
      await second.close()
    }
  })
})
