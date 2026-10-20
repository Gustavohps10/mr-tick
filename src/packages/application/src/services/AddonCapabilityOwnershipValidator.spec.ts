import { describe, expect, it } from 'vitest'

import type { AddonCapabilityOwnershipDescriptor } from '@/contracts'

import { AddonCapabilityOwnershipValidator } from './AddonCapabilityOwnershipValidator'

describe('AddonCapabilityOwnershipValidator', () => {
  const descriptors: Record<string, AddonCapabilityOwnershipDescriptor> = {
    'cap-public': {
      capabilityId: 'cap-public',
      authRequirement: { kind: 'none' },
    },
    'cap-profile-a': {
      capabilityId: 'cap-profile-a',
      authRequirement: {
        kind: 'required',
        connectionProfileId: 'profile-a',
        authorizationRole: 'primary',
      },
    },
  }

  const validator = new AddonCapabilityOwnershipValidator(
    (_addonId, capabilityId) => descriptors[capabilityId],
  )

  it('fails if addonId or capabilityId is empty', async () => {
    const res1 = await validator.validateCapability('', 'cap-public')
    expect(res1.isFailure()).toBe(true)

    const res2 = await validator.validateCapability('my-addon', '')
    expect(res2.isFailure()).toBe(true)
  })

  it('fails if capability is not found', async () => {
    const res = await validator.validateCapability('my-addon', 'non-existent')
    expect(res.isFailure()).toBe(true)
    if (res.isFailure()) {
      expect(res.failure.messageKey).toBe('ADDON_SCOPE_OWNERSHIP_INVALID')
    }
  })

  it('succeeds for capability with authRequirement none regardless of connectionProfileId', async () => {
    const res1 = await validator.validateCapability('my-addon', 'cap-public')
    expect(res1.isSuccess()).toBe(true)

    const res2 = await validator.validateCapability(
      'my-addon',
      'cap-public',
      'any-profile',
    )
    expect(res2.isSuccess()).toBe(true)
  })

  it('enforces connectionProfileId match for capability with required profile', async () => {
    const missingProfile = await validator.validateCapability(
      'my-addon',
      'cap-profile-a',
    )
    expect(missingProfile.isFailure()).toBe(true)
    if (missingProfile.isFailure()) {
      expect(missingProfile.failure.messageKey).toBe(
        'ADDON_SCOPE_OWNERSHIP_INVALID',
      )
    }

    const wrongProfile = await validator.validateCapability(
      'my-addon',
      'cap-profile-a',
      'profile-b',
    )
    expect(wrongProfile.isFailure()).toBe(true)
    if (wrongProfile.isFailure()) {
      expect(wrongProfile.failure.messageKey).toBe(
        'ADDON_SCOPE_OWNERSHIP_INVALID',
      )
    }

    const matchingProfile = await validator.validateCapability(
      'my-addon',
      'cap-profile-a',
      'profile-a',
    )
    expect(matchingProfile.isSuccess()).toBe(true)
  })
})
