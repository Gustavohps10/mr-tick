import { AppError, Either, isNonEmptyString } from '@mr-tick/shared/helpers'

import type {
  AddonVaultScope,
  IAddonCapabilityOwnershipValidator,
  IAddonScopeOwnershipValidator,
  ICoreConnectionsReadAPI,
} from '@/contracts'

export class CoreAddonScopeOwnershipValidator implements IAddonScopeOwnershipValidator {
  constructor(
    private readonly connectionsReaderProvider: (
      addonId: string,
    ) => ICoreConnectionsReadAPI,
    private readonly capabilityValidator: IAddonCapabilityOwnershipValidator,
  ) {}

  public async validateScope(
    addonId: string,
    scope: AddonVaultScope,
  ): Promise<Either<AppError, void>> {
    if (!isNonEmptyString(addonId)) {
      return Either.failure(AppError.ValidationError('ADDON_ID_REQUIRED'))
    }
    if (scope.kind === 'addon') {
      return Either.success()
    }
    if (scope.kind === 'workspace') {
      if (!isNonEmptyString(scope.workspaceId)) {
        return Either.failure(AppError.ValidationError('WORKSPACE_ID_REQUIRED'))
      }
      return Either.success()
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
      const connectionsReader = this.connectionsReaderProvider(addonId)
      const connectionResult = await connectionsReader.get({
        workspaceId: scope.workspaceId,
        connectionInstanceId: scope.connectionInstanceId,
      })
      if (connectionResult.isFailure()) {
        return Either.failure(
          AppError.Unauthorized('ADDON_SCOPE_OWNERSHIP_INVALID'),
        )
      }
      if (connectionResult.success.addonId !== addonId) {
        return Either.failure(
          AppError.Unauthorized('ADDON_SCOPE_OWNERSHIP_INVALID'),
        )
      }
      return Either.success()
    }

    if (!isNonEmptyString(scope.workspaceId)) {
      return Either.failure(AppError.ValidationError('WORKSPACE_ID_REQUIRED'))
    }
    if (!isNonEmptyString(scope.connectionInstanceId)) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_INSTANCE_ID_REQUIRED'),
      )
    }
    if (!isNonEmptyString(scope.capabilityId)) {
      return Either.failure(AppError.ValidationError('CAPABILITY_ID_REQUIRED'))
    }

    const connectionsReader = this.connectionsReaderProvider(addonId)
    const connectionResult = await connectionsReader.get({
      workspaceId: scope.workspaceId,
      connectionInstanceId: scope.connectionInstanceId,
    })
    if (connectionResult.isFailure()) {
      return Either.failure(
        AppError.Unauthorized('ADDON_SCOPE_OWNERSHIP_INVALID'),
      )
    }
    if (connectionResult.success.addonId !== addonId) {
      return Either.failure(
        AppError.Unauthorized('ADDON_SCOPE_OWNERSHIP_INVALID'),
      )
    }

    const capabilityResult = await this.capabilityValidator.validateCapability(
      addonId,
      scope.capabilityId,
      connectionResult.success.connectionProfileId,
    )
    if (capabilityResult.isFailure()) {
      return capabilityResult.forwardFailure()
    }

    return Either.success()
  }
}
