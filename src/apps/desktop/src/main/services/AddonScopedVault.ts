import {
  AddonSettingsSnapshot,
  CredentialReference,
  CredentialReferenceFactory,
  IAddonSettingsRepository,
  IAddonSettingsVaultGateway,
  IConnectionCredentialsVault,
  ICredentialsVault,
  IWorkspaceCredentialReferenceRegistry,
  WorkspaceCredentialDeleteReservation,
  WorkspaceCredentialReferenceInput,
  WorkspaceCredentialWriteReservation,
} from '@mr-tick/application'
import type {
  AddonSettingsValues,
  AddonVaultScope,
  IAddonVaultAPI,
} from '@mr-tick/sdk'
import {
  AppError,
  Either,
  isNonEmptyString,
  isRecord,
  isString,
} from '@mr-tick/shared/helpers'

/** Shared queue prevents settings UI and background addon updates losing each other. */
export class AddonScopedVault
  implements IAddonVaultAPI, IAddonSettingsVaultGateway
{
  private readonly tails = new Map<string, Promise<void>>()
  constructor(
    private readonly addonId: string,
    private readonly credentialsVault: ICredentialsVault,
    private readonly connectionCredentialsVault: IConnectionCredentialsVault,
    private readonly referenceRegistry: IWorkspaceCredentialReferenceRegistry,
    private readonly settingsRepository: IAddonSettingsRepository,
  ) {}

  get(
    scope: AddonVaultScope,
    key: string,
  ): Promise<Either<AppError, string | null>> {
    return this.serial(scope, async (account) => {
      if (!isNonEmptyString(key))
        return Either.failure(
          AppError.ValidationError('ADDON_VAULT_KEY_REQUIRED'),
        )
      const reference = this.secretReference(scope, key)
      if (reference.isFailure()) return reference.forwardFailure()
      if (scope.kind !== 'addon') {
        const resolved = await this.resolveSecretWorkspaceReference(scope, key)
        if (resolved.isFailure()) return resolved.forwardFailure()
        if (resolved.success === null) return Either.success(null)
        const result = await this.credentialsVault.getToken(
          resolved.success.service,
          resolved.success.account,
        )
        if (result.kind === 'unavailable')
          return Either.failure(AppError.Internal('ADDON_VAULT_READ_FAILED'))
        if (result.kind === 'absent') return Either.success(null)
        return Either.success(result.token)
      }
      const result = await this.credentialsVault.getToken(
        reference.success.service,
        reference.success.account,
      )
      if (result.kind === 'unavailable')
        return Either.failure(AppError.Internal('ADDON_VAULT_READ_FAILED'))
      if (result.kind === 'absent') return Either.success(null)
      return Either.success(result.token)
    })
  }
  set(
    scope: AddonVaultScope,
    key: string,
    value: string,
  ): Promise<Either<AppError, void>> {
    return this.serial(scope, async (account) => {
      if (!isNonEmptyString(key) || !isString(value))
        return Either.failure(
          AppError.ValidationError('ADDON_VAULT_VALUE_INVALID'),
        )
      if (scope.kind !== 'addon')
        return this.writeWorkspaceSecret(scope, key, value)
      const reference = this.secretReference(scope, key)
      if (reference.isFailure()) return reference.forwardFailure()
      const result = await this.connectionCredentialsVault.writeCredential(
        reference.success,
        value,
      )
      if (result.kind === 'unavailable')
        return Either.failure(
          AppError.Internal('ADDON_VAULT_WRITE_UNAVAILABLE'),
        )
      return Either.success()
    })
  }
  delete(scope: AddonVaultScope, key: string): Promise<Either<AppError, void>> {
    return this.serial(scope, async (account) => {
      if (!isNonEmptyString(key))
        return Either.failure(
          AppError.ValidationError('ADDON_VAULT_KEY_REQUIRED'),
        )
      if (scope.kind !== 'addon') return this.deleteWorkspaceSecret(scope, key)
      const reference = this.secretReference(scope, key)
      if (reference.isFailure()) return reference.forwardFailure()
      const result = await this.connectionCredentialsVault.removeCredential(
        reference.success,
      )
      if (result.kind === 'unavailable')
        return Either.failure(AppError.Internal('ADDON_VAULT_CLEANUP_PENDING'))
      return Either.success()
    })
  }
  getSettings(
    scope: AddonVaultScope,
  ): Promise<Either<AppError, AddonSettingsSnapshot>> {
    return this.serial(scope, async (account) =>
      this.settingsRepository.read(this.addonId, account),
    )
  }
  saveSettings(
    scope: AddonVaultScope,
    expectedRevision: number,
    settings: AddonSettingsValues,
    editableFieldIds: readonly string[],
  ): Promise<Either<AppError, AddonSettingsSnapshot>> {
    return this.serial(scope, async (account) => {
      return this.settingsRepository.patch(
        this.addonId,
        account,
        expectedRevision,
        settings,
        editableFieldIds,
      )
    })
  }
  rejectInvalidCredentialField(): Either<AppError, void> {
    return Either.failure(
      AppError.ValidationError('ADDON_CREDENTIAL_FIELD_INVALID'),
    )
  }
  getCredential(
    scope: AddonVaultScope,
    key: string,
  ): Promise<Either<AppError, string | null>> {
    return this.get(scope, key)
  }
  setCredential(
    scope: AddonVaultScope,
    key: string,
    value: string,
  ): Promise<Either<AppError, void>> {
    return this.set(scope, key, value)
  }
  deleteCredential(
    scope: AddonVaultScope,
    key: string,
  ): Promise<Either<AppError, void>> {
    return this.delete(scope, key)
  }
  private secretReference(
    scope: AddonVaultScope,
    key: string,
  ): Either<AppError, CredentialReference> {
    if (!isNonEmptyString(key))
      return Either.failure(
        AppError.ValidationError('ADDON_VAULT_KEY_REQUIRED'),
      )
    if (scope.kind === 'addon')
      return Either.success(
        CredentialReferenceFactory.createAddonSecret(this.addonId, scope, key),
      )
    if (
      (scope.kind === 'workspace' && isNonEmptyString(scope.workspaceId)) ||
      (scope.kind === 'connection' &&
        isNonEmptyString(scope.workspaceId) &&
        isNonEmptyString(scope.connectionInstanceId)) ||
      (scope.kind === 'capability' &&
        isNonEmptyString(scope.workspaceId) &&
        isNonEmptyString(scope.connectionInstanceId) &&
        isNonEmptyString(scope.capabilityId))
    )
      return Either.success(
        CredentialReferenceFactory.createAddonSecret(this.addonId, scope, key),
      )
    return Either.failure(
      AppError.ValidationError('ADDON_VAULT_SCOPE_REQUIRED'),
    )
  }
  private serial<T>(
    scope: AddonVaultScope,
    operation: (account: string) => Promise<Either<AppError, T>>,
  ): Promise<Either<AppError, T>> {
    const account = vaultAccount(scope)
    if (account.isFailure()) return Promise.resolve(account.forwardFailure())
    let previous = this.tails.get(account.success)
    if (previous === undefined) previous = Promise.resolve()
    const result = previous.then(() => operation(account.success))
    const tail = result.then(
      () => {},
      () => {},
    )
    this.tails.set(account.success, tail)
    void tail.then(() => {
      if (this.tails.get(account.success) === tail)
        this.tails.delete(account.success)
    })
    return result
  }
  private async resolveSecretWorkspaceReference(
    scope: Extract<AddonVaultScope, { workspaceId: string }>,
    fieldId: string,
  ): Promise<Either<AppError, CredentialReference | null>> {
    const logical = this.secretReference(scope, fieldId)
    if (logical.isFailure()) return logical.forwardFailure()
    const input: WorkspaceCredentialReferenceInput = {
      ownerId: this.addonId,
      workspaceId: scope.workspaceId,
      logicalReferenceId: logical.success.id,
    }
    const stored =
      await this.referenceRegistry.getWorkspaceCredentialReference(input)
    if (stored.isFailure()) return stored.forwardFailure()
    if (
      stored.success === undefined ||
      stored.success.activeReferenceId === null
    )
      return Either.success(null)
    if (stored.success.status !== 'active')
      return Either.failure(
        AppError.Http(409, 'ADDON_CREDENTIAL_DELETE_PENDING'),
      )
    const reference = CredentialReferenceFactory.fromId(
      stored.success.activeReferenceId,
    )
    if (reference === undefined || reference.service !== this.addonId)
      return Either.failure(
        AppError.ValidationError('ADDON_CREDENTIAL_REFERENCE_INVALID'),
      )
    return Either.success(reference)
  }

  private async writeWorkspaceSecret(
    scope: Extract<AddonVaultScope, { workspaceId: string }>,
    fieldId: string,
    value: string,
  ): Promise<Either<AppError, void>> {
    const logical = this.secretReference(scope, fieldId)
    if (logical.isFailure()) return logical.forwardFailure()
    const input: WorkspaceCredentialReferenceInput = {
      ownerId: this.addonId,
      workspaceId: scope.workspaceId,
      logicalReferenceId: logical.success.id,
    }
    const current =
      await this.referenceRegistry.getWorkspaceCredentialReference(input)
    if (current.isFailure()) return current.forwardFailure()
    if (current.success !== undefined && current.success.status !== 'active')
      return Either.failure(
        AppError.Http(409, 'ADDON_CREDENTIAL_WRITE_PENDING'),
      )
    const previousReferenceId =
      current.success === undefined ? null : current.success.activeReferenceId
    const operationId = crypto.randomUUID()
    const candidate = CredentialReferenceFactory.createAddonSecretCandidate(
      this.addonId,
      scope,
      fieldId,
      operationId,
    )
    const reservation: WorkspaceCredentialWriteReservation = {
      ...input,
      candidateReferenceId: candidate.id,
      previousReferenceId,
    }
    const reserved =
      await this.referenceRegistry.reserveWorkspaceCredentialWrite(reservation)
    if (reserved.isFailure()) return reserved.forwardFailure()
    const written = await this.connectionCredentialsVault.writeCredential(
      candidate,
      value,
    )
    if (written.kind === 'unavailable')
      return Either.failure(AppError.Internal('ADDON_VAULT_WRITE_UNAVAILABLE'))
    const committed =
      await this.referenceRegistry.commitWorkspaceCredentialWrite(reservation)
    if (committed.isFailure()) return committed.forwardFailure()
    const cleaned = await this.cleanupWorkspaceReference(previousReferenceId)
    if (cleaned.isFailure()) return cleaned.forwardFailure()
    const finished =
      await this.referenceRegistry.finishWorkspaceCredentialWrite(reservation)
    if (finished.isFailure()) return finished.forwardFailure()
    return Either.success()
  }

  private async deleteWorkspaceSecret(
    scope: Extract<AddonVaultScope, { workspaceId: string }>,
    fieldId: string,
  ): Promise<Either<AppError, void>> {
    const logical = this.secretReference(scope, fieldId)
    if (logical.isFailure()) return logical.forwardFailure()
    const input: WorkspaceCredentialReferenceInput = {
      ownerId: this.addonId,
      workspaceId: scope.workspaceId,
      logicalReferenceId: logical.success.id,
    }
    const current =
      await this.referenceRegistry.getWorkspaceCredentialReference(input)
    if (current.isFailure()) return current.forwardFailure()
    const previousReferenceId =
      current.success === undefined ? null : current.success.activeReferenceId
    const reservation: WorkspaceCredentialDeleteReservation = {
      ...input,
      previousReferenceId,
    }
    const reserved =
      await this.referenceRegistry.reserveWorkspaceCredentialDelete(reservation)
    if (reserved.isFailure()) return reserved.forwardFailure()
    const cleaned = await this.cleanupWorkspaceReference(previousReferenceId)
    if (cleaned.isFailure()) return cleaned.forwardFailure()
    const finished =
      await this.referenceRegistry.finishWorkspaceCredentialDelete(reservation)
    if (finished.isFailure()) return finished.forwardFailure()
    return Either.success()
  }

  private async cleanupWorkspaceReference(
    referenceId: string | null,
  ): Promise<Either<AppError, void>> {
    if (referenceId === null) return Either.success()
    const reference = CredentialReferenceFactory.fromId(referenceId)
    if (reference === undefined)
      return Either.failure(
        AppError.ValidationError('CREDENTIAL_REFERENCE_INVALID'),
      )
    const cleanupResult =
      await this.connectionCredentialsVault.removeCredential(reference)
    if (cleanupResult.kind === 'unavailable')
      return Either.failure(AppError.Internal('ADDON_VAULT_CLEANUP_PENDING'))
    return Either.success()
  }
}
function vaultAccount(scope: AddonVaultScope): Either<AppError, string> {
  if (!isRecord(scope))
    return Either.failure(
      AppError.ValidationError('ADDON_VAULT_SCOPE_REQUIRED'),
    )
  if (scope.kind === 'addon') return Either.success(JSON.stringify(['addon']))
  if (
    scope.kind === 'connection' &&
    isNonEmptyString(scope.workspaceId) &&
    isNonEmptyString(scope.connectionInstanceId)
  ) {
    return Either.success(
      JSON.stringify([
        'connection',
        scope.workspaceId,
        scope.connectionInstanceId,
      ]),
    )
  }
  if (
    scope.kind === 'capability' &&
    isNonEmptyString(scope.workspaceId) &&
    isNonEmptyString(scope.connectionInstanceId) &&
    isNonEmptyString(scope.capabilityId)
  ) {
    return Either.success(
      JSON.stringify([
        'capability',
        scope.workspaceId,
        scope.connectionInstanceId,
        scope.capabilityId,
      ]),
    )
  }
  if (scope.kind === 'workspace' && isNonEmptyString(scope.workspaceId))
    return Either.success(JSON.stringify(['workspace', scope.workspaceId]))
  return Either.failure(AppError.ValidationError('ADDON_VAULT_SCOPE_REQUIRED'))
}
