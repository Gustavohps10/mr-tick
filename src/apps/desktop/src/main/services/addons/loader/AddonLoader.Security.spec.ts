import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EMPTY_HTTP_CONFIG } from '@mr-tick/adapters/contracts'
import { JSONAddonSettingsRepository } from '@mr-tick/adapters/data'
import {
  AddonAuthenticatorRegistry,
  AddonConnectionProfilesResolver,
  IAddonAccessService,
  ILocalRuntimeAPI,
  OAuthAttemptCoordinator,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ElectronHttpClientFactory,
  NodeFetchTransport,
} from '../../../adapters/ElectronHttpClient'
import { unavailableCore } from '../core/addon-core-test-fixture'
import {
  emptyAddonCredentialsVault,
  emptyAddonSettingsRepository,
  emptyAddonStorageRepository,
  emptyWorkspaceReferenceRegistry,
} from '../core/addon-workspace-reference-test-fixture'
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
const credentials = emptyAddonCredentialsVault()
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
  it('fails closed when an unclassified password already exists in settings storage', async () => {
    const settingsDirectory = mkdtempSync(
      join(tmpdir(), 'mrt-security-settings-read-'),
    )
    paths.push(settingsDirectory)
    const settingsRepository = new JSONAddonSettingsRepository(
      settingsDirectory,
    )
    const addonId = 'password-read-scope-security'
    const sentinel = 'stored-unclassified-password-sentinel'
    const settingsPath = join(settingsDirectory, 'addon-settings.json')
    writeFileSync(
      settingsPath,
      JSON.stringify({
        schemaVersion: 1,
        entries: [
          {
            addonId,
            scopeKey: JSON.stringify(['addon']),
            revision: 1,
            values: { passwordSentinel: sentinel },
            fieldRevisions: { passwordSentinel: 1 },
          },
        ],
      }),
    )
    const loader = new AddonLoader(
      credentials,
      runtime,
      '0.4.0',
      () => unavailableCore,
      access,
      emptyWorkspaceReferenceRegistry,
      settingsRepository,
      new AddonAuthenticatorRegistry(),
      new AddonConnectionProfilesResolver(),
      new OAuthAttemptCoordinator(),
      new ElectronHttpClientFactory(
        EMPTY_HTTP_CONFIG,
        new NodeFetchTransport(),
      ),
      emptyAddonStorageRepository,
    )
    const activated = await loader.activateAddon(addonId, {
      activate: (context) =>
        context.contributions.settings.register([
          {
            id: 'credentials',
            label: 'Credentials',
            fields: [
              {
                id: 'passwordSentinel',
                type: 'password',
                label: 'Password',
              } as unknown as import('@mr-tick/sdk').AddonSettingsField,
            ],
          },
        ]),
      deactivate: () => undefined,
    })
    expect(activated).toBe(true)
    const seeded = await settingsRepository.read(
      addonId,
      JSON.stringify(['addon']),
    )
    expect(seeded.isSuccess()).toBe(true)
    if (seeded.isFailure()) return expect.fail(seeded.failure.messageKey)
    expect(seeded.success.values.passwordSentinel).toBe(sentinel)

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const result = await loader.getAddonSettings(addonId, { kind: 'addon' })
    const logs = JSON.stringify({
      log: log.mock.calls,
      error: error.mock.calls,
    })
    log.mockRestore()
    error.mockRestore()
    await loader.deactivateAddon(addonId)

    expect({
      rejected: result.isFailure(),
      sentinelInReturnedProjection: JSON.stringify(result).includes(sentinel),
      sentinelInLogs: logs.includes(sentinel),
    }).toEqual({
      rejected: true,
      sentinelInReturnedProjection: false,
      sentinelInLogs: false,
    })
  })

  it('does not persist an unscoped password field in addon settings', async () => {
    const settingsDirectory = mkdtempSync(
      join(tmpdir(), 'mrt-security-settings-'),
    )
    paths.push(settingsDirectory)
    const settingsRepository = new JSONAddonSettingsRepository(
      settingsDirectory,
    )
    const loader = new AddonLoader(
      credentials,
      runtime,
      '0.4.0',
      () => unavailableCore,
      access,
      emptyWorkspaceReferenceRegistry,
      settingsRepository,
      new AddonAuthenticatorRegistry(),
      new AddonConnectionProfilesResolver(),
      new OAuthAttemptCoordinator(),
      new ElectronHttpClientFactory(
        EMPTY_HTTP_CONFIG,
        new NodeFetchTransport(),
      ),
      emptyAddonStorageRepository,
    )
    const addonId = 'password-scope-security'
    const activated = await loader.activateAddon(addonId, {
      activate: (context) =>
        context.contributions.settings.register([
          {
            id: 'credentials',
            label: 'Credentials',
            fields: [
              {
                id: 'passwordSentinel',
                type: 'password',
                label: 'Password',
              } as unknown as import('@mr-tick/sdk').AddonSettingsField,
            ],
          },
        ]),
      deactivate: () => undefined,
    })
    expect(activated).toBe(true)
    const saved = await loader.saveAddonSettings(
      addonId,
      { kind: 'addon' },
      0,
      { passwordSentinel: 'password-sentinel' },
    )
    const persisted = await settingsRepository.read(
      addonId,
      JSON.stringify(['addon']),
    )
    await loader.deactivateAddon(addonId)

    const settingsPath = join(settingsDirectory, 'addon-settings.json')
    const sentinelInSnapshot =
      persisted.isSuccess() &&
      persisted.success.values.passwordSentinel === 'password-sentinel'
    const sentinelInFile =
      existsSync(settingsPath) &&
      readFileSync(settingsPath, 'utf8').includes('password-sentinel')
    expect({
      rejected: saved.isFailure(),
      snapshotReadable: persisted.isSuccess(),
      sentinelInSnapshot,
      sentinelInFile,
    }).toEqual({
      rejected: true,
      snapshotReadable: true,
      sentinelInSnapshot: false,
      sentinelInFile: false,
    })
  })
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
      () => unavailableCore,
      access,
      emptyWorkspaceReferenceRegistry,
      emptyAddonSettingsRepository,
      new AddonAuthenticatorRegistry(),
      new AddonConnectionProfilesResolver(),
      new OAuthAttemptCoordinator(),
      new ElectronHttpClientFactory(
        EMPTY_HTTP_CONFIG,
        new NodeFetchTransport(),
      ),
      emptyAddonStorageRepository,
    )
    expect(await loader.loadAndActivateFromDisk('unknown', directory)).toBe(
      false,
    )
    expect(existsSync(marker)).toBe(false)
    expect(loader.hasActiveAddon('unknown')).toBe(false)
  })
})
