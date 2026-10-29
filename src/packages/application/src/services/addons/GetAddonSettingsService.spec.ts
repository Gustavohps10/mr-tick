import { AppError, Either } from '@mr-tick/shared/helpers'
import { describe, expect, it } from 'vitest'

import {
  type AddonSettingsField,
  type AddonSettingsSnapshot,
  type AddonSettingsValues,
  type AddonVaultScope,
  type IAddonScopeOwnershipValidator,
  type IAddonSettingsVaultGateway,
  NoOpAddonScopeOwnershipValidator,
} from '@/contracts'

import { GetAddonSettingsService } from './GetAddonSettingsService'

class MockVaultGateway implements IAddonSettingsVaultGateway {
  public snapshot: AddonSettingsSnapshot = {
    schemaVersion: 1,
    revision: 1,
    values: { host: 'https://example.com' },
  }
  public credentials: Record<string, string | null> = {}

  public async getSettings(
    scope: AddonVaultScope,
  ): Promise<Either<AppError, AddonSettingsSnapshot>> {
    return Either.success(this.snapshot)
  }

  public async saveSettings(
    scope: AddonVaultScope,
    expectedRevision: number,
    settings: AddonSettingsValues,
    editableFieldIds: readonly string[],
  ): Promise<Either<AppError, AddonSettingsSnapshot>> {
    return Either.success(this.snapshot)
  }

  public async getCredential(
    scope: AddonVaultScope,
    key: string,
  ): Promise<Either<AppError, string | null>> {
    const val = this.credentials[key]
    if (val === undefined) {
      return Either.success(null)
    }
    return Either.success(val)
  }

  public async setCredential(
    scope: AddonVaultScope,
    key: string,
    value: string,
  ): Promise<Either<AppError, void>> {
    this.credentials[key] = value
    return Either.success()
  }

  public async deleteCredential(
    scope: AddonVaultScope,
    key: string,
  ): Promise<Either<AppError, void>> {
    delete this.credentials[key]
    return Either.success()
  }
}

class RejectingOwnershipValidator implements IAddonScopeOwnershipValidator {
  public async validateScope(): Promise<Either<AppError, void>> {
    return Either.failure(
      AppError.Unauthorized('ADDON_SCOPE_OWNERSHIP_INVALID'),
    )
  }
}

describe('GetAddonSettingsService', () => {
  it('returns projected settings and credential states', async () => {
    const gateway = new MockVaultGateway()
    gateway.credentials.token = 'secret-token'

    const service = new GetAddonSettingsService(
      () => gateway,
      new NoOpAddonScopeOwnershipValidator(),
    )
    const schema: AddonSettingsField[] = [
      { id: 'host', label: 'Host', type: 'text', scope: 'configuration' },
      { id: 'token', label: 'Token', type: 'password', scope: 'credential' },
      { id: 'apiKey', label: 'API Key', type: 'password', scope: 'credential' },
    ]

    const result = await service.execute({
      addonId: 'my-addon',
      scope: { kind: 'addon' },
      schema,
    })

    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return

    expect(result.success.values.host).toBe('https://example.com')
    expect(result.success.credentialStates.token).toBe('configured')
    expect(result.success.credentialStates.apiKey).toBe('absent')
    expect(result.success.values.token).toBeUndefined()
    expect(result.success.values.apiKey).toBeUndefined()
  })

  it('fails if password field has no credential scope', async () => {
    const gateway = new MockVaultGateway()
    const service = new GetAddonSettingsService(
      () => gateway,
      new NoOpAddonScopeOwnershipValidator(),
    )
    const schema = [
      { id: 'badPassword', label: 'Pass', type: 'password' },
    ] as unknown as AddonSettingsField[]

    const result = await service.execute({
      addonId: 'my-addon',
      scope: { kind: 'addon' },
      schema,
    })

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return
    expect(result.failure.messageKey).toBe('ADDON_CREDENTIAL_SCOPE_REQUIRED')
  })

  it('fails when ownership validation rejects connection or capability', async () => {
    const gateway = new MockVaultGateway()
    const service = new GetAddonSettingsService(
      () => gateway,
      new RejectingOwnershipValidator(),
    )
    const schema: AddonSettingsField[] = [
      { id: 'host', label: 'Host', type: 'text', scope: 'configuration' },
    ]

    const result = await service.execute({
      addonId: 'my-addon',
      scope: {
        kind: 'connection',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-foreign',
      },
      schema,
    })

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return
    expect(result.failure.statusCode).toBe(401)
    expect(result.failure.messageKey).toBe('ADDON_SCOPE_OWNERSHIP_INVALID')
  })

  it('supports connection and capability scopes', async () => {
    const gateway = new MockVaultGateway()
    const service = new GetAddonSettingsService(
      () => gateway,
      new NoOpAddonScopeOwnershipValidator(),
    )
    const schema: AddonSettingsField[] = [
      { id: 'host', label: 'Host', type: 'text', scope: 'configuration' },
    ]

    const connResult = await service.execute({
      addonId: 'my-addon',
      scope: {
        kind: 'connection',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
      },
      schema,
    })
    expect(connResult.isSuccess()).toBe(true)

    const capResult = await service.execute({
      addonId: 'my-addon',
      scope: {
        kind: 'capability',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        capabilityId: 'watcher',
      },
      schema,
    })
    expect(capResult.isSuccess()).toBe(true)
  })
})
