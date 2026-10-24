import { describe, expect, it } from 'vitest'

import type { AddonSettingsSchema } from '@/contracts/host/IHostBridge'

import { AddonConnectionProfilesResolver } from './AddonConnectionProfilesResolver'

const accessSchema: AddonSettingsSchema = [
  { id: 'token', label: 'Access token', type: 'password', scope: 'credential' },
]

describe('AddonConnectionProfilesResolver account schemas', () => {
  it('isolates schemas by addon and connection profile without any datasource', async () => {
    const resolver = new AddonConnectionProfilesResolver()
    resolver.registerProfiles('watcher', [
      { connectionProfileId: 'personal', cardinality: 'single', default: true },
      { connectionProfileId: 'work', cardinality: 'multi', default: false },
    ])
    resolver.registerProfiles('other', [
      { connectionProfileId: 'personal', cardinality: 'single', default: true },
    ])
    expect(
      resolver.registerSchema('watcher', 'personal', accessSchema).isSuccess(),
    ).toBe(true)
    expect(resolver.registerSchema('watcher', 'work', []).isSuccess()).toBe(
      true,
    )
    const personal = await resolver.getConnectionSchema('watcher', 'personal')
    expect(personal.isSuccess()).toBe(true)
    expect(personal.success).toEqual(accessSchema)
    const work = await resolver.getConnectionSchema('watcher', 'work')
    expect(work.isSuccess()).toBe(true)
    expect(work.success).toEqual([])
    expect(
      (await resolver.getConnectionSchema('other', 'personal')).isFailure(),
    ).toBe(true)
    expect(
      (await resolver.getConnectionSchema('watcher', 'missing')).isFailure(),
    ).toBe(true)
  })

  it('rejects an undeclared profile and removes schemas when profiles are unregistered', async () => {
    const resolver = new AddonConnectionProfilesResolver()
    expect(
      resolver.registerSchema('watcher', 'personal', accessSchema).isFailure(),
    ).toBe(true)
    resolver.registerProfiles('watcher', [
      { connectionProfileId: 'personal', cardinality: 'single', default: true },
    ])
    resolver.registerSchema('watcher', 'personal', accessSchema)
    resolver.unregisterSchema('watcher', 'personal')
    expect(
      (await resolver.getConnectionSchema('watcher', 'personal')).isFailure(),
    ).toBe(true)
    resolver.registerSchema('watcher', 'personal', accessSchema)
    resolver.unregisterProfiles('watcher')
    expect(
      (await resolver.getConnectionSchema('watcher', 'personal')).isFailure(),
    ).toBe(true)
    resolver.registerProfiles('watcher', [
      { connectionProfileId: 'personal', cardinality: 'single', default: true },
    ])
    expect(
      (await resolver.getConnectionSchema('watcher', 'personal')).isFailure(),
    ).toBe(true)
  })
})
