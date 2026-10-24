import { AddonConnectionProfilesResolver } from '@mr-tick/application'
import type { AddonContext, AddonSettingsSchema } from '@mr-tick/sdk'
import { describe, expect, it } from 'vitest'

import { createLoader } from './AddonLoader.Capabilities.fixture'

const schema: AddonSettingsSchema = [
  { id: 'secret', label: 'Secret', type: 'password', scope: 'credential' },
]

describe('AddonLoader account schemas', () => {
  it('supports auth without datasource and fences inactive contributions', async () => {
    const profiles = new AddonConnectionProfilesResolver()
    const loader = createLoader(undefined, undefined, profiles)
    let retainedContext: AddonContext | undefined
    await loader.activateAddon(
      'watcher',
      {
        activate(context) {
          retainedContext = context
          expect(
            context.contributions.connections
              .registerProfiles([
                {
                  connectionProfileId: 'account',
                  cardinality: 'single',
                  default: true,
                },
              ])
              .isSuccess(),
          ).toBe(true)
          expect(
            context.contributions.connections
              .registerSchema('account', schema)
              .isSuccess(),
          ).toBe(true)
        },
        deactivate() {},
      },
      {
        id: 'watcher',
        name: 'Watcher',
        version: '1.0.0',
        author: 'Test',
        shortDescription: 'Test',
        description: 'Test',
        capabilities: ['auth', 'watcher'],
      },
    )
    expect(loader.getDataSource('watcher')).toBeUndefined()
    expect(
      (await profiles.getConnectionSchema('watcher', 'account')).success,
    ).toEqual(schema)
    await loader.deactivateAddon('watcher')
    expect(
      (await profiles.getConnectionSchema('watcher', 'account')).isFailure(),
    ).toBe(true)
    expect(retainedContext).toBeDefined()
    if (!retainedContext) return
    const result = retainedContext.contributions.connections.registerSchema(
      'account',
      schema,
    )
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('ADDON_INACTIVE')
  })

  it('requires auth capability even when dataSource is present', () => {
    const loader = createLoader()
    loader.registerManifestCapabilities('source', ['dataSource'])
    const context = loader.createContext('source')
    const result = context.contributions.connections.registerSchema(
      'account',
      schema,
    )
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('AUTH_CAPABILITY_REQUIRED')
  })
})
