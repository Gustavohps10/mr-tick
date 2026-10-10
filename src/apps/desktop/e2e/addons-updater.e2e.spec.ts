import { randomUUID } from 'node:crypto'
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import { dirname, join, resolve, sep } from 'node:path'

import archiver from 'archiver'

import type { IHostBridge } from '../../../packages/application/src/contracts/host/IHostBridge'
import sdkPackage from '../../sdk/package.json' with { type: 'json' }
import { expect, test } from './fixtures/electron-fixture'

declare global {
  interface Window {
    api: IHostBridge
  }
}

function addonModule(version: string, fails: boolean) {
  return `export default class AuditAddon {
    async activate(context) {
      if (${fails}) throw new Error('Intentional activation failure')
      this.context = context
      context.contributions.commands.register('audit:version', () => '${version}')
    }
    async deactivate() { this.context?.contributions.commands.unregister('audit:version') }
  }`
}

async function addonArchive(id: string, fails: boolean, sdkApiVersion: string) {
  const archive = archiver('zip')
  const chunks: Buffer[] = []
  const completed = new Promise<Buffer>((resolveArchive, reject) => {
    archive.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.on('end', () => resolveArchive(Buffer.concat(chunks)))
    archive.on('error', reject)
  })
  archive.append(
    `id: ${id}\nname: Audit Addon\nversion: 1.0.0\nrequiredApiVersion: '${sdkApiVersion}'\n`,
    { name: 'manifest.yaml' },
  )
  archive.append(addonModule('1.0.0', fails), { name: 'dist/index.mjs' })
  await archive.finalize()
  return completed
}

for (const scenario of ['success', 'activation-failure', 'linked-addon']) {
  const fails = scenario === 'activation-failure'
  const linked = scenario === 'linked-addon'
  const expectsOldVersion = fails || linked
  test(
    linked
      ? 'real update protects a linked development addon'
      : fails
        ? 'real update restores the old addon after activation failure'
        : 'real update opens the console, installs and activates the downloaded version',
    async ({ electronApp, page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      const id = 'audit-update-' + randomUUID()
      const userData = await electronApp.evaluate(({ app }) =>
        app.getPath('userData'),
      )
      const sdkApiVersion = sdkPackage.version
      const expectedRoot = resolve('test-results/electron-user-data')
      expect(resolve(userData).startsWith(expectedRoot + sep)).toBe(true)
      const oldFolder = join(userData, 'addons', id, '0.9.0')
      if (linked) {
        const sourceFolder = join(userData, 'linked-audit-source', id)
        await mkdir(sourceFolder, { recursive: true })
        await mkdir(dirname(oldFolder), { recursive: true })
        await symlink(sourceFolder, oldFolder, 'junction')
      }
      await mkdir(join(oldFolder, 'dist'), { recursive: true })
      await writeFile(
        join(oldFolder, 'manifest.yaml'),
        `id: ${id}\nname: Audit Addon\nversion: 0.9.0\ncategory: DataSources\nrequiredApiVersion: '${sdkApiVersion}'\n`,
      )
      await writeFile(
        join(oldFolder, 'dist/index.mjs'),
        addonModule('0.9.0', false),
      )
      const archive = await addonArchive(id, fails, sdkApiVersion)
      let pendingResponse: ServerResponse | undefined
      let notifyDownload: () => void = () => {}
      const downloadStarted = new Promise<void>((resolveDownload) => {
        notifyDownload = resolveDownload
      })
      const server = createServer((request, response) => {
        pendingResponse = response
        notifyDownload()
      })
      await new Promise<void>((resolveListening, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolveListening)
      })
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('HTTP test server has no port')
      const downloadUrl = `http://127.0.0.1:${address.port}/addon.zip`
      try {
        // Only the remote catalog is mocked; update IPC, download, disk and loader are real.
        await electronApp.evaluate(
          ({ ipcMain }, catalog) => {
            ipcMain.removeHandler('ADDONS_LIST_AVAILABLE')
            ipcMain.handle('ADDONS_LIST_AVAILABLE', async () => ({
              isSuccess: true,
              statusCode: 200,
              data: [
                {
                  id: catalog.id,
                  name: 'Audit Addon',
                  version: '1.0.0',
                  requiredApiVersion: catalog.sdkApiVersion,
                  category: 'DataSources',
                  categories: ['DataSources'],
                  creator: 'Audit',
                  description: 'Real update regression',
                  path: '',
                  logo: '',
                  installed: false,
                  downloads: 0,
                  stars: 0,
                  downloadUrl: catalog.downloadUrl,
                },
              ],
            }))
          },
          { id, downloadUrl, sdkApiVersion },
        )
        const initial = await page.evaluate(
          (addonId) => window.api.addons.getSchema({ body: { addonId } }),
          id,
        )
        expect(initial.isSuccess).toBe(true)
        const oldCommand = await page.evaluate(
          (addonId) =>
            window.api.addons.executeCommand({
              body: { commandId: addonId + ':audit:version' },
            }),
          id,
        )
        expect(oldCommand.data).toBe('0.9.0')
        const workspace = page.locator('nav a[href*="/workspaces/"]').first()
        await expect(workspace).toBeVisible()
        await workspace.click()
        await page
          .getByRole('button', { name: 'Gerenciar Addons' })
          .first()
          .click()
        await page.getByTestId('addon-browse-card-' + id).click()
        const actions = page.getByTestId('addon-details-actions')
        const update = page.getByTestId('addon-update-btn-' + id)
        const uninstall = actions.getByRole('button', { name: 'Desinstalar' })
        const updateBox = await update.boundingBox()
        const uninstallBox = await uninstall.boundingBox()
        expect(updateBox).not.toBeNull()
        expect(uninstallBox).not.toBeNull()
        expect(
          Math.abs((updateBox?.y ?? 0) - (uninstallBox?.y ?? 0)),
        ).toBeLessThan(2)
        await page.screenshot({
          path: testInfo.outputPath('addon-actions.png'),
        })
        await update.click()
        await expect(page.getByText('Console de Atualização')).toBeVisible()
        await downloadStarted
        const concurrent = await page.evaluate(
          async (addonId) => ({
            update: await window.api.addons.update({
              body: {
                addonId,
                downloadUrl: 'http://127.0.0.1/unused',
                jobId: crypto.randomUUID(),
              },
            }),
            uninstall: await window.api.addons.uninstall({ body: { addonId } }),
          }),
          id,
        )
        expect(concurrent.update.statusCode).toBe(409)
        expect(concurrent.uninstall.statusCode).toBe(409)
        await expect(
          page.getByRole('button', { name: 'Aguarde...' }),
        ).toBeDisabled()
        await expect(
          page.getByText('Addon atualizado com sucesso!', { exact: true }),
        ).toHaveCount(0)
        if (!pendingResponse)
          throw new Error('Download request was not received')
        pendingResponse.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': archive.length,
        })
        pendingResponse.end(archive)
        await expect(
          page.getByRole('button', { name: 'Concluir', exact: true }),
        ).toBeEnabled()
        if (expectsOldVersion) {
          await expect(
            page
              .getByText(
                linked
                  ? 'Addon vinculado para desenvolvimento: instale uma cópia pelo catálogo para permitir atualizações.'
                  : 'FALHA_AO_ATIVAR_NOVA_VERSAO',
              )
              .first(),
          ).toBeVisible()
          await expect(
            page.getByText('Addon atualizado com sucesso!', { exact: true }),
          ).toHaveCount(0)
        }
        const active = await page.evaluate(
          (addonId) =>
            window.api.addons.executeCommand({
              body: { commandId: addonId + ':audit:version' },
            }),
          id,
        )
        expect(active.isSuccess).toBe(true)
        expect(active.data).toBe(expectsOldVersion ? '0.9.0' : '1.0.0')
        const installed = await page.evaluate(() =>
          window.api.addons.listInstalled(),
        )
        expect(
          installed.data
            ?.filter((item) => item.id === id)
            .map((item) => item.version),
        ).toEqual([expectsOldVersion ? '0.9.0' : '1.0.0'])
        await page.screenshot({
          path: testInfo.outputPath('addon-update-console.png'),
        })
        await page
          .getByRole('button', { name: 'Concluir', exact: true })
          .click()
        if (!expectsOldVersion)
          await expect(page.getByTestId('addon-update-btn-' + id)).toHaveCount(
            0,
          )
      } finally {
        pendingResponse?.destroy()
        await new Promise<void>((resolveClosed) =>
          server.close(() => resolveClosed()),
        )
      }
    },
  )
}
