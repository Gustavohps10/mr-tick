import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  IAddonAccessService,
  ICredentialsVault,
  ILocalRuntimeAPI,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { unavailableCore } from './addon-core-test-fixture'
import { AddonLoader } from './AddonLoader'

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  app: { getVersion: () => '1.0.0' },
}))
const paths: string[] = []
afterEach(() => {
  for (const path of paths.splice(0))
    rmSync(path, { recursive: true, force: true })
})
const credentials: ICredentialsVault = {
  saveToken: async () => {},
  getToken: async () => undefined,
  deleteToken: async () => {},
  hasToken: async () => false,
  replaceToken: async () => {},
}
const runtime: ILocalRuntimeAPI = {
  request: async () => ({
    ok: false,
    error: { messageKey: 'RUNTIME_UNAVAILABLE', statusCode: 503 },
  }),
}
const access: IAddonAccessService = {
  authorizeFiles: async () =>
    Either.failure(AppError.Unauthorized('PLUS_REQUIRED')),
  authorizeDirectory: async () =>
    Either.failure(AppError.Unauthorized('PLUS_REQUIRED')),
}
describe('AddonLoader security', () => {
  it('bloqueia addon desconhecido sem Plus antes de executar código de módulo', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mrt-security-'))
    paths.push(directory)
    const marker = join(directory, 'executed.txt')
    writeFileSync(
      join(directory, 'manifest.yaml'),
      'id: unknown\nname: Unknown\nversion: 1.0.0\nrequiredApiVersion: \">=0.4.0\"\ntier: free\n',
    )
    writeFileSync(
      join(directory, 'index.js'),
      'import fs from \"node:fs\"; fs.writeFileSync(' +
        JSON.stringify(marker) +
        ', \"executed\"); export default class Addon { async activate() {} async deactivate() {} }',
    )
    const loader = new AddonLoader(
      credentials,
      runtime,
      '0.4.0',
      unavailableCore,
      access,
    )
    expect(await loader.loadAndActivateFromDisk('unknown', directory)).toBe(
      false,
    )
    expect(existsSync(marker)).toBe(false)
    expect(loader.hasActiveAddon('unknown')).toBe(false)
  })
})
