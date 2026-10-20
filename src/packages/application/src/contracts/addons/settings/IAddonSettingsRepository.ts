import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { AddonSettingsValues } from '../vault/IAddonVaultAPI'

export type AddonSettingsSnapshot = {
  schemaVersion: 1
  revision: number
  values: AddonSettingsValues
}

export type AddonSettingsView = AddonSettingsSnapshot & {
  credentialStates: Record<string, 'configured' | 'absent'>
}

export interface IAddonSettingsRepository {
  read(
    addonId: string,
    scopeKey: string,
  ): Promise<Either<AppError, AddonSettingsSnapshot>>
  patch(
    addonId: string,
    scopeKey: string,
    expectedRevision: number,
    patch: AddonSettingsValues,
    editableFieldIds: readonly string[],
  ): Promise<Either<AppError, AddonSettingsSnapshot>>
}
