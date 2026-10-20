import { AddonCapabilityDescriptor, IAddon, IAddonManifest } from '@mr-tick/sdk'
import { describe, expect, it, vi } from 'vitest'

import { isCapabilityContractCompatible } from './AddonLoader'
import { createLoader } from './AddonLoader.Capabilities.fixture'

describe('AddonLoader - Capabilities & Granular Lifetime - Contracts & Manifests', () => {
  describe('SemVer Contract Version Compatibility', () => {
    it('approves compatible versions under the same major', () => {
      expect(isCapabilityContractCompatible('1.0.0', '1.0.0')).toBe(true)
      expect(isCapabilityContractCompatible('1.0.0', '1.2.0')).toBe(true)
    })

    it('rejects versions with different major', () => {
      expect(isCapabilityContractCompatible('2.0.0', '1.0.0')).toBe(false)
      expect(isCapabilityContractCompatible('1.0.0', '2.0.0')).toBe(false)
    })

    it('rejects versions with different minor when major is 0', () => {
      expect(isCapabilityContractCompatible('0.2.0', '0.1.0')).toBe(false)
      expect(isCapabilityContractCompatible('0.1.0', '0.2.0')).toBe(false)
    })

    it('rejects invalid SemVer strings fail-closed', () => {
      expect(isCapabilityContractCompatible('invalid', '1.0.0')).toBe(false)
      expect(isCapabilityContractCompatible('1.0.0', 'not-a-version')).toBe(
        false,
      )
    })
  })

  describe('Manifest Capabilities Validation & M16 Rule', () => {
    it('enforces M16 rule: rejects manifest with more than 1 dataSource', () => {
      const loader = createLoader()
      const capabilities: AddonCapabilityDescriptor[] = [
        {
          capabilityId: 'ds-1',
          kind: 'dataSource',
          contractVersion: '1.0.0',
          executionPolicy: { kind: 'activeWorkspace' },
          authRequirement: { kind: 'none' },
          supportedOperations: ['read'],
          required: true,
        },
        {
          capabilityId: 'ds-2',
          kind: 'dataSource',
          contractVersion: '1.0.0',
          executionPolicy: { kind: 'activeWorkspace' },
          authRequirement: { kind: 'none' },
          supportedOperations: ['read'],
          required: true,
        },
      ]

      const result = loader.registerManifestCapabilities(
        'test-m16',
        capabilities,
      )
      expect(result.isFailure()).toBe(true)
      if (result.isFailure()) {
        expect(result.failure.messageKey).toBe(
          'MULTIPLE_DATASOURCES_NOT_ALLOWED',
        )
      }
    })

    it('accepts manifest with 0 dataSources or 1 dataSource', () => {
      const loader = createLoader()
      const zeroDsResult = loader.registerManifestCapabilities('zero-ds', [
        {
          capabilityId: 'watcher-1',
          kind: 'watcher',
          contractVersion: '1.0.0',
          executionPolicy: { kind: 'activeWorkspace' },
          authRequirement: { kind: 'none' },
          supportedOperations: ['watch'],
          required: true,
        },
      ])
      expect(zeroDsResult.isSuccess()).toBe(true)

      const oneDsResult = loader.registerManifestCapabilities('one-ds', [
        {
          capabilityId: 'primary-ds',
          kind: 'dataSource',
          contractVersion: '1.0.0',
          executionPolicy: { kind: 'activeWorkspace' },
          authRequirement: { kind: 'none' },
          supportedOperations: ['read', 'write'],
          required: true,
        },
      ])
      expect(oneDsResult.isSuccess()).toBe(true)
    })

    it('rejects duplicate capabilityId in the manifest', () => {
      const loader = createLoader()
      const result = loader.registerManifestCapabilities('dup-cap', [
        {
          capabilityId: 'same-id',
          kind: 'theme',
          contractVersion: '1.0.0',
          executionPolicy: { kind: 'activeWorkspace' },
          authRequirement: { kind: 'none' },
          supportedOperations: [],
          required: true,
        },
        {
          capabilityId: 'same-id',
          kind: 'calendar',
          contractVersion: '1.0.0',
          executionPolicy: { kind: 'activeWorkspace' },
          authRequirement: { kind: 'none' },
          supportedOperations: [],
          required: false,
        },
      ])
      expect(result.isFailure()).toBe(true)
      if (result.isFailure()) {
        expect(result.failure.messageKey).toBe(
          'CAPABILITY_DUPLICATE_ID:same-id',
        )
      }
    })

    it('fails activation when a required capability has incompatible contractVersion', async () => {
      const loader = createLoader()
      const manifest: IAddonManifest = {
        id: 'incompat-required',
        name: 'Incompatible Required',
        version: '1.0.0',
        categories: ['watcher'],
        author: 'Test',
        shortDescription: 'Short desc',
        description: 'Long description',
        capabilities: [
          {
            capabilityId: 'req-cap',
            kind: 'dataSource',
            contractVersion: '2.0.0',
            executionPolicy: { kind: 'activeWorkspace' },
            authRequirement: { kind: 'none' },
            supportedOperations: ['read'],
            required: true,
          },
        ],
      }

      const dummyAddon: IAddon = {
        activate: vi.fn(),
        deactivate: vi.fn(),
      }

      const activated = await loader.activateAddon(
        'incompat-required',
        dummyAddon,
        manifest,
      )
      expect(activated).toBe(false)
      expect(dummyAddon.activate).not.toHaveBeenCalled()
    })

    it('tolerates incompatible optional capability: disables it while activating the addon', async () => {
      const loader = createLoader()
      const manifest: IAddonManifest = {
        id: 'tolerated-optional',
        name: 'Tolerated Optional',
        version: '1.0.0',
        categories: ['watcher'],
        author: 'Test',
        shortDescription: 'Short desc',
        description: 'Long description',
        capabilities: [
          {
            capabilityId: 'opt-incompat',
            kind: 'watcher',
            contractVersion: '2.0.0',
            executionPolicy: { kind: 'activeWorkspace' },
            authRequirement: { kind: 'none' },
            supportedOperations: ['watch'],
            required: false,
          },
          {
            capabilityId: 'opt-compat',
            kind: 'theme',
            contractVersion: '1.0.0',
            executionPolicy: { kind: 'activeWorkspace' },
            authRequirement: { kind: 'none' },
            supportedOperations: ['applyTheme'],
            required: false,
          },
        ],
      }

      const dummyAddon: IAddon = {
        activate: vi.fn(),
        deactivate: vi.fn(),
      }

      const activated = await loader.activateAddon(
        'tolerated-optional',
        dummyAddon,
        manifest,
      )
      expect(activated).toBe(true)
      expect(dummyAddon.activate).toHaveBeenCalled()

      expect(
        loader.isOperationSupported(
          'tolerated-optional',
          'opt-incompat',
          'watch',
        ),
      ).toBe(false)
      expect(
        loader.isOperationSupported(
          'tolerated-optional',
          'opt-compat',
          'applyTheme',
        ),
      ).toBe(true)
    })
  })

  describe('Operation Enforcement (isOperationSupported)', () => {
    it('blocks undeclared operations and empty operations lists', () => {
      const loader = createLoader()
      loader.registerManifestCapabilities('ops-test', [
        {
          capabilityId: 'cap-strict',
          kind: 'dataSource',
          contractVersion: '1.0.0',
          executionPolicy: { kind: 'activeWorkspace' },
          authRequirement: { kind: 'none' },
          supportedOperations: ['read', 'create'],
          required: true,
        },
        {
          capabilityId: 'cap-empty',
          kind: 'custom',
          contractVersion: '1.0.0',
          executionPolicy: { kind: 'activeWorkspace' },
          authRequirement: { kind: 'none' },
          supportedOperations: [],
          required: false,
        },
      ])

      expect(
        loader.isOperationSupported('ops-test', 'cap-strict', 'read'),
      ).toBe(true)
      expect(
        loader.isOperationSupported('ops-test', 'cap-strict', 'create'),
      ).toBe(true)
      expect(
        loader.isOperationSupported('ops-test', 'cap-strict', 'delete'),
      ).toBe(false)
      expect(
        loader.isOperationSupported('ops-test', 'cap-strict', 'update'),
      ).toBe(false)

      expect(
        loader.isOperationSupported('ops-test', 'cap-empty', 'anyOperation'),
      ).toBe(false)
      expect(
        loader.isOperationSupported('ops-test', 'non-existent', 'read'),
      ).toBe(false)
      expect(
        loader.isOperationSupported('unknown-addon', 'cap-strict', 'read'),
      ).toBe(false)
    })
  })
})
