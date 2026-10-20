import { AppError, Either, isNonEmptyString } from '@mr-tick/shared/helpers'

import type { AddonVaultScope } from '../vault/IAddonVaultAPI'

export interface IAddonScopeOwnershipValidator {
  validateScope(
    addonId: string,
    scope: AddonVaultScope,
  ): Promise<Either<AppError, void>>
}

export interface AddonCapabilityOwnershipDescriptor {
  readonly capabilityId: string
  readonly authRequirement:
    | { kind: 'none' }
    | {
        kind: 'required'
        connectionProfileId: string
        authorizationRole: string
      }
  readonly settingsSchemaScope?:
    'workspace' | 'connection' | 'capability' | 'addon'
}

export interface IAddonCapabilityOwnershipValidator {
  validateCapability(
    addonId: string,
    capabilityId: string,
    connectionProfileId?: string,
  ): Promise<Either<AppError, void>>
}

export class NoOpAddonCapabilityOwnershipValidator implements IAddonCapabilityOwnershipValidator {
  public async validateCapability(
    addonId: string,
    capabilityId: string,
    _connectionProfileId?: string,
  ): Promise<Either<AppError, void>> {
    if (!isNonEmptyString(addonId)) {
      return Either.failure(AppError.ValidationError('ADDON_ID_REQUIRED'))
    }
    if (!isNonEmptyString(capabilityId)) {
      return Either.failure(AppError.ValidationError('CAPABILITY_ID_REQUIRED'))
    }
    return Either.success()
  }
}

export class NoOpAddonScopeOwnershipValidator implements IAddonScopeOwnershipValidator {
  public async validateScope(
    addonId: string,
    scope: AddonVaultScope,
  ): Promise<Either<AppError, void>> {
    if (!isNonEmptyString(addonId)) {
      return Either.failure(AppError.ValidationError('ADDON_ID_REQUIRED'))
    }
    if (scope.kind === 'workspace' && !isNonEmptyString(scope.workspaceId)) {
      return Either.failure(AppError.ValidationError('WORKSPACE_ID_REQUIRED'))
    }
    if (scope.kind === 'connection') {
      if (!isNonEmptyString(scope.workspaceId)) {
        return Either.failure(AppError.ValidationError('WORKSPACE_ID_REQUIRED'))
      }
      if (!isNonEmptyString(scope.connectionInstanceId)) {
        return Either.failure(
          AppError.ValidationError('CONNECTION_INSTANCE_ID_REQUIRED'),
        )
      }
    }
    if (scope.kind === 'capability') {
      if (!isNonEmptyString(scope.workspaceId)) {
        return Either.failure(AppError.ValidationError('WORKSPACE_ID_REQUIRED'))
      }
      if (!isNonEmptyString(scope.connectionInstanceId)) {
        return Either.failure(
          AppError.ValidationError('CONNECTION_INSTANCE_ID_REQUIRED'),
        )
      }
      if (!isNonEmptyString(scope.capabilityId)) {
        return Either.failure(
          AppError.ValidationError('CAPABILITY_ID_REQUIRED'),
        )
      }
    }
    return Either.success()
  }
}
