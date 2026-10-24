import { AddonConnectionProfilesResolver } from '@mr-tick/application'
import type { AddonSettingsSchema } from '@mr-tick/sdk'
import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it } from 'vitest'

import { AddonsHandler } from './AddonsHandler'

function createHandler(
  profiles: AddonConnectionProfilesResolver,
): AddonsHandler {
  return new AddonsHandler(
    {} as ConstructorParameters<typeof AddonsHandler>[0],
    {} as ConstructorParameters<typeof AddonsHandler>[1],
    {} as ConstructorParameters<typeof AddonsHandler>[2],
    {} as ConstructorParameters<typeof AddonsHandler>[3],
    {} as ConstructorParameters<typeof AddonsHandler>[4],
    {} as ConstructorParameters<typeof AddonsHandler>[5],
    profiles,
  )
}

const event = {} as IpcMainInvokeEvent

describe('AddonsHandler account schema transport', () => {
  it('reads the explicitly selected profile without consulting a datasource loader', async () => {
    const profiles = new AddonConnectionProfilesResolver()
    profiles.registerProfiles('auth-only', [
      { connectionProfileId: 'manual', cardinality: 'multi', default: true },
      { connectionProfileId: 'oauth', cardinality: 'single', default: false },
    ])
    const schema: AddonSettingsSchema = [
      { id: 'token', label: 'Token', type: 'password', scope: 'credential' },
    ]
    profiles.registerSchema('auth-only', 'manual', schema)
    profiles.registerSchema('auth-only', 'oauth', [])
    const handler = createHandler(profiles)
    expect(
      await handler.getConnectionSchema(event, {
        body: { addonId: 'auth-only', connectionProfileId: 'manual' },
      }),
    ).toMatchObject({ isSuccess: true, data: schema })
    expect(
      await handler.getConnectionSchema(event, {
        body: { addonId: 'auth-only', connectionProfileId: 'oauth' },
      }),
    ).toMatchObject({ isSuccess: true, data: [] })
    expect(
      await handler.getConnectionSchema(event, {
        body: { addonId: 'auth-only', connectionProfileId: 'missing' },
      }),
    ).toMatchObject({
      isSuccess: false,
      statusCode: 404,
      error: 'CONNECTION_SCHEMA_NOT_FOUND',
    })
  })

  it('rejects requests without explicit profile scope', async () => {
    const handler = createHandler(new AddonConnectionProfilesResolver())
    expect(
      await handler.getConnectionSchema(event, {
        body: { addonId: 'auth-only', connectionProfileId: '' },
      }),
    ).toMatchObject({
      isSuccess: false,
      statusCode: 400,
      error: 'CONNECTION_SCHEMA_SCOPE_REQUIRED',
    })
  })
})
