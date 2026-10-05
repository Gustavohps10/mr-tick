import type { Page } from '@playwright/test'
import { z } from 'zod'

import type { IHostBridge } from '../../../packages/application/src/contracts/host/IHostBridge'
import { expect, test } from './fixtures/electron-fixture'

declare global {
  interface Window {
    api: IHostBridge
  }
}

const diagnosticsSchema = z.object({
  timeEntryCount: z.number(),
  listFailures: z.number(),
  partialLists: z.number(),
  deleteAttempts: z.number(),
  remoteIds: z.array(z.string()),
  pullAttempts: z.number(),
})
interface FaultScenario {
  name: string
  command: string
  counter: 'listFailures' | 'partialLists'
}
const faults: FaultScenario[] = [
  {
    name: 'falha 503 na listagem preserva os registros locais e não envia DELETE remoto',
    command: 'fake-db:fail-next-time-entry-list',
    counter: 'listFailures',
  },
  {
    name: 'listagem parcial preserva os registros locais e não envia DELETE remoto',
    command: 'fake-db:partial-next-time-entry-list',
    counter: 'partialLists',
  },
]

async function executeFakeCommand(page: Page, commandId: string) {
  const result = await page.evaluate(
    (id) => window.api.addons.executeCommand({ body: { commandId: id } }),
    commandId,
  )
  expect(
    result.isSuccess,
    result.error ? String(result.error) : commandId,
  ).toBe(true)
  return result.data
}

async function diagnostics(page: Page) {
  return diagnosticsSchema.parse(
    await executeFakeCommand(page, 'fake-db:get-time-entry-sync-diagnostics'),
  )
}

async function openWorkspace(page: Page) {
  const workspace = page.locator('nav a[href*="/workspaces/"]').first()
  await expect(workspace).toBeVisible()
  await workspace.click()
  await expect(
    page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    ),
  ).toBeVisible({ timeout: 30000 })
  await expect(
    page.locator('[data-testid="time-entry-actions-trigger"]').first(),
  ).toBeVisible()
  // Complete the real initial replication before measuring the cache baseline.
  await flushReplication(page)
}

async function reconcile(page: Page) {
  await page.locator('[data-testid="sync-status-indicator"]').click()
  await page
    .getByRole('button', { name: 'Mais opções de sincronização', exact: true })
    .click()
  await page
    .getByRole('menuitem', { name: 'Conciliar excluídos (Todas instâncias)' })
    .click()
}

async function flushReplication(page: Page) {
  const syncAll = page.locator('[data-testid="sync-all-button"]')
  const openedForFlush = !(await syncAll.isVisible())
  if (openedForFlush) {
    await page.getByTestId('sync-status-indicator').click()
  }
  await expect(syncAll).toBeVisible()
  await expect(syncAll).toBeEnabled({ timeout: 30000 })
  const before = await diagnostics(page)
  await syncAll.click()
  await expect
    .poll(async () => (await diagnostics(page)).pullAttempts)
    .toBeGreaterThan(before.pullAttempts)
  await expect(syncAll).toBeEnabled({ timeout: 30000 })
  await expect(
    page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    ),
  ).toBeVisible({ timeout: 30000 })
  if (openedForFlush) {
    await page.keyboard.press('Escape')
    await expect(syncAll).not.toBeVisible()
  }
}

test.describe('E2E - Reconciliação não pode excluir apontamentos remotos', () => {
  for (const fault of faults) {
    test(fault.name, async ({ page }, testInfo) => {
      await openWorkspace(page)
      const entries = page.locator('[data-testid="time-entry-actions-trigger"]')
      const localCount = await entries.count()
      const before = await diagnostics(page)
      expect(before.timeEntryCount).toBeGreaterThan(0)

      await executeFakeCommand(page, fault.command)
      await reconcile(page)
      await expect
        .poll(async () => (await diagnostics(page))[fault.counter])
        .toBe(before[fault.counter] + 1)
      // Flush real replication so the test observes any DELETE produced by the sweep.
      await flushReplication(page)
      const after = await diagnostics(page)
      await testInfo.attach('remote-integrity', {
        body: JSON.stringify(
          { before, after, localCount, localCountAfter: await entries.count() },
          null,
          2,
        ),
        contentType: 'application/json',
      })
      expect(
        after.deleteAttempts,
        'Uma consulta inválida não autoriza DELETE remoto',
      ).toBe(before.deleteAttempts)
      expect(after.remoteIds.sort()).toEqual(before.remoteIds.sort())
      expect(after.timeEntryCount).toBe(before.timeEntryCount)
      await expect(entries).toHaveCount(localCount)
    })
  }

  test('exclusão feita diretamente no servidor remove apenas o cache local e não reenvia DELETE', async ({
    page,
  }) => {
    await openWorkspace(page)
    const entries = page.locator('[data-testid="time-entry-actions-trigger"]')
    const localCount = await entries.count()
    const before = await diagnostics(page)
    const removed = z
      .object({ id: z.string().min(1) })
      .parse(await executeFakeCommand(page, 'fake-db:delete-random'))
    expect(before.remoteIds).toContain(removed.id)
    const remoteAfterDeletion = await diagnostics(page)
    expect(remoteAfterDeletion.timeEntryCount).toBe(before.timeEntryCount - 1)
    await reconcile(page)
    await expect(entries).toHaveCount(localCount - 1)
    await flushReplication(page)
    const after = await diagnostics(page)
    expect(after.deleteAttempts).toBe(before.deleteAttempts)
    expect(after.remoteIds.sort()).toEqual(remoteAfterDeletion.remoteIds.sort())
  })

  test('exclusão solicitada pelo usuário continua excluindo exatamente um registro remoto', async ({
    page,
  }) => {
    await openWorkspace(page)
    const entries = page.locator('[data-testid="time-entry-actions-trigger"]')
    const localCount = await entries.count()
    const before = await diagnostics(page)
    const deleteButton = page.locator('[data-testid="time-entry-delete-btn"]')
    await expect(async () => {
      await entries.first().scrollIntoViewIfNeeded()
      await entries.first().click()
      await expect(deleteButton).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await deleteButton.click()
    await expect(entries).toHaveCount(localCount - 1)
    await expect
      .poll(async () => (await diagnostics(page)).timeEntryCount)
      .toBe(before.timeEntryCount - 1)
    const after = await diagnostics(page)
    expect(after.deleteAttempts).toBe(before.deleteAttempts + 1)
    expect(
      before.remoteIds.filter((id) => !after.remoteIds.includes(id)),
    ).toHaveLength(1)
  })
})
