import { AppError, Either, isNonEmptyString } from '@mr-tick/shared/helpers'

import type {
  AddonSettingsSchema,
  AddonSettingsValues,
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

export interface SaveAddonSettingsInput {
  addonId: string
  scope: AddonVaultScope
  expectedRevision: number
  schema: AddonSettingsSchema
  patch: AddonSettingsValues
  credentials?: Record<string, string | null>
}

export class SaveAddonSettingsService {
  constructor(
    private readonly vaultGatewayProvider: (
      addonId: string,
    ) => IAddonSettingsVaultGateway,
    private readonly ownershipValidator: IAddonScopeOwnershipValidator,
  ) {}

  public async execute(
    input: SaveAddonSettingsInput,
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

    const editableFieldIds = fields
      .filter(
        (field) =>
          field.scope !== 'credential' &&
          field.type !== 'button' &&
          field.type !== 'info-card' &&
          field.type !== 'datasource-instances' &&
          field.type !== 'operational-list',
      )
      .map((field) => field.id)

    if (input.credentials !== undefined) {
      for (const fieldId of Object.keys(input.credentials)) {
        const field = fields.find((item) => item.id === fieldId)
        if (
          field === undefined ||
          field.scope !== 'credential' ||
          field.type !== 'password'
        ) {
          return Either.failure(
            AppError.ValidationError('ADDON_CREDENTIAL_FIELD_INVALID'),
          )
        }
      }
    }

    const vault = this.vaultGatewayProvider(input.addonId)
    const saved = await vault.saveSettings(
      input.scope,
      input.expectedRevision,
      input.patch,
      editableFieldIds,
    )
    if (saved.isFailure()) {
      return saved.forwardFailure()
    }

    if (input.credentials !== undefined) {
      for (const [fieldId, value] of Object.entries(input.credentials)) {
        let writeResult: Either<AppError, void> = Either.success()
        if (value === null || value.length === 0) {
          writeResult = await vault.deleteCredential(input.scope, fieldId)
        }
        if (value !== null && value.length > 0) {
          writeResult = await vault.setCredential(input.scope, fieldId, value)
        }
        if (writeResult.isFailure()) {
          return Either.failure(
            AppError.Http(207, 'ADDON_CREDENTIAL_PARTIAL_FAILURE', {
              [fieldId]: [writeResult.failure.messageKey],
            }),
          )
        }
      }
    }

    const latestSnapshot = await vault.getSettings(input.scope)
    if (latestSnapshot.isFailure()) {
      return latestSnapshot.forwardFailure()
    }

    const projected = projectAddonSettings(latestSnapshot.success, fields)
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
