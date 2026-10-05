import type { Page } from '@playwright/test'
import { z } from 'zod'

import type { IHostBridge } from '../../../packages/application/src/contracts/host/IHostBridge'
import { expect, test } from './fixtures/electron-fixture'

declare global {
  interface Window {
    api: IHostBridge
  }
}

const deletionDiagnosticsSchema = z.object({
  remoteIds: z.array(z.string()),
  deleteAttempts: z.number(),
  entries: z.array(
    z.object({ id: z.string().optional(), comments: z.string().optional() }),
  ),
})

async function deletionDiagnostics(page: Page) {
  const result = await page.evaluate(() =>
    window.api.addons.executeCommand({
      body: { commandId: 'fake-db:get-time-entry-sync-diagnostics' },
    }),
  )
  expect(result.isSuccess).toBe(true)
  return deletionDiagnosticsSchema.parse(result.data)
}

function markedRow(page: Page, marker: string) {
  return page
    .locator('tr')
    .filter({ has: page.getByText(marker, { exact: true }) })
}

async function duplicateWithMarker(page: Page, marker: string) {
  const duplicate = page.getByTestId('time-entry-duplicate-btn')
  await expect(async () => {
    await page.getByTestId('time-entry-actions-trigger').first().click()
    await expect(duplicate).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 15000 })
  await duplicate.click()
  const editingRow = page
    .locator('tr')
    .filter({ has: page.getByTestId('time-entry-save-btn') })
  await expect(editingRow).toHaveCount(1)
  const comments = editingRow.getByTestId('time-entry-comment-input')
  await comments.fill(marker)
  await comments.press('Enter')
  await editingRow.getByTestId('time-entry-save-btn').click()
  await expect(markedRow(page, marker)).toHaveCount(1)
  await expect
    .poll(
      async () =>
        (await deletionDiagnostics(page)).entries.filter(
          (entry) => entry.comments === marker && Boolean(entry.id),
        ).length,
      { timeout: 45000 },
    )
    .toBe(1)
}

test.describe('E2E - Exclusão de Apontamentos (Remoção Local e Persistência)', () => {
  test('deve excluir apontamento existente e garantir persistência pós-reload', async ({
    page,
  }) => {
    // 1. Navega para o primeiro workspace configurado
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    // 2. Aguarda a sincronização inicial assentar ("Sincronizado")
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })

    // 3. Aguarda a estabilização completa dos apontamentos carregados
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })

    const initialCount = await actionTriggers.count()
    expect(initialCount).toBeGreaterThan(0)

    // 4. Abre o menu de contexto do primeiro apontamento e clica em "Excluir"
    const deleteBtn = page.locator('[data-testid="time-entry-delete-btn"]')
    await expect(async () => {
      await actionTriggers.first().scrollIntoViewIfNeeded()
      await actionTriggers.first().click()
      await expect(deleteBtn).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await deleteBtn.click()

    // 5. Valida que a quantidade total de apontamentos diminuiu em exatamente 1
    await expect(actionTriggers).toHaveCount(initialCount - 1)

    // 6. Executa reload completo da janela (simulando F5 do usuário)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // 7. Garante que após o reload a exclusão permanece persistida no RxDB
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    await expect(actionTriggers).toHaveCount(initialCount - 1)
  })

  test('deve tolerar exclusões sucessivas rápidas sem inconsistência de estado (STR-02)', async ({
    page,
  }, testInfo) => {
    const timeline: { stage: string; at: number }[] = []
    const firstMarker = 'STR02-first-' + crypto.randomUUID()
    const secondMarker = 'STR02-second-' + crypto.randomUUID()
    try {
      const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
      await expect(workspaceLink).toBeVisible({ timeout: 15000 })
      await workspaceLink.click()
      await expect(
        page.getByTestId('time-entry-actions-trigger').first(),
      ).toBeVisible({ timeout: 30000 })

      await duplicateWithMarker(page, firstMarker)
      await duplicateWithMarker(page, secondMarker)
      const before = await deletionDiagnostics(page)
      const firstId = before.entries.find(
        (entry) => entry.comments === firstMarker,
      )?.id
      const secondId = before.entries.find(
        (entry) => entry.comments === secondMarker,
      )?.id
      expect(firstId).toBeDefined()
      expect(secondId).toBeDefined()
      expect(firstId).not.toBe(secondId)
      if (!firstId || !secondId) return
      const expectedIds = before.remoteIds
        .filter((id) => id !== firstId && id !== secondId)
        .sort()
      timeline.push({ stage: 'both creations confirmed', at: Date.now() })

      await markedRow(page, firstMarker)
        .getByTestId('time-entry-actions-trigger')
        .click()
      await page.getByTestId('time-entry-delete-btn').click()
      timeline.push({ stage: 'first delete clicked', at: Date.now() })
      // No remote acknowledgement is awaited between the two user actions.
      await markedRow(page, secondMarker)
        .getByTestId('time-entry-actions-trigger')
        .click()
      await page.getByTestId('time-entry-delete-btn').click()
      timeline.push({ stage: 'second delete clicked', at: Date.now() })
      await expect(markedRow(page, firstMarker)).toHaveCount(0)
      await expect(markedRow(page, secondMarker)).toHaveCount(0)
      await expect
        .poll(async () => (await deletionDiagnostics(page)).remoteIds.sort(), {
          timeout: 45000,
        })
        .toEqual(expectedIds)
      expect((await deletionDiagnostics(page)).deleteAttempts).toBe(
        before.deleteAttempts + 2,
      )

      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await expect(
        page.locator(
          '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
        ),
      ).toBeVisible({ timeout: 45000 })
      await expect(
        page.getByTestId('time-entry-actions-trigger').first(),
      ).toBeVisible()
      await expect(markedRow(page, firstMarker)).toHaveCount(0)
      await expect(markedRow(page, secondMarker)).toHaveCount(0)
      const afterReload = await deletionDiagnostics(page)
      expect(afterReload.remoteIds.sort()).toEqual(expectedIds)
      expect(afterReload.deleteAttempts).toBe(before.deleteAttempts + 2)
      timeline.push({
        stage: 'reload confirmed both deletions',
        at: Date.now(),
      })
    } finally {
      await testInfo.attach('rapid-deletion-evidence', {
        body: JSON.stringify(
          {
            firstMarker,
            secondMarker,
            timeline,
            diagnostics: await deletionDiagnostics(page),
          },
          null,
          2,
        ),
        contentType: 'application/json',
      })
    }
  })
})
