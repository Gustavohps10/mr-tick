import { AppError, Either, isNonEmptyString } from '@mr-tick/shared/helpers'

import type {
  AddonCapabilityOwnershipDescriptor,
  IAddonCapabilityOwnershipValidator,
} from '@/contracts'

export class AddonCapabilityOwnershipValidator implements IAddonCapabilityOwnershipValidator {
  constructor(
    private readonly capabilityResolver: (
      addonId: string,
      capabilityId: string,
    ) => AddonCapabilityOwnershipDescriptor | undefined,
  ) {}

  public async validateCapability(
    addonId: string,
    capabilityId: string,
    connectionProfileId?: string,
  ): Promise<Either<AppError, void>> {
    if (!isNonEmptyString(addonId)) {
      return Either.failure(AppError.ValidationError('ADDON_ID_REQUIRED'))
    }
    if (!isNonEmptyString(capabilityId)) {
      return Either.failure(AppError.ValidationError('CAPABILITY_ID_REQUIRED'))
    }
    const descriptor = this.capabilityResolver(addonId, capabilityId)
    if (!descriptor) {
      return Either.failure(
        AppError.Unauthorized('ADDON_SCOPE_OWNERSHIP_INVALID'),
      )
    }
    if (
      descriptor.settingsSchemaScope !== undefined &&
      descriptor.settingsSchemaScope !== 'capability'
    ) {
      return Either.failure(
        AppError.ValidationError('CAPABILITY_SETTINGS_SCOPE_MISMATCH'),
      )
    }
    if (descriptor.authRequirement.kind === 'required') {
      if (!isNonEmptyString(connectionProfileId)) {
        return Either.failure(
          AppError.Unauthorized('ADDON_SCOPE_OWNERSHIP_INVALID'),
        )
      }
      if (
        descriptor.authRequirement.connectionProfileId !== connectionProfileId
      ) {
        return Either.failure(
          AppError.Unauthorized('ADDON_SCOPE_OWNERSHIP_INVALID'),
        )
      }
    }
    return Either.success()
  }
}
