import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { DuckDBInstance } from '@duckdb/node-api'

import {
  expect,
  getElectronUserDataPath,
  test,
} from './fixtures/electron-fixture'
import seedWorkspaces from './fixtures/seed-workspaces.json' with { type: 'json' }

test('unsupported analytics storage blocks editing, retries safely and preserves the original file', async ({
  electronApp,
  page,
}, testInfo) => {
  const workspace = seedWorkspaces.workspaces.find(
    (item) => item.name === 'TESTE',
  )
  if (workspace === undefined) throw new Error('FIXTURE_WORKSPACE_REQUIRED')
  const directory = await electronApp.evaluate(({ app }) =>
    app.getPath('userData'),
  )
  expect(directory).toBe(getElectronUserDataPath(testInfo.workerIndex))
  const storageDirectory = join(directory, 'analytics')
  await mkdir(storageDirectory, { recursive: true })
  const path = join(
    storageDirectory,
    `${createHash('sha256').update(workspace.id).digest('hex')}.duckdb`,
  )
  const instance = await DuckDBInstance.create(path)
  const connection = await instance.connect()
  await connection.run(
    'CREATE TABLE analytics_format(version INTEGER NOT NULL)',
  )
  await connection.run('INSERT INTO analytics_format VALUES (1)')
  connection.closeSync()
  instance.closeSync()

  await page.locator(`nav a[href="#/workspaces/${workspace.id}"]`).click()
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
  )
  await expect(
    page.getByRole('heading', { name: 'Analytics indisponível' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Novo Espaço', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Abrir Background e Conectar Dados' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Tentar abrir novamente' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
  )
  await expect(page.getByRole('alert')).toContainText(path)

  const preserved = await DuckDBInstance.create(path, {
    access_mode: 'READ_ONLY',
  })
  const readerConnection = await preserved.connect()
  const reader = await readerConnection.runAndReadAll(
    'SELECT version FROM analytics_format',
  )
  expect(reader.getRowObjects()).toEqual([{ version: 1 }])
  reader.closeSync()
  readerConnection.closeSync()
  preserved.closeSync()
})

test('invalid saved spaces fail closed and remain intact instead of becoming an editable blank canvas', async ({
  page,
}) => {
  const workspace = seedWorkspaces.workspaces.find(
    (item) => item.name === 'TESTE',
  )
  if (workspace === undefined) throw new Error('FIXTURE_WORKSPACE_REQUIRED')
  const spacesJson = '{invalid-state'
  const saved = await page.evaluate(
    (body) => window.api.addons.saveAnalyticsWorkspaceState({ body }),
    { workspaceId: workspace.id, pollingIntervalMinutes: 0, spacesJson },
  )
  expect(saved.isSuccess).toBe(true)
  await page.locator(`nav a[href="#/workspaces/${workspace.id}"]`).click()
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'ANALYTICS_SPACES_STATE_INVALID',
  )
  await expect(
    page.getByRole('heading', { name: 'Analytics indisponível' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Novo Espaço', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Tentar abrir novamente' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'ANALYTICS_SPACES_STATE_INVALID',
  )
  const current = await page.evaluate(
    (workspaceId) =>
      window.api.addons.hydrateAnalytics({ body: { workspaceId } }),
    workspace.id,
  )
  expect(current.data?.settings?.spacesJson).toBe(spacesJson)
})

test('blocked Analytics screen confirms reset via AlertDialog before wiping legacy v1 DB and recovers cleanly', async ({
  electronApp,
  page,
}, testInfo) => {
  const workspace = seedWorkspaces.workspaces.find(
    (item) => item.name === 'TESTE',
  )
  if (workspace === undefined) throw new Error('FIXTURE_WORKSPACE_REQUIRED')

  const directory = await electronApp.evaluate(({ app }) =>
    app.getPath('userData'),
  )
  expect(directory).toBe(getElectronUserDataPath(testInfo.workerIndex))
  const storageDirectory = join(directory, 'analytics')
  await mkdir(storageDirectory, { recursive: true })
  const storagePath = join(
    storageDirectory,
    `${createHash('sha256').update(workspace.id).digest('hex')}.duckdb`,
  )
  const instance = await DuckDBInstance.create(storagePath)
  const connection = await instance.connect()
  await connection.run(
    'CREATE TABLE analytics_format(version INTEGER NOT NULL)',
  )
  await connection.run('INSERT INTO analytics_format VALUES (1)')
  connection.closeSync()
  instance.closeSync()

  await page.locator(`nav a[href="#/workspaces/${workspace.id}"]`).click()
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()

  await expect(page.getByRole('alert')).toContainText(
    'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
  )
  await expect(page.getByTestId('analytics-reset-storage-btn')).toBeVisible()
  await expect(page.getByTestId('runtime-status-indicator-btn')).toBeVisible()

  // Canceling the AlertDialog preserves the v1 database intact
  await page.getByTestId('analytics-reset-storage-btn').click()
  await expect(page.getByTestId('analytics-reset-dialog')).toBeVisible()
  await page.getByTestId('analytics-cancel-reset-storage-btn').click()
  await expect(page.getByTestId('analytics-reset-dialog')).toBeHidden()
  expect(existsSync(storagePath)).toBe(true)

  const stillV1 = await DuckDBInstance.create(storagePath, {
    access_mode: 'READ_ONLY',
  })
  const v1Conn = await stillV1.connect()
  const v1Rows = await v1Conn.runAndReadAll(
    'SELECT version FROM analytics_format',
  )
  expect(v1Rows.getRowObjects()).toEqual([{ version: 1 }])
  v1Rows.closeSync()
  v1Conn.closeSync()
  stillV1.closeSync()

  // Confirming the AlertDialog resets storage and opens a clean v2 workspace canvas
  await page.getByTestId('analytics-reset-storage-btn').click()
  await page.getByTestId('analytics-confirm-reset-storage-btn').click()

  await expect(
    page.getByRole('button', { name: 'Novo Espaço', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Abrir Background e Conectar Dados' }),
  ).toBeVisible()
  await expect(page.getByTestId('runtime-status-indicator-btn')).toHaveCount(0)

  await expect
    .poll(async () => {
      const snapshot = await page.evaluate(() =>
        window.api.diagnostics.getSnapshot(),
      )
      return snapshot.data?.storages.find(
        (s) => s.id === `analytics-${workspace.id}`,
      )?.measurement.status
    })
    .toBe('available')

  await electronApp.close()

  const upgraded = await DuckDBInstance.create(storagePath, {
    access_mode: 'READ_ONLY',
  })
  const v2Conn = await upgraded.connect()
  const v2Rows = await v2Conn.runAndReadAll(
    'SELECT version FROM analytics_format',
  )
  expect(v2Rows.getRowObjects()).toEqual([{ version: 2 }])
  v2Rows.closeSync()
  v2Conn.closeSync()
  upgraded.closeSync()
})

test('Diagnostics tab surfaces analytics storage errors, resets via AlertDialog, and recovers open Analytics screen live', async ({
  electronApp,
  page,
}, testInfo) => {
  const workspace = seedWorkspaces.workspaces.find(
    (item) => item.name === 'TESTE',
  )
  if (workspace === undefined) throw new Error('FIXTURE_WORKSPACE_REQUIRED')

  const directory = await electronApp.evaluate(({ app }) =>
    app.getPath('userData'),
  )
  expect(directory).toBe(getElectronUserDataPath(testInfo.workerIndex))
  const storageDirectory = join(directory, 'analytics')
  await mkdir(storageDirectory, { recursive: true })
  const storagePath = join(
    storageDirectory,
    `${createHash('sha256').update(workspace.id).digest('hex')}.duckdb`,
  )
  const instance = await DuckDBInstance.create(storagePath)
  const connection = await instance.connect()
  await connection.run(
    'CREATE TABLE analytics_format(version INTEGER NOT NULL)',
  )
  await connection.run('INSERT INTO analytics_format VALUES (1)')
  connection.closeSync()
  instance.closeSync()

  // Passive disk inspection already sees the unsupported DB before visiting Analytics
  const passiveSnapshot = await page.evaluate(() =>
    window.api.diagnostics.getSnapshot(),
  )
  expect(passiveSnapshot.isSuccess).toBe(true)
  expect(
    passiveSnapshot.data?.storages.find(
      (s) => s.id === `analytics-${workspace.id}`,
    )?.measurement,
  ).toMatchObject({
    status: 'error',
    reason: 'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
  })

  // Opening Analytics emits live runtime storage error and lights up RuntimeStatusIndicator
  await page.locator(`nav a[href="#/workspaces/${workspace.id}"]`).click()
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Analytics indisponível' }),
  ).toBeVisible()
  await expect(page.getByTestId('runtime-status-indicator-btn')).toBeVisible()

  await page.getByTestId('runtime-status-indicator-btn').click()
  await expect(page.getByTestId('system-data-settings-tab')).toBeVisible()

  const storageItem = page.getByTestId(`storage-item-analytics-${workspace.id}`)
  await expect(storageItem).toBeVisible()
  await expect(storageItem.getByTestId('storage-error-badge')).toHaveText(
    'Erro',
  )
  await expect(storageItem.getByTestId('storage-error-reason')).toHaveText(
    'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
  )
  await expect(storageItem.getByTestId('storage-error-details')).toContainText(
    'storedFormatVersion: 1',
  )
  await expect(
    page.getByTestId(
      `diagnostic-check-probe-analytics-storage-${workspace.id}`,
    ),
  ).toContainText('ANALYTICS_STORAGE_FORMAT_UNSUPPORTED')

  // Cancel reset AlertDialog inside Diagnostics preserves file and error state
  await page.getByTestId(`reset-storage-analytics-${workspace.id}`).click()
  await expect(
    page.getByTestId(`reset-storage-dialog-analytics-${workspace.id}`),
  ).toBeVisible()
  await page
    .getByTestId(`cancel-reset-storage-analytics-${workspace.id}`)
    .click()
  await expect(
    page.getByTestId(`reset-storage-dialog-analytics-${workspace.id}`),
  ).toBeHidden()
  expect(existsSync(storagePath)).toBe(true)

  // Confirm reset AlertDialog clears legacy v1 storage, clears diagnostics errors, and recovers open Analytics live
  await page.getByTestId(`reset-storage-analytics-${workspace.id}`).click()
  await page
    .getByTestId(`confirm-reset-storage-analytics-${workspace.id}`)
    .click()

  await expect(page.getByTestId('storage-error-badge')).toHaveCount(0)
  await expect(page.getByTestId('storage-error-reason')).toHaveCount(0)
  await expect(page.getByTestId('runtime-status-indicator-btn')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('global-settings-dialog')).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Novo Espaço', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Analytics indisponível' }),
  ).toHaveCount(0)

  await expect
    .poll(async () => {
      const snapshot = await page.evaluate(() =>
        window.api.diagnostics.getSnapshot(),
      )
      return snapshot.data?.storages.find(
        (s) => s.id === `analytics-${workspace.id}`,
      )?.measurement.status
    })
    .toBe('available')

  await electronApp.close()

  const upgraded = await DuckDBInstance.create(storagePath, {
    access_mode: 'READ_ONLY',
  })
  const v2Conn = await upgraded.connect()
  const v2Rows = await v2Conn.runAndReadAll(
    'SELECT version FROM analytics_format',
  )
  expect(v2Rows.getRowObjects()).toEqual([{ version: 2 }])
  v2Rows.closeSync()
  v2Conn.closeSync()
  upgraded.closeSync()
})
