import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { IHostBridge } from '../../../packages/application/src/contracts/host/IHostBridge'
import { expect, test } from './fixtures/electron-fixture'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

declare global {
  interface Window {
    api: IHostBridge
  }
}

async function executeFakeCommand(
  page: import('@playwright/test').Page,
  commandId: string,
): Promise<string> {
  return page.evaluate(async (id) => {
    const result = await window.api.addons.executeCommand({
      body: { commandId: id },
    })
    if (!result.isSuccess)
      throw new Error(
        result.error ? String(result.error) : 'FAKE_COMMAND_FAILED',
      )

    const serializedResult = JSON.stringify(result.data)
    if (!serializedResult) throw new Error('FAKE_COMMAND_RESULT_EMPTY')
    return serializedResult
  }, commandId)
}

function getDiagnosticNumber(diagnostics: string, key: string): number {
  const match = diagnostics.match(new RegExp(`"${key}":(\\d+)`))
  if (!match) throw new Error(`MISSING_DIAGNOSTIC_${key}`)
  return Number(match[1])
}

async function openFakeWorkspace(
  page: import('@playwright/test').Page,
): Promise<void> {
  const workspaceLink = page.locator('a[href*="/workspaces/"]').first()
  await expect(workspaceLink).toBeVisible({ timeout: 15000 })
  await workspaceLink.click()
  await expect(
    page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    ),
  ).toBeVisible({ timeout: 30000 })
  await expect(
    page.locator('[data-testid="time-entry-actions-trigger"]').first(),
  ).toBeVisible({ timeout: 15000 })
}

async function duplicateAndSaveFirstEntry(
  page: import('@playwright/test').Page,
): Promise<void> {
  const actions = page.locator('[data-testid="time-entry-actions-trigger"]')
  const duplicateButton = page.locator(
    '[data-testid="time-entry-duplicate-btn"]',
  )
  const saveButton = page.locator('[data-testid="time-entry-save-btn"]').first()

  await expect(async () => {
    if (await saveButton.isVisible().catch(() => false)) return
    if (!(await duplicateButton.isVisible().catch(() => false))) {
      await actions.first().scrollIntoViewIfNeeded()
      await actions.first().click()
      await expect(duplicateButton).toBeVisible({ timeout: 2000 })
    }
    await duplicateButton.click()
    await expect(saveButton).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 20000 })

  await saveButton.click()
  await expect(saveButton).not.toBeVisible({ timeout: 10000 })
}

test.describe('E2E - Criação idempotente de apontamentos', () => {
  test('duas janelas sincronizando o mesmo rascunho criam um único registro remoto', async ({
    electronApp,
    page,
  }) => {
    await openFakeWorkspace(page)

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
          },
        })
        duplicateWindow.windowType = 'main'
        void duplicateWindow.loadURL(sourceWindow.webContents.getURL())
        return duplicateWindow.id
      },
      resolve(desktopRoot, 'out/preload/index.mjs'),
    )

    let secondPage: import('@playwright/test').Page | undefined
    await expect
      .poll(async () => {
        for (const candidate of await electronApp.windows()) {
          const browserWindow = await electronApp.browserWindow(candidate)
          const id = await browserWindow.evaluate((window) => window.id)
          await browserWindow.dispose()
          if (id !== duplicateWindowId) continue
          secondPage = candidate
          return true
        }
        return false
      })
      .toBe(true)
    if (!secondPage) throw new Error('SECOND_WINDOW_NOT_FOUND')
    await secondPage.waitForLoadState('domcontentloaded')
    await openFakeWorkspace(secondPage)

    const before = await executeFakeCommand(
      page,
      'fake-db:get-time-entry-sync-diagnostics',
    )
    const beforeRemoteCount = getDiagnosticNumber(before, 'timeEntryCount')

    await executeFakeCommand(page, 'fake-db:pause-next-time-entry-create')
    await duplicateAndSaveFirstEntry(page)

    await expect
      .poll(async () => {
        const diagnostics = await executeFakeCommand(
          page,
          'fake-db:get-time-entry-sync-diagnostics',
        )
        return diagnostics.includes('"createPaused":true')
      })
      .toBe(true)

    await expect(
      secondPage.locator('[data-testid="sync-status-creating"]').first(),
    ).toBeVisible({ timeout: 15000 })

    await secondPage
      .locator('[data-testid="sync-status-indicator"]')
      .click({ force: true })
    const syncAllButton = secondPage.locator('[data-testid="sync-all-button"]')
    await expect(syncAllButton).toBeVisible({ timeout: 5000 })
    await syncAllButton.click({ force: true })
    await expect(syncAllButton).toBeDisabled({ timeout: 10000 })

    const releaseResult = await executeFakeCommand(
      page,
      'fake-db:release-paused-time-entry-create',
    )
    expect(releaseResult).toContain('"released":true')

    await expect
      .poll(async () => {
        const diagnostics = await executeFakeCommand(
          page,
          'fake-db:get-time-entry-sync-diagnostics',
        )
        return (
          getDiagnosticNumber(diagnostics, 'createAttempts') === 1 &&
          getDiagnosticNumber(diagnostics, 'createsInFlight') === 0 &&
          getDiagnosticNumber(diagnostics, 'timeEntryCount') ===
            beforeRemoteCount + 1 &&
          getDiagnosticNumber(diagnostics, 'findByCorrelationAttempts') >= 1
        )
      })
      .toBe(true)
  })

  test('resposta perdida é reconciliada automaticamente sem duplicar o apontamento', async ({
    page,
  }) => {
    await openFakeWorkspace(page)
    const before = await executeFakeCommand(
      page,
      'fake-db:get-time-entry-sync-diagnostics',
    )
    const count = getDiagnosticNumber(before, 'timeEntryCount')
    const creates = getDiagnosticNumber(before, 'createAttempts')
    await executeFakeCommand(
      page,
      'fake-db:lose-next-time-entry-create-response',
    )
    await duplicateAndSaveFirstEntry(page)
    await expect
      .poll(async () => {
        const after = await executeFakeCommand(
          page,
          'fake-db:get-time-entry-sync-diagnostics',
        )
        return (
          getDiagnosticNumber(after, 'createAttempts') === creates + 1 &&
          getDiagnosticNumber(after, 'timeEntryCount') === count + 1 &&
          getDiagnosticNumber(after, 'createsInFlight') === 0
        )
      })
      .toBe(true)
    await expect(
      page.locator('[data-testid="sync-status-creation-ambiguous"]'),
    ).toHaveCount(0)
    await expect(
      page.locator('[data-testid="sync-status-creating"]'),
    ).toHaveCount(0)
    await expect(
      page.locator(
        '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
      ),
    ).toBeVisible({ timeout: 30000 })
  })
})
