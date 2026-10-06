import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page } from '@playwright/test'

import type { IHostBridge } from '../../../packages/application/src/contracts/host/IHostBridge'
import { expect, test } from './fixtures/electron-fixture'
const currentDir = dirname(fileURLToPath(import.meta.url))
const seedWorkspaces: Array<{
  id: string
  name: string
  status: string
  dataSourceConnections: Array<{ dataSourceId: string }>
}> = JSON.parse(
  readFileSync(resolve(currentDir, 'fixtures/seed-workspaces.json'), 'utf-8'),
)

declare global {
  interface Window {
    api: IHostBridge
  }
}

async function openWorkspace(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  const actionTrigger = page.getByTestId('time-entry-actions-trigger').first()
  if (await actionTrigger.isVisible().catch(() => false)) {
    return
  }

  const fakeWorkspace = seedWorkspaces.find((workspace) =>
    workspace.dataSourceConnections.some(
      (connection) => connection.dataSourceId === 'mr-tick-datasource-fake',
    ),
  )
  expect(fakeWorkspace).toBeDefined()
  if (!fakeWorkspace) return

  const workspaceTrigger = page
    .locator('nav a[href*="/workspaces/' + fakeWorkspace.id + '"]')
    .or(page.getByRole('button', { name: fakeWorkspace.name, exact: false }))
    .or(page.locator('nav a[href*="/workspaces/"]'))
    .first()

  if (await workspaceTrigger.isVisible().catch(() => false)) {
    await workspaceTrigger.click()
  } else {
    await expect(workspaceTrigger.or(actionTrigger)).toBeVisible({
      timeout: 20000,
    })
    if (await workspaceTrigger.isVisible().catch(() => false)) {
      await workspaceTrigger.click()
    }
  }

  await expect(actionTrigger).toBeVisible({ timeout: 30000 })
}

async function renderedIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="time-entry-row"][data-entry-id]')
    .evaluateAll((rows) =>
      rows
        .map((row) => row.getAttribute('data-entry-id'))
        .filter((id): id is string => id !== null)
        .sort(),
    )
}

async function sync(page: Page): Promise<void> {
  await expect(async () => {
    const syncIndicator = page.getByTestId('sync-status-indicator')
    await syncIndicator.click({ force: true })
    const syncAllButton = page.getByTestId('sync-all-button')
    await expect(syncAllButton).toBeVisible({ timeout: 4000 })
    await syncAllButton.click({ force: true })
  }).toPass({ timeout: 15000 })

  await page.keyboard.press('Escape')
  await expect(
    page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    ),
  ).toBeVisible({ timeout: 30000 })
}

test('widget Electron real: paridade, abas e edição refletida entre janelas', async ({
  electronApp,
  page,
}, testInfo) => {
  test.setTimeout(120000)
  await openWorkspace(page)
  await expect
    .poll(
      () =>
        electronApp
          .windows()
          .filter((window) => window.url().includes('/widgets/timer')).length,
    )
    .toBe(1)
  const widget = electronApp
    .windows()
    .find((window) => window.url().includes('/widgets/timer'))
  expect(widget).toBeDefined()
  if (!widget) return
  const errors: string[] = []
  widget.on('pageerror', (error) => errors.push(error.message))
  await expect(widget.getByTestId('timerbar-overview-button')).toBeVisible({
    timeout: 30000,
  })
  await widget.getByTestId('timerbar-overview-button').click()
  const principalIds = await renderedIds(page)
  expect(principalIds.length).toBeGreaterThan(0)
  await expect
    .poll(() => renderedIds(widget), { timeout: 30000 })
    .toEqual(principalIds)
  await widget.getByTestId('overview-tab-weekly').click()
  await expect(
    widget.getByRole('columnheader', { name: 'Total', exact: true }),
  ).toBeVisible()
  await widget.getByTestId('overview-tab-monthly').click()
  await expect(widget.getByText('Seg', { exact: true }).first()).toBeVisible()
  await widget.getByTestId('overview-tab-list').click()
  await expect.poll(() => renderedIds(widget)).toEqual(principalIds)

  const comment = `QA widget cross-window ${testInfo.testId}`
  await expect(async () => {
    await page.getByTestId('time-entry-actions-trigger').first().click()
    await page.getByTestId('time-entry-edit-btn').click({ timeout: 2000 })
  }).toPass({ timeout: 15000 })
  const commentInput = page.getByTestId('time-entry-comment-input').first()
  await expect(commentInput).toBeVisible()
  await commentInput.fill(comment)
  await commentInput.press('Enter')
  const saveBtn = page.getByTestId('time-entry-save-btn').first()
  await saveBtn.click()
  await expect(saveBtn).not.toBeVisible()

  await expect(page.getByText(comment, { exact: true })).toBeVisible()
  await expect(widget.getByText(comment, { exact: true })).toBeVisible({
    timeout: 10000,
  })
  await expect.poll(() => renderedIds(widget)).toEqual(await renderedIds(page))
  expect(errors).toEqual([])
  const screenshot = await widget.screenshot()
  await testInfo.attach('widget-real.png', {
    body: screenshot,
    contentType: 'image/png',
  })
})

test('popover real: 20 reaberturas por volume fake, sem retries e com amostras brutas', async ({
  electronApp,
  page,
}, testInfo) => {
  test.setTimeout(240000)
  await openWorkspace(page)
  await expect
    .poll(
      () =>
        electronApp
          .windows()
          .filter((window) => window.url().includes('/widgets/timer')).length,
    )
    .toBe(1)
  const widget = electronApp
    .windows()
    .find((window) => window.url().includes('/widgets/timer'))
  expect(widget).toBeDefined()
  if (!widget) return
  const measurements: {
    injected: number
    displayedRows: number
    samplesMs: number[]
    medianMs: number
    p95Ms: number
  }[] = []
  let injected = 0
  for (const target of [20, 50, 200]) {
    const results = await page.evaluate(async (count) => {
      const success: boolean[] = []
      for (let index = 0; index < count; index++) {
        const result = await window.api.addons.executeCommand({
          body: { commandId: 'fake-db:inject-today' },
        })
        success.push(result.isSuccess)
      }
      return success
    }, target - injected)
    expect(results.every(Boolean)).toBe(true)
    injected = target
    await sync(page)
    await expect
      .poll(async () => (await renderedIds(page)).length, { timeout: 45000 })
      .toBeGreaterThanOrEqual(target)
    const expectedIds = await renderedIds(page)
    const samplesMs: number[] = []
    for (let cycle = 0; cycle < 20; cycle++) {
      const started = performance.now()
      await widget.getByTestId('timerbar-overview-button').click()
      await expect
        .poll(() => renderedIds(widget), { timeout: 30000 })
        .toEqual(expectedIds)
      samplesMs.push(performance.now() - started)
      await widget.getByTitle('Fechar', { exact: true }).click()
      await expect(widget.getByTestId('overview-tab-list')).not.toBeVisible()
    }
    const sorted = [...samplesMs].sort((left, right) => left - right)
    const medianMs = sorted.at(10)
    const p95Ms = sorted.at(18)
    expect(medianMs).toBeDefined()
    expect(p95Ms).toBeDefined()
    if (medianMs === undefined || p95Ms === undefined) return
    measurements.push({
      injected,
      displayedRows: expectedIds.length,
      samplesMs,
      medianMs,
      p95Ms,
    })
  }
  const payload = {
    layer:
      'Electron real, Playwright DOM input; wall clock includes automation and polling overhead; volumes add fake rows to existing seed; stopped timer',
    measurements,
  }
  await testInfo.attach('popover-performance.json', {
    body: JSON.stringify(payload, null, 2),
    contentType: 'application/json',
  })
  const evidenceDir = resolve(
    currentDir,
    '../../../../../evidencias_qa_timerbar/rodada-03',
  )
  try {
    writeFileSync(
      resolve(evidenceDir, 'popover-performance.json'),
      JSON.stringify(payload, null, 2),
      'utf-8',
    )
  } catch (err) {
    console.error('Falha ao gravar evidencias rodada 03:', err)
  }
})
