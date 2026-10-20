import { describe, expect, it } from 'vitest'

import { AddonConnectionAuthenticator } from '@/contracts/core/IAddonConnectionAuthenticator'

import { AddonAuthenticatorRegistry } from './AddonAuthenticatorRegistry'

describe('AddonAuthenticatorRegistry', () => {
  it('registers, resolves, and unregisters authenticators per addon and profile', () => {
    const sut = new AddonAuthenticatorRegistry()
    const authenticator: AddonConnectionAuthenticator = {
      method: 'none',
      authProfileId: 'anonymous',
      supportsRefresh: false,
      supportsRevocation: false,
    }

    expect(sut.getAuthenticator('addon-1', 'anonymous')).toBeUndefined()
    expect(sut.getAuthenticatorsForAddon('addon-1')).toEqual([])

    sut.register('addon-1', authenticator)
    expect(sut.getAuthenticator('addon-1', 'anonymous')).toBe(authenticator)
    expect(sut.getAuthenticatorsForAddon('addon-1')).toEqual([authenticator])

    sut.unregister('addon-1', 'anonymous')
    expect(sut.getAuthenticator('addon-1', 'anonymous')).toBeUndefined()
    expect(sut.getAuthenticatorsForAddon('addon-1')).toEqual([])
  })
})
