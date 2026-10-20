import { AppError, Either, isNonEmptyString } from '@mr-tick/shared/helpers'

import type {
  AddonSettingsSchema,
  AddonSettingsView,
  AddonVaultScope,
  IAddonScopeOwnershipValidator,
  IAddonSettingsVaultGateway,
} from '@/contracts'
import {
  flattenSettingsFields,
  hasUnclassifiedPassword,
  projectAddonSettings,
} from '@/utils'

export interface GetAddonSettingsInput {
  addonId: string
  scope: AddonVaultScope
  schema: AddonSettingsSchema
}

export class GetAddonSettingsService {
  constructor(
    private readonly vaultGatewayProvider: (
      addonId: string,
    ) => IAddonSettingsVaultGateway,
    private readonly ownershipValidator: IAddonScopeOwnershipValidator,
  ) {}

  public async execute(
    input: GetAddonSettingsInput,
  ): Promise<Either<AppError, AddonSettingsView>> {
    if (!isNonEmptyString(input.addonId)) {
      return Either.failure(AppError.ValidationError('ADDON_ID_REQUIRED'))
    }
    const ownershipResult = await this.ownershipValidator.validateScope(
      input.addonId,
      input.scope,
    )
    if (ownershipResult.isFailure()) {
      return ownershipResult.forwardFailure()
    }

    const fields = flattenSettingsFields(input.schema)
    if (hasUnclassifiedPassword(fields)) {
      return Either.failure(
        AppError.ValidationError('ADDON_CREDENTIAL_SCOPE_REQUIRED'),
      )
    }

    const vault = this.vaultGatewayProvider(input.addonId)
    const result = await vault.getSettings(input.scope)
    if (result.isFailure()) {
      return result.forwardFailure()
    }

    const projected = projectAddonSettings(result.success, fields)
    const credentialStates: Record<string, 'configured' | 'absent'> = {}

    for (const field of fields) {
      if (field.scope !== 'credential') {
        continue
      }
      if (field.type !== 'password') {
        return Either.failure(
          AppError.ValidationError('ADDON_CREDENTIAL_FIELD_INVALID'),
        )
      }
      const credential = await vault.getCredential(input.scope, field.id)
      if (credential.isFailure()) {
        return credential.forwardFailure()
      }
      if (credential.success === null) {
        credentialStates[field.id] = 'absent'
      }
      if (credential.success !== null) {
        credentialStates[field.id] = 'configured'
      }
    }

    const view: AddonSettingsView = {
      ...projected,
      credentialStates,
    }
    return Either.success(view)
  }
}
