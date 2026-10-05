import { z } from 'zod'

import type { IHostBridge } from '../../../packages/application/src/contracts/host/IHostBridge'
import { expect, test } from './fixtures/electron-fixture'

interface DurationSyncObservation {
  at: number
  status: string | null
  label: string | null
}

declare global {
  interface Window {
    api: IHostBridge
    recordDurationSyncObservation: (
      observation: DurationSyncObservation,
    ) => Promise<void>
  }
}

const durationDiagnosticsSchema = z.object({
  updateAttempts: z.number(),
  createAttempts: z.number(),
  deleteAttempts: z.number(),
  remoteIds: z.array(z.string()),
  pullAttempts: z.number(),
  entries: z.array(
    z.object({ id: z.string().optional(), comments: z.string().optional() }),
  ),
})

function observeDurationSync() {
  let previous: string | null = null
  const observe = () => {
    const indicator = document.querySelector(
      '[data-testid="sync-status-indicator"]',
    )
    if (!indicator) return
    const status = indicator.getAttribute('data-status')
    const label = indicator.getAttribute('aria-label')
    const current = JSON.stringify([status, label])
    if (current === previous) return
    previous = current
    void window.recordDurationSyncObservation({ at: Date.now(), status, label })
  }
  const install = () => {
    new MutationObserver(observe).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-status', 'aria-label'],
    })
    observe()
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install)
    return
  }
  install()
}

test.describe('E2E - Edição de Duração e Horários (TE-05)', () => {
  test('deve alterar início e fim de um apontamento, recalcular duração automaticamente e persistir pós-reload', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000)
    const marker = 'TE05-duration-' + crypto.randomUUID()
    const observations: DurationSyncObservation[] = []
    const timeline: { stage: string; at: number }[] = []
    const diagnostics = async () => {
      const result = await page.evaluate(() =>
        window.api.addons.executeCommand({
          body: { commandId: 'fake-db:get-time-entry-sync-diagnostics' },
        }),
      )
      expect(result.isSuccess).toBe(true)
      return durationDiagnosticsSchema.parse(result.data)
    }
    await page.exposeFunction(
      'recordDurationSyncObservation',
      (observation: DurationSyncObservation) => {
        observations.push(observation)
      },
    )
    await page.addInitScript(observeDurationSync)
    await page.evaluate(observeDurationSync)
    try {
      const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
      await expect(workspaceLink).toBeVisible({ timeout: 15000 })
      const href = await workspaceLink.getAttribute('href')
      expect(href).not.toBeNull()
      if (!href) return
      const workspaceId = href
        .split('/')
        .filter(Boolean)
        .find((part, index, parts) => parts[index - 1] === 'workspaces')
      expect(workspaceId).toBeDefined()
      if (!workspaceId) return
      await workspaceLink.click()
      const workspace = await page.evaluate(
        (id) => window.api.workspaces.getById({ body: { workspaceId: id } }),
        workspaceId,
      )
      expect(workspace.isSuccess).toBe(true)
      expect(workspace.data).toBeDefined()
      if (!workspace.data) return
      const connections = workspace.data.dataSourceConnections.filter(
        (connection) => connection.status === 'connected',
      )
      expect(connections).toHaveLength(1)
      const connection = connections.find(
        (candidate) => candidate.status === 'connected',
      )
      if (!connection) return

      const syncIndicator = page.locator(
        '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
      )
      await expect(syncIndicator).toBeVisible({ timeout: 45000 })
      const actions = page.getByTestId('time-entry-actions-trigger')
      await expect(actions.first()).toBeVisible({ timeout: 15000 })
      const edit = page.getByTestId('time-entry-edit-btn')
      await expect(async () => {
        await actions.first().click()
        await expect(edit).toBeVisible({ timeout: 2000 })
      }).toPass({ timeout: 15000 })
      await edit.click()
      const editingRow = page
        .locator('tr')
        .filter({ has: page.getByTestId('time-entry-save-btn') })
      await expect(editingRow).toHaveCount(1)
      const identityMarker = marker + '-original'
      const identityComment = editingRow.getByTestId('time-entry-comment-input')
      await identityComment.fill(identityMarker)
      await identityComment.press('Enter')
      await editingRow.getByTestId('time-entry-save-btn').click()
      await expect
        .poll(
          async () =>
            (await diagnostics()).entries.filter(
              (entry) => entry.comments === identityMarker && Boolean(entry.id),
            ).length,
          { timeout: 45000 },
        )
        .toBe(1)
      const original = await diagnostics()
      const originalRemoteId = original.entries.find(
        (entry) => entry.comments === identityMarker,
      )?.id
      expect(originalRemoteId).toBeDefined()
      if (!originalRemoteId) return
      const originalRow = page
        .locator('tr')
        .filter({ has: page.getByText(identityMarker, { exact: true }) })
      await originalRow.getByTestId('time-entry-actions-trigger').click()
      await edit.click()
      await expect(editingRow).toHaveCount(1)
      await editingRow.getByTestId('time-entry-start-time-input').fill('09:00')
      await editingRow.getByTestId('time-entry-start-time-input').press('Enter')
      await editingRow.getByTestId('time-entry-end-time-input').fill('11:30')
      await editingRow.getByTestId('time-entry-end-time-input').press('Enter')
      await expect(
        editingRow.getByTestId('time-entry-duration-input'),
      ).toHaveValue(/0?2:30/)
      const comment = editingRow.getByTestId('time-entry-comment-input')
      await comment.fill(marker)
      await comment.press('Enter')
      const save = editingRow.getByTestId('time-entry-save-btn')
      await save.click()
      await expect(save).not.toBeVisible({ timeout: 10000 })
      timeline.push({
        stage: 'saved locally; reloading without remote acknowledgement',
        at: Date.now(),
      })
      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      const persistedRow = page
        .locator('tr')
        .filter({ has: page.getByText(marker, { exact: true }) })
      await expect(persistedRow).toHaveCount(1, { timeout: 45000 })
      await expect(
        persistedRow.getByTestId('time-entry-start-time-input'),
      ).toHaveValue('09:00')
      await expect(
        persistedRow.getByTestId('time-entry-end-time-input'),
      ).toHaveValue('11:30')
      await expect(
        persistedRow.getByTestId('time-entry-duration-input'),
      ).toHaveValue('02:30:00')
      timeline.push({
        stage: 'marked row persisted after immediate reload',
        at: Date.now(),
      })
      await expect
        .poll(
          async () =>
            (await diagnostics()).entries.filter(
              (entry) => entry.comments === marker && Boolean(entry.id),
            ).length,
          { timeout: 45000 },
        )
        .toBe(1)
      const remoteId = (await diagnostics()).entries.find(
        (entry) => entry.comments === marker,
      )?.id
      expect(remoteId).toBe(originalRemoteId)
      const confirmed = await diagnostics()
      expect(confirmed.remoteIds.sort()).toEqual(original.remoteIds.sort())
      expect(confirmed.createAttempts).toBe(original.createAttempts)
      expect(confirmed.deleteAttempts).toBe(original.deleteAttempts)
      if (!remoteId) return
      await expect(async () => {
        const result = await page.evaluate(
          ({ workspaceId, connectionInstanceId }) =>
            window.api.timeEntries.listTimeEntries({
              body: {
                workspaceId,
                connectionInstanceId,
                startDate: new Date(0),
                endDate: new Date(Date.now() + 86400000),
              },
            }),
          { workspaceId, connectionInstanceId: connection.id },
        )
        expect(result.isSuccess).toBe(true)
        const remote = result.data?.find((entry) => entry.id === remoteId)
        expect(remote).toBeDefined()
        expect(remote?.comments).toBe(marker)
        expect(remote?.timeSpent).toBe(2.5)
        expect(remote?.startDate).toBeDefined()
        expect(remote?.endDate).toBeDefined()
        if (!remote?.startDate || !remote.endDate) return
        const start = new Date(remote.startDate)
        const end = new Date(remote.endDate)
        expect([start.getHours(), start.getMinutes()]).toEqual([9, 0])
        expect([end.getHours(), end.getMinutes()]).toEqual([11, 30])
        expect(end.getTime() - start.getTime()).toBe(2.5 * 3600000)
      }).toPass({ timeout: 45000 })
      timeline.push({
        stage: 'same remote ID confirmed hours and interval',
        at: Date.now(),
      })
      await expect(syncIndicator).toBeVisible({ timeout: 45000 })
      await expect(
        persistedRow.getByTestId('time-entry-duration-input'),
      ).toHaveValue('02:30:00')
    } finally {
      await testInfo.attach('duration-identity-and-sync-evidence', {
        body: JSON.stringify(
          { marker, timeline, observations, diagnostics: await diagnostics() },
          null,
          2,
        ),
        contentType: 'application/json',
      })
    }
  })
})
