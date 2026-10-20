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

import { SaveAddonSettingsService } from './SaveAddonSettingsService'

class MockVaultGateway implements IAddonSettingsVaultGateway {
  public snapshot: AddonSettingsSnapshot = {
    schemaVersion: 1,
    revision: 1,
    values: { host: 'https://initial.com' },
  }
  public credentials: Record<string, string | null> = {}
  public failCredentialKey: string | null = null
  public failSaveConflict = false
  public saveSettingsCallCount = 0
  public setCredentialCallCount = 0
  public deleteCredentialCallCount = 0

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
    this.saveSettingsCallCount += 1
    if (this.failSaveConflict) {
      return Either.failure(AppError.Http(409, 'ADDON_SETTINGS_FIELD_CONFLICT'))
    }
    this.snapshot = {
      schemaVersion: 1,
      revision: expectedRevision + 1,
      values: { ...this.snapshot.values, ...settings },
    }
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
    this.setCredentialCallCount += 1
    if (this.failCredentialKey === key) {
      return Either.failure(AppError.Internal('CREDENTIAL_ENCRYPTION_FAILED'))
    }
    this.credentials[key] = value
    return Either.success()
  }

  public async deleteCredential(
    scope: AddonVaultScope,
    key: string,
  ): Promise<Either<AppError, void>> {
    this.deleteCredentialCallCount += 1
    if (this.failCredentialKey === key) {
      return Either.failure(AppError.Internal('CREDENTIAL_DELETE_FAILED'))
    }
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

describe('SaveAddonSettingsService', () => {
  const schema: AddonSettingsField[] = [
    { id: 'host', label: 'Host', type: 'text', scope: 'configuration' },
    { id: 'token', label: 'Token', type: 'password', scope: 'credential' },
  ]

  it('saves settings and credentials in a single application coordination flow', async () => {
    const gateway = new MockVaultGateway()
    const service = new SaveAddonSettingsService(
      () => gateway,
      new NoOpAddonScopeOwnershipValidator(),
    )

    const result = await service.execute({
      addonId: 'test-addon',
      scope: { kind: 'addon' },
      expectedRevision: 1,
      schema,
      patch: { host: 'https://updated.com' },
      credentials: { token: 'my-new-token' },
    })

    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return

    expect(result.success.revision).toBe(2)
    expect(result.success.values.host).toBe('https://updated.com')
    expect(result.success.credentialStates.token).toBe('configured')
    expect(gateway.credentials.token).toBe('my-new-token')
  })

  it('returns revision conflict 409 when settings update conflicts', async () => {
    const gateway = new MockVaultGateway()
    gateway.failSaveConflict = true
    const service = new SaveAddonSettingsService(
      () => gateway,
      new NoOpAddonScopeOwnershipValidator(),
    )

    const result = await service.execute({
      addonId: 'test-addon',
      scope: { kind: 'addon' },
      expectedRevision: 1,
      schema,
      patch: { host: 'https://updated.com' },
    })

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return
    expect(result.failure.statusCode).toBe(409)
    expect(result.failure.messageKey).toBe('ADDON_SETTINGS_FIELD_CONFLICT')
  })

  it('returns partial failure 207 when settings save succeeded but a credential write failed', async () => {
    const gateway = new MockVaultGateway()
    gateway.failCredentialKey = 'token'
    const service = new SaveAddonSettingsService(
      () => gateway,
      new NoOpAddonScopeOwnershipValidator(),
    )

    const result = await service.execute({
      addonId: 'test-addon',
      scope: { kind: 'addon' },
      expectedRevision: 1,
      schema,
      patch: { host: 'https://updated.com' },
      credentials: { token: 'my-failing-token' },
    })

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return
    expect(result.failure.statusCode).toBe(207)
    expect(result.failure.messageKey).toBe('ADDON_CREDENTIAL_PARTIAL_FAILURE')
    expect(gateway.saveSettingsCallCount).toBe(1)
    expect(gateway.setCredentialCallCount).toBe(1)
  })

  it('deletes credential when empty string or null is provided', async () => {
    const gateway = new MockVaultGateway()
    gateway.credentials.token = 'existing-token'
    const service = new SaveAddonSettingsService(
      () => gateway,
      new NoOpAddonScopeOwnershipValidator(),
    )

    const result = await service.execute({
      addonId: 'test-addon',
      scope: { kind: 'addon' },
      expectedRevision: 1,
      schema,
      patch: {},
      credentials: { token: '' },
    })

    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return

    expect(result.success.credentialStates.token).toBe('absent')
    expect(gateway.deleteCredentialCallCount).toBe(1)
    expect(gateway.credentials.token).toBeUndefined()
  })

  it('fails with 401 when ownership validation rejects connection or capability', async () => {
    const gateway = new MockVaultGateway()
    const service = new SaveAddonSettingsService(
      () => gateway,
      new RejectingOwnershipValidator(),
    )

    const result = await service.execute({
      addonId: 'test-addon',
      scope: {
        kind: 'connection',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-foreign',
      },
      expectedRevision: 0,
      schema,
      patch: { host: 'https://other.com' },
    })

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return
    expect(result.failure.statusCode).toBe(401)
    expect(result.failure.messageKey).toBe('ADDON_SCOPE_OWNERSHIP_INVALID')
  })

  it('supports saving with connection and capability scopes', async () => {
    const gateway = new MockVaultGateway()
    const service = new SaveAddonSettingsService(
      () => gateway,
      new NoOpAddonScopeOwnershipValidator(),
    )

    const connResult = await service.execute({
      addonId: 'test-addon',
      scope: {
        kind: 'connection',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
      },
      expectedRevision: 1,
      schema,
      patch: { host: 'https://conn1.com' },
    })
    expect(connResult.isSuccess()).toBe(true)

    const capResult = await service.execute({
      addonId: 'test-addon',
      scope: {
        kind: 'capability',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        capabilityId: 'watcher',
      },
      expectedRevision: 2,
      schema,
      patch: { host: 'https://cap1.com' },
    })
    expect(capResult.isSuccess()).toBe(true)
  })
})
