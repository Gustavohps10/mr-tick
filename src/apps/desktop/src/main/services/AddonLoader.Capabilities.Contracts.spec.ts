import { AddonCapability, IAddon, IAddonManifest } from '@mr-tick/sdk'
import { describe, expect, it, vi } from 'vitest'

import { createLoader } from './AddonLoader.Capabilities.fixture'

describe('AddonLoader - Capabilities & Granular Lifetime - Contracts & Manifests', () => {
  describe('Manifest Capabilities Validation & M16 Rule', () => {
    it('enforces M16 rule: rejects manifest with more than 1 dataSource', () => {
      const loader = createLoader()
      const capabilities: AddonCapability[] = ['dataSource', 'dataSource']

      const result = loader.registerManifestCapabilities(
        'test-m16',
        capabilities,
      )
      expect(result.isFailure()).toBe(true)
      if (result.isFailure()) {
        expect(result.failure.messageKey).toBe(
          'CAPABILITY_DUPLICATE_ID:dataSource',
        )
      }
    })

    it('accepts manifest with 0 dataSources or 1 dataSource', () => {
      const loader = createLoader()
      const zeroDsResult = loader.registerManifestCapabilities('zero-ds', [
        'watcher',
      ])
      expect(zeroDsResult.isSuccess()).toBe(true)

      const oneDsResult = loader.registerManifestCapabilities('one-ds', [
        'dataSource',
      ])
      expect(oneDsResult.isSuccess()).toBe(true)
    })

    it('rejects duplicate capability in the manifest', () => {
      const loader = createLoader()
      const result = loader.registerManifestCapabilities('dup-cap', [
        'theme',
        'theme',
      ])
      expect(result.isFailure()).toBe(true)
      if (result.isFailure()) {
        expect(result.failure.messageKey).toBe('CAPABILITY_DUPLICATE_ID:theme')
      }
    })

    it('preserves the replacement capabilities after deactivating the previous addon', async () => {
      const loader = createLoader()
      const manifest: IAddonManifest = {
        id: 'replacement',
        name: 'Replacement',
        version: '1.0.0',
        author: 'Tests',
        shortDescription: '',
        description: '',
        capabilities: ['watcher'],
      }
      const addon: IAddon = { activate: vi.fn(), deactivate: vi.fn() }
      expect(await loader.activateAddon('replacement', addon, manifest)).toBe(
        true,
      )
      expect(
        await loader.activateAddon('replacement', addon, {
          ...manifest,
          capabilities: ['theme'],
        }),
      ).toBe(true)
      expect(
        loader.isOperationSupported('replacement', 'theme', 'applyTheme'),
      ).toBe(true)
      expect(
        loader.isOperationSupported('replacement', 'watcher', 'watch'),
      ).toBe(false)
    })

    it('activates addon with valid capabilities', async () => {
      const loader = createLoader()
      const manifest: IAddonManifest = {
        id: 'valid-addon',
        name: 'Valid Addon',
        version: '1.0.0',
        author: 'Test',
        shortDescription: 'Short desc',
        description: 'Long description',
        capabilities: ['watcher', 'theme'],
      }

      const dummyAddon: IAddon = {
        activate: vi.fn(),
        deactivate: vi.fn(),
      }

      const activated = await loader.activateAddon(
        'valid-addon',
        dummyAddon,
        manifest,
      )
      expect(activated).toBe(true)
      expect(dummyAddon.activate).toHaveBeenCalled()
      expect(
        loader.isOperationSupported('valid-addon', 'watcher', 'watch'),
      ).toBe(true)
      expect(
        loader.isOperationSupported('valid-addon', 'theme', 'applyTheme'),
      ).toBe(true)
      expect(
        loader.isOperationSupported('valid-addon', 'dataSource', 'read'),
      ).toBe(false)
    })
  })
})
