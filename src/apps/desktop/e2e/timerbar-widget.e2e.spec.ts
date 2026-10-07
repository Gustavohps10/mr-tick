import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page } from '@playwright/test'

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

test('widget Electron real: popover, abas e reabertura com paridade entre janelas', async ({
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
    timeout: 15000,
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

  await widget.getByTitle('Fechar', { exact: true }).click()
  await expect(widget.getByTestId('overview-tab-list')).not.toBeVisible({
    timeout: 5000,
  })
  await widget.getByTestId('timerbar-overview-button').click()
  await expect
    .poll(() => renderedIds(widget), { timeout: 15000 })
    .toEqual(principalIds)

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
