import type { AddonLoadFailuresSnapshot } from '../../../packages/shared/src/view-models/AddonLoadFailureViewModel'
import {
  assertBeforeFixtureCleanup,
  checkDockBounds,
  checkedTestProfile,
  openDockWorkspace,
  readFailures,
  rect,
  setDockPosition,
  writeFailurePackage,
} from './addons-trail-dock.qa-helpers'
import { expect, test } from './fixtures/electron-fixture'

test.describe('Addons Dock: real Electron layout, input and IPC', () => {
  test.beforeAll(async ({}, workerInfo) => {
    await assertBeforeFixtureCleanup(workerInfo.workerIndex)
  })
  for (const position of ['right', 'left', 'top', 'bottom'] as const) {
    test(`${position}: bounds, real clicks, overlay and focus`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120000)
      await openDockWorkspace(page)
      await setDockPosition(page, position)

      for (const viewport of [
        { width: 1600, height: 900 },
        { width: 1100, height: 720 },
      ]) {
        await page.setViewportSize(viewport)
        await checkDockBounds(page, position)
        const content = page.getByTestId('workspace-content')
        const centerBefore = await rect(content)
        const sameNode = await content.elementHandle()
        if (!sameNode) throw new Error('Workspace center is absent')

        const diagnostic = page.getByTestId('sync-status-indicator')
        await diagnostic.click()
        const drawer = page.getByTestId('addons-diagnostics-drawer')
        await expect(drawer).toBeVisible()
        await expect(
          drawer.getByRole('heading', { name: /Local Database/i }),
        ).toBeVisible()
        expect(await sameNode.evaluate((element) => element.isConnected)).toBe(
          true,
        )
        expect(await rect(content)).toEqual(centerBefore)

        // Measure focus containment after actual keyboard input, not programmatic focus.
        const close = drawer.getByRole('button', { name: 'Close', exact: true })
        await close.focus()
        await page.keyboard.press('Tab')
        expect(
          await drawer.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        ).toBe(true)
        await page.keyboard.press('Shift+Tab')
        expect(
          await drawer.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        ).toBe(true)
        await testInfo.attach(`dock-${position}-${viewport.width}-open.png`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
        await page.keyboard.press('Escape')
        await expect(drawer).not.toBeVisible()
        await expect(diagnostic).toBeFocused()
        await diagnostic.press('Enter')
        await expect(drawer).toBeVisible()
        await page.keyboard.press('Escape')

        const addon = page
          .getByTestId('addons-trail-dock')
          .locator('button[data-addon-id="mr-tick-datasource-fake"]')
        await expect(addon).toHaveAccessibleName(/DataSource Fake/)
        await addon.click()
        const settings = page.getByRole('dialog').filter({
          has: page.getByRole('heading', {
            name: 'DataSource Fake (Testes)',
            exact: true,
          }),
        })
        await expect(settings).toBeVisible()
        await expect(
          settings.getByTestId('addon-capability-tab-dataSource'),
        ).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(settings).not.toBeVisible()
        await checkDockBounds(page, position)
        await testInfo.attach(`dock-${position}-${viewport.width}-closed.png`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
        await sameNode.dispose()
      }
    })
  }

  test('checkbox is labelled and a click creates one selection/history transition; timer picker survives none', async ({
    page,
  }) => {
    await openDockWorkspace(page)
    const diagnostic = page.getByRole('button', {
      name: 'Diagnóstico dos addons',
      exact: true,
    })
    await diagnostic.click()
    const drawer = page.getByTestId('addons-diagnostics-drawer')
    await drawer.getByRole('button', { name: 'Nenhuma', exact: true }).click()
    const boxes = drawer.getByRole('checkbox')
    expect(await boxes.count()).toBeGreaterThan(0)
    const checkbox = boxes.first()
    await expect(checkbox).toHaveAccessibleName(/\S/)
    await expect(checkbox).not.toBeChecked()
    const urlBefore = page.url()
    const historyBefore = await page.evaluate(() => history.length)
    await checkbox.click()
    await expect(checkbox).toBeChecked()
    await expect(page).not.toHaveURL(urlBefore)
    expect(await page.evaluate(() => history.length)).toBe(historyBefore + 1)
    await page.goBack()
    await expect(page).toHaveURL(urlBefore)
    await expect(checkbox).not.toBeChecked()
    await page.keyboard.press('Escape')
    await page
      .getByTestId('workspace-timebar')
      .getByTestId('timerbar-task-popover-trigger')
      .click()
    await expect(
      page.getByRole('textbox', { name: 'Buscar tarefa', exact: true }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Fechar detalhes da tarefa', exact: true })
      .click()
  })

  for (const scenario of [
    {
      variant: 'syntax',
      reason: 'IMPORT_FAILED',
      source: 'export default class {',
    },
    {
      variant: 'primitive',
      reason: 'INVALID_DEFAULT_EXPORT',
      source: 'export default 42',
    },
    {
      variant: 'missing-default',
      reason: 'INVALID_DEFAULT_EXPORT',
      source:
        'export async function activate() {} export async function deactivate() {}',
    },
    {
      variant: 'activation',
      reason: 'INITIALIZATION_FAILED',
      source:
        'export default class QaDock { async activate() { throw new Error("QA_DOCK_INIT_SENTINEL") } async deactivate() {} }',
    },
  ]) {
    test(`${scenario.reason} (${scenario.variant}): disk -> loader -> real IPC push, initial pull and uninstall`, async ({
      electronApp,
      page,
    }, testInfo) => {
      await openDockWorkspace(page)
      const profile = await checkedTestProfile(
        electronApp,
        testInfo.workerIndex,
      )
      const fixture = await writeFailurePackage(profile, scenario.source)
      const before = await readFailures(page)
      await page.evaluate(() => {
        window.addonsDockQaEvents = []
        window.api.events.on<AddonLoadFailuresSnapshot>(
          'addons:load-failures-changed',
          (snapshot) => {
            window.addonsDockQaEvents?.push(snapshot)
          },
        )
      })
      // Existing production handler resolves the installed directory and calls the real loader.
      // No handler, import, authorization service or snapshot is replaced by a mock.
      await page.evaluate(
        (addonId) => window.api.addons.getSchema({ body: { addonId } }),
        fixture.id,
      )
      await expect
        .poll(
          async () =>
            (await readFailures(page)).failures.find(
              (failure) => failure.addonId === fixture.id,
            )?.reason,
        )
        .toBe(scenario.reason)
      const failed = await readFailures(page)
      expect(failed.revision).toBeGreaterThan(before.revision)
      expect(
        failed.failures.find((failure) => failure.addonId === fixture.id),
      ).toMatchObject({
        reason: scenario.reason,
        folderPath: fixture.folder,
        entryPath: fixture.entry,
      })
      await expect
        .poll(() =>
          page.evaluate(
            (id) =>
              window.addonsDockQaEvents?.some((snapshot) =>
                snapshot.failures.some((failure) => failure.addonId === id),
              ) ?? false,
            fixture.id,
          ),
        )
        .toBe(true)
      const icon = page
        .getByTestId('addons-trail-dock')
        .locator(`button[data-addon-id="${fixture.id}"]`)
      await expect(icon).toBeVisible()
      await icon.click()
      const drawer = page.getByTestId('addons-diagnostics-drawer')
      await expect(drawer).toContainText(scenario.reason)
      if (scenario.reason === 'INITIALIZATION_FAILED')
        await expect(drawer).toContainText('QA_DOCK_INIT_SENTINEL')
      await page.keyboard.press('Escape')
      await page.reload()
      await expect(icon).toBeVisible() // Survives renderer restart through initial real IPC pull.
      const removed = await page.evaluate(
        (addonId) =>
          window.api.addons.uninstall({ body: { addonId, version: '1.0.0' } }),
        fixture.id,
      )
      expect(removed.isSuccess).toBe(true)
      await expect
        .poll(async () =>
          (await readFailures(page)).failures.some(
            (failure) => failure.addonId === fixture.id,
          ),
        )
        .toBe(false)
      expect((await readFailures(page)).revision).toBeGreaterThan(
        failed.revision,
      )
      await expect(icon).toHaveCount(0)
      await testInfo.attach('real-ipc-snapshot.json', {
        body: JSON.stringify(failed),
        contentType: 'application/json',
      })
    })
  }
})
