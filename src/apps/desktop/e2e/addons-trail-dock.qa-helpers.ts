import { randomUUID } from 'node:crypto'
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ElectronApplication, Locator, Page } from '@playwright/test'

import type { IHostBridge } from '../../../packages/application/src/contracts/host/IHostBridge'
import type { AddonLoadFailuresSnapshot } from '../../../packages/shared/src/view-models/AddonLoadFailureViewModel'
import { expect } from './fixtures/electron-fixture'
import seed from './fixtures/seed-workspaces.json' with { type: 'json' }

declare global {
  interface Window {
    api: IHostBridge
    addonsDockQaEvents?: AddonLoadFailuresSnapshot[]
  }
}

export type DockPosition = 'right' | 'left' | 'top' | 'bottom'
const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export async function assertBeforeFixtureCleanup(workerIndex: number) {
  // Runs in beforeAll, before the shared test-scoped fixture removes storage.
  // Reject junctions in every existing ancestor of its fixed worker profile.
  for (const folder of [
    join(desktopRoot, 'test-results'),
    join(desktopRoot, 'test-results/electron-user-data'),
    join(
      desktopRoot,
      'test-results/electron-user-data',
      `worker-${workerIndex}`,
    ),
  ]) {
    try {
      expect((await lstat(folder)).isSymbolicLink()).toBe(false)
      const physicalRoot = await realpath(desktopRoot)
      const physicalFolder = await realpath(folder)
      expect(
        physicalFolder.startsWith(join(physicalRoot, 'test-results')),
      ).toBe(true)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        continue
      throw error
    }
  }
}

export async function openDockWorkspace(page: Page) {
  const workspace = seed.workspaces.find((item) =>
    item.connections.some(
      (connection) => connection.addonId === 'mr-tick-datasource-fake',
    ),
  )
  if (!workspace) throw new Error('QA fixture missing explicit fake workspace')

  await page.locator(`nav a[href*="/workspaces/${workspace.id}"]`).click()
  await expect(page.getByTestId('addons-trail-dock')).toBeVisible()
  return workspace.id
}

export async function setDockPosition(page: Page, position: DockPosition) {
  await page
    .getByTestId('workspace-timebar')
    .getByRole('button', { name: 'Configurações', exact: true })
    .click()
  // Existing compass has four unnamed buttons, in this inspected DOM order.
  // This sets up layout; accessible names of dock actions are tested separately.
  const compass = page
    .getByText('Ancoragem', { exact: true })
    .locator('..')
    .locator('..')
  const order: Record<DockPosition, number> = {
    top: 0,
    left: 1,
    right: 2,
    bottom: 3,
  }
  await expect(compass.getByRole('button')).toHaveCount(4)
  await compass.getByRole('button').nth(order[position]).click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('workspace-timebar')).toHaveAttribute(
    'data-position',
    position,
  )
}

export async function rect(locator: Locator) {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }
  })
}

export async function checkDockBounds(page: Page, position: DockPosition) {
  const dock = await rect(page.getByTestId('addons-trail-dock'))
  const timer = await rect(page.getByTestId('workspace-timebar'))
  const center = await rect(page.getByTestId('workspace-content'))
  expect(dock.width).toBeCloseTo(48, 1)
  expect(dock.height).toBeGreaterThan(0)
  expect(center.width).toBeGreaterThan(0)

  for (const other of [timer, center]) {
    const intersectionWidth =
      Math.min(dock.x + dock.width, other.x + other.width) -
      Math.max(dock.x, other.x)
    const intersectionHeight =
      Math.min(dock.y + dock.height, other.y + other.height) -
      Math.max(dock.y, other.y)
    expect(intersectionWidth <= 0.5 || intersectionHeight <= 0.5).toBe(true)
  }

  expect(dock.x).toBeGreaterThan(center.x)
  if (position === 'right') expect(timer.x + timer.width).toBeCloseTo(dock.x, 0)
  if (position === 'left')
    expect(timer.x + timer.width).toBeLessThanOrEqual(center.x + 0.5)
  if (position === 'top')
    expect(timer.x + timer.width).toBeLessThanOrEqual(dock.x + 0.5)
  if (position === 'bottom')
    expect(timer.x + timer.width).toBeLessThanOrEqual(dock.x + 0.5)
}

export async function checkedTestProfile(
  app: ElectronApplication,
  workerIndex: number,
) {
  const userData = await app.evaluate(({ app: electronApp }) =>
    electronApp.getPath('userData'),
  )
  const expected = resolve(
    desktopRoot,
    'test-results/electron-user-data',
    `worker-${workerIndex}`,
  )
  expect(resolve(userData)).toBe(expected)
  expect(await realpath(userData)).toBe(await realpath(expected))
  // New addon writes must not follow junctions outside the isolated profile.
  expect((await lstat(join(userData, 'addons'))).isSymbolicLink()).toBe(false)
  return userData
}

export async function writeFailurePackage(userData: string, source: string) {
  const id = `qa-dock-${randomUUID()}`
  const root = join(userData, 'addons', id)
  await mkdir(root)
  const folder = join(root, '1.0.0')
  await mkdir(folder)
  await mkdir(join(folder, 'dist'))
  await writeFile(
    join(folder, 'package.json'),
    JSON.stringify({ name: id, version: '1.0.0', type: 'module' }),
  )
  await writeFile(
    join(folder, 'manifest.yaml'),
    `id: ${id}\nname: ${id}\nversion: 1.0.0\nrequiredApiVersion: '-1'\ntier: free\ncapabilities: [theme]\nauthor: QA\nshortDescription: Isolated dock fixture\ndescription: Isolated dock fixture\n`,
  )
  const entry = join(folder, 'dist/index.js')
  await writeFile(entry, source)
  return { id, folder, entry }
}

export async function readFailures(page: Page) {
  const result = await page.evaluate(() => window.api.addons.getLoadFailures())
  expect(result.isSuccess).toBe(true)
  if (!result.data) throw new Error('Missing real IPC failure snapshot')
  return result.data
}
