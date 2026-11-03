import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EMPTY_HTTP_CONFIG } from '@mr-tick/adapters/contracts'
import {
  AddonAuthenticatorRegistry,
  AddonConnectionProfilesResolver,
  IAddonAccessService,
  ILocalRuntimeAPI,
  OAuthAttemptCoordinator,
  VerifiedAddonPackage,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { AddonLoadFailuresSnapshot } from '@mr-tick/shared/view-models'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { AddonLoader, OnLoadFailuresChangedNotifier } from './AddonLoader'

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  app: { getVersion: () => '1.0.0', isPackaged: false },
}))

describe('AddonLoader - Load Failures Classification, Revisioning & Lifecycle', () => {
  let tempDirs: string[] = []
  let capturedSnapshots: AddonLoadFailuresSnapshot[] = []
  let mockAccessService: IAddonAccessService

  const runtime: ILocalRuntimeAPI = {
    request: async () => ({
      ok: false,
      error: { messageKey: 'RUNTIME_UNAVAILABLE', statusCode: 503 },
    }),
  }

  const createTestLoader = (
    notifier: OnLoadFailuresChangedNotifier,
    accessService?: IAddonAccessService,
  ): AddonLoader => {
    return new AddonLoader(
      emptyAddonCredentialsVault(),
      runtime,
      '0.4.0',
      () => unavailableCore,
      accessService ?? mockAccessService,
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
      notifier,
    )
  }

  const createTempAddonDir = (): string => {
    const dir = join(
      tmpdir(),
      `test-addon-failure-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    )
    mkdirSync(dir, { recursive: true })
    tempDirs.push(dir)
    return dir
  }

  const defaultVerifiedPackage = (
    addonId: string,
    requiredApiVersion: string = '0.4.0',
  ): VerifiedAddonPackage => ({
    addonId,
    version: '1.0.0',
    requiredApiVersion,
    classification: 'free',
    fingerprint: 'a'.repeat(64),
  })

  beforeEach(() => {
    capturedSnapshots = []
    mockAccessService = {
      authorizeDirectory: async (addonId) =>
        Either.success(defaultVerifiedPackage(addonId, '0.4.0')),
      authorizeFiles: async (_files, addonId, version) =>
        Either.success({
          addonId,
          version,
          classification: 'free',
          fingerprint: 'a'.repeat(64),
        }),
    }
  })

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs = []
  })

  it('classifies AUTHORIZATION_FAILED when directory authorization fails', async () => {
    const deniedAccess: IAddonAccessService = {
      authorizeDirectory: async () =>
        Either.failure(AppError.Unauthorized('PLUS_REQUIRED')),
      authorizeFiles: async (_files, addonId, version) =>
        Either.success({
          addonId,
          version,
          classification: 'free',
          fingerprint: 'a'.repeat(64),
        }),
    }

    const loader = createTestLoader(
      (s) => capturedSnapshots.push(s),
      deniedAccess,
    )
    const addonDir = createTempAddonDir()

    const loaded = await loader.loadAndActivateFromDisk('auth-addon', addonDir)

    expect(loaded).toBe(false)
    const snapshot = loader.getLoadFailures()
    expect(snapshot.revision).toBe(1)
    expect(snapshot.failures).toHaveLength(1)
    expect(snapshot.failures[0].addonId).toBe('auth-addon')
    expect(snapshot.failures[0].stage).toBe('authorize')
    expect(snapshot.failures[0].reason).toBe('AUTHORIZATION_FAILED')
    expect(snapshot.failures[0].folderPath).toBe(addonDir)
    expect(snapshot.failures[0].entryPath).toBeUndefined()
  })

  it('classifies API_VERSION_INCOMPATIBLE when requiredApiVersion is incompatible with host', async () => {
    const futureAccess: IAddonAccessService = {
      authorizeDirectory: async (addonId) =>
        Either.success(defaultVerifiedPackage(addonId, '>=0.9.0')),
      authorizeFiles: async (_files, addonId, version) =>
        Either.success({
          addonId,
          version,
          classification: 'free',
          fingerprint: 'a'.repeat(64),
        }),
    }

    const loader = createTestLoader(
      (s) => capturedSnapshots.push(s),
      futureAccess,
    )
    const addonDir = createTempAddonDir()

    const loaded = await loader.loadAndActivateFromDisk(
      'future-addon',
      addonDir,
    )

    expect(loaded).toBe(false)
    const snapshot = loader.getLoadFailures()
    expect(snapshot.failures).toHaveLength(1)
    expect(snapshot.failures[0].stage).toBe('apiVersion')
    expect(snapshot.failures[0].reason).toBe('API_VERSION_INCOMPATIBLE')
  })

  it('classifies ENTRY_NOT_FOUND when no target entry file exists', async () => {
    const loader = createTestLoader((s) => capturedSnapshots.push(s))
    const addonDir = createTempAddonDir()

    const loaded = await loader.loadAndActivateFromDisk(
      'no-entry-addon',
      addonDir,
    )

    expect(loaded).toBe(false)
    const snapshot = loader.getLoadFailures()
    expect(snapshot.failures).toHaveLength(1)
    expect(snapshot.failures[0].stage).toBe('entry')
    expect(snapshot.failures[0].reason).toBe('ENTRY_NOT_FOUND')
    expect(snapshot.failures[0].entryPath).toBeUndefined()
  })

  it('classifies MANIFEST_INVALID when manifest syntax is malformed', async () => {
    const loader = createTestLoader((s) => capturedSnapshots.push(s))
    const addonDir = createTempAddonDir()
    writeFileSync(join(addonDir, 'index.js'), 'export default {}')
    writeFileSync(
      join(addonDir, 'manifest.yaml'),
      ': malformed yaml content [[',
    )

    const loaded = await loader.loadAndActivateFromDisk(
      'bad-manifest',
      addonDir,
    )

    expect(loaded).toBe(false)
    const snapshot = loader.getLoadFailures()
    expect(snapshot.failures).toHaveLength(1)
    expect(snapshot.failures[0].stage).toBe('manifest')
    expect(snapshot.failures[0].reason).toBe('MANIFEST_INVALID')
    expect(snapshot.failures[0].entryPath).toBe(join(addonDir, 'index.js'))
  })

  it('classifies CONTRACT_VIOLATION when capabilities declared in manifest are invalid', async () => {
    const loader = createTestLoader((s) => capturedSnapshots.push(s))
    const addonDir = createTempAddonDir()
    writeFileSync(join(addonDir, 'index.js'), 'export default {}')
    writeFileSync(
      join(addonDir, 'manifest.yaml'),
      'name: Invalid Cap Addon\ncapabilities:\n  - unknown-invalid-cap\n',
    )

    const loaded = await loader.loadAndActivateFromDisk(
      'invalid-cap-addon',
      addonDir,
    )

    expect(loaded).toBe(false)
    const snapshot = loader.getLoadFailures()
    expect(snapshot.failures).toHaveLength(1)
    expect(snapshot.failures[0].stage).toBe('manifest')
    expect(snapshot.failures[0].reason).toBe('CONTRACT_VIOLATION')
    expect(snapshot.failures[0].addonName).toBe('Invalid Cap Addon')
  })

  it('classifies IMPORT_FAILED when import throws a module execution error', async () => {
    const loader = createTestLoader((s) => capturedSnapshots.push(s))
    const addonDir = createTempAddonDir()
    writeFileSync(
      join(addonDir, 'index.js'),
      'throw new Error("Syntax or runtime import error in module")',
    )

    const loaded = await loader.loadAndActivateFromDisk(
      'import-fail-addon',
      addonDir,
    )

    expect(loaded).toBe(false)
    const snapshot = loader.getLoadFailures()
    expect(snapshot.failures).toHaveLength(1)
    expect(snapshot.failures[0].stage).toBe('import')
    expect(snapshot.failures[0].reason).toBe('IMPORT_FAILED')
    expect(snapshot.failures[0].technicalMessage).toContain(
      'Syntax or runtime import error',
    )
  })

  it('classifies INVALID_DEFAULT_EXPORT when export default is not an Addon constructor or instance', async () => {
    const loader = createTestLoader((s) => capturedSnapshots.push(s))
    const addonDir = createTempAddonDir()
    writeFileSync(join(addonDir, 'index.js'), 'export default "just a string"')

    const loaded = await loader.loadAndActivateFromDisk(
      'invalid-export-addon',
      addonDir,
    )

    expect(loaded).toBe(false)
    const snapshot = loader.getLoadFailures()
    expect(snapshot.failures).toHaveLength(1)
    expect(snapshot.failures[0].stage).toBe('contract')
    expect(snapshot.failures[0].reason).toBe('INVALID_DEFAULT_EXPORT')
  })

  it('classifies INSTANTIATION_FAILED when default export constructor throws in new', async () => {
    const loader = createTestLoader((s) => capturedSnapshots.push(s))
    const addonDir = createTempAddonDir()
    writeFileSync(
      join(addonDir, 'index.js'),
      'export default class FaultyConstructor { constructor() { throw new Error("Constructor exploded"); } activate() {} }',
    )

    const loaded = await loader.loadAndActivateFromDisk(
      'faulty-constructor-addon',
      addonDir,
    )

    expect(loaded).toBe(false)
    const snapshot = loader.getLoadFailures()
    expect(snapshot.failures).toHaveLength(1)
    expect(snapshot.failures[0].stage).toBe('instantiate')
    expect(snapshot.failures[0].reason).toBe('INSTANTIATION_FAILED')
    expect(snapshot.failures[0].technicalMessage).toContain(
      'Constructor exploded',
    )
  })

  it('classifies INITIALIZATION_FAILED and preserves string, object with message and Error thrown at activation', async () => {
    const loader = createTestLoader((s) => capturedSnapshots.push(s))

    // 1. Error instance
    const addonDir1 = createTempAddonDir()
    writeFileSync(
      join(addonDir1, 'index.js'),
      'export default class ActivationErrorAddon { activate() { throw new Error("Detailed runtime activation explosion"); } deactivate() {} }',
    )
    await loader.loadAndActivateFromDisk('error-addon', addonDir1)
    const snap1 = loader
      .getLoadFailures()
      .failures.find((f) => f.addonId === 'error-addon')
    expect(snap1?.stage).toBe('activate')
    expect(snap1?.reason).toBe('INITIALIZATION_FAILED')
    expect(snap1?.technicalMessage).toBe(
      'Detailed runtime activation explosion',
    )

    // 2. Thrown pure string
    const addonDir2 = createTempAddonDir()
    writeFileSync(
      join(addonDir2, 'index.js'),
      'export default class ActivationStringAddon { activate() { throw "Raw string thrown from addon activation"; } deactivate() {} }',
    )
    await loader.loadAndActivateFromDisk('string-addon', addonDir2)
    const snap2 = loader
      .getLoadFailures()
      .failures.find((f) => f.addonId === 'string-addon')
    expect(snap2?.stage).toBe('activate')
    expect(snap2?.reason).toBe('INITIALIZATION_FAILED')
    expect(snap2?.technicalMessage).toBe(
      'Raw string thrown from addon activation',
    )

    // 3. Thrown object with message property
    const addonDir3 = createTempAddonDir()
    writeFileSync(
      join(addonDir3, 'index.js'),
      'export default class ActivationObjectAddon { activate() { throw { code: 500, message: "Custom object message from activation" }; } deactivate() {} }',
    )
    await loader.loadAndActivateFromDisk('object-addon', addonDir3)
    const snap3 = loader
      .getLoadFailures()
      .failures.find((f) => f.addonId === 'object-addon')
    expect(snap3?.stage).toBe('activate')
    expect(snap3?.reason).toBe('INITIALIZATION_FAILED')
    expect(snap3?.technicalMessage).toBe(
      'Custom object message from activation',
    )

    // 4. Thrown object without message property (uses String() representation)
    const addonDir4 = createTempAddonDir()
    writeFileSync(
      join(addonDir4, 'index.js'),
      'export default class ActivationPlainObjectAddon { activate() { throw { customStatus: 500 }; } deactivate() {} }',
    )
    await loader.loadAndActivateFromDisk('plain-object-addon', addonDir4)
    const snap4 = loader
      .getLoadFailures()
      .failures.find((f) => f.addonId === 'plain-object-addon')
    expect(snap4?.stage).toBe('activate')
    expect(snap4?.reason).toBe('INITIALIZATION_FAILED')
    expect(snap4?.technicalMessage).toBe('[object Object]')
  })

  it('classifies CONTRACT_VIOLATION with messageKey when capabilities in manifest are invalid before activation', async () => {
    const loader = createTestLoader((s) => capturedSnapshots.push(s))
    const addonDir = createTempAddonDir()
    writeFileSync(
      join(addonDir, 'index.js'),
      'export default class ValidClass { activate() {} deactivate() {} }',
    )
    writeFileSync(
      join(addonDir, 'manifest.yaml'),
      'name: Bad Cap Manifest\ncapabilities:\n  - completely-invalid-capability\n',
    )

    const loaded = await loader.loadAndActivateFromDisk(
      'bad-cap-addon',
      addonDir,
    )

    expect(loaded).toBe(false)
    const failure = loader
      .getLoadFailures()
      .failures.find((f) => f.addonId === 'bad-cap-addon')
    expect(failure).toBeDefined()
    expect(failure?.stage).toBe('manifest')
    expect(failure?.reason).toBe('CONTRACT_VIOLATION')
    expect(failure?.technicalMessage).toContain('ADDON_CAPABILITY_INVALID')
  })

  it('handles concurrent activations of different addons without cross-contamination', async () => {
    const loader = createTestLoader((s) => capturedSnapshots.push(s))

    const addonDirA = createTempAddonDir()
    writeFileSync(
      join(addonDirA, 'index.js'),
      'export default class AddonA { activate() { throw new Error("Error specific to Addon A"); } deactivate() {} }',
    )

    const addonDirB = createTempAddonDir()
    writeFileSync(
      join(addonDirB, 'index.js'),
      'export default class AddonB { activate() { throw new Error("Error specific to Addon B"); } deactivate() {} }',
    )

    const [loadedA, loadedB] = await Promise.all([
      loader.loadAndActivateFromDisk('addon-a', addonDirA),
      loader.loadAndActivateFromDisk('addon-b', addonDirB),
    ])

    expect(loadedA).toBe(false)
    expect(loadedB).toBe(false)

    const failures = loader.getLoadFailures().failures
    const failA = failures.find((f) => f.addonId === 'addon-a')
    const failB = failures.find((f) => f.addonId === 'addon-b')

    expect(failA?.technicalMessage).toBe('Error specific to Addon A')
    expect(failB?.technicalMessage).toBe('Error specific to Addon B')
    expect(failA?.reason).toBe('INITIALIZATION_FAILED')
    expect(failB?.reason).toBe('INITIALIZATION_FAILED')
  })

  it('classifies UNEXPECTED_ERROR when an unhandled exception escapes during loading', async () => {
    const unhandledAccessService: IAddonAccessService = {
      authorizeDirectory: () => {
        throw new Error('Fatal unhandled file system hardware failure')
      },
      authorizeFiles: async (_files, addonId, version) =>
        Either.success({
          addonId,
          version,
          classification: 'free',
          fingerprint: 'a'.repeat(64),
        }),
    }

    const loader = createTestLoader(
      (s) => capturedSnapshots.push(s),
      unhandledAccessService,
    )
    const addonDir = createTempAddonDir()

    const loaded = await loader.loadAndActivateFromDisk(
      'unexpected-addon',
      addonDir,
    )

    expect(loaded).toBe(false)
    const snapshot = loader.getLoadFailures()
    expect(snapshot.failures).toHaveLength(1)
    expect(snapshot.failures[0].reason).toBe('UNEXPECTED_ERROR')
    expect(snapshot.failures[0].technicalMessage).toContain(
      'Fatal unhandled file system hardware failure',
    )
  })

  it('cleans failure entry and notifies on successful reload, keeping one failure per addon', async () => {
    const loader = createTestLoader((s) => capturedSnapshots.push(s))
    const addonDir = createTempAddonDir()

    // 1. Initial attempt fails (no entry)
    await loader.loadAndActivateFromDisk('reloadable-addon', addonDir)
    expect(loader.getLoadFailures().failures).toHaveLength(1)
    expect(loader.getLoadFailures().failures[0].reason).toBe('ENTRY_NOT_FOUND')
    expect(capturedSnapshots).toHaveLength(1)
    expect(capturedSnapshots[0].revision).toBe(1)

    // 2. Retry before fixing overwrites existing failure with new timestamp/revision
    await loader.loadAndActivateFromDisk('reloadable-addon', addonDir)
    expect(loader.getLoadFailures().failures).toHaveLength(1)
    expect(capturedSnapshots).toHaveLength(2)
    expect(capturedSnapshots[1].revision).toBe(2)

    // 3. Fix addon and reload
    writeFileSync(
      join(addonDir, 'index.js'),
      'export default class ValidAddon { activate() {} deactivate() {} }',
    )
    const loaded = await loader.loadAndActivateFromDisk(
      'reloadable-addon',
      addonDir,
    )
    expect(loaded).toBe(true)

    // 4. Failure is cleared and revision increments
    const cleanSnapshot = loader.getLoadFailures()
    expect(cleanSnapshot.failures).toHaveLength(0)
    expect(cleanSnapshot.revision).toBe(3)
    expect(capturedSnapshots).toHaveLength(3)
    expect(capturedSnapshots[2].failures).toHaveLength(0)
  })

  it('cleans failure entry on addon deactivation / uninstall', async () => {
    const loader = createTestLoader((s) => capturedSnapshots.push(s))
    const addonDir = createTempAddonDir()

    await loader.loadAndActivateFromDisk('uninstall-addon', addonDir)
    expect(loader.getLoadFailures().failures).toHaveLength(1)

    await loader.deactivateAddon('uninstall-addon')
    expect(loader.getLoadFailures().failures).toHaveLength(0)
  })
})
