import type { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  AddonSettingsValues,
  AddonVaultScope,
} from '../vault/IAddonVaultAPI'
import type { AddonSettingsSnapshot } from './IAddonSettingsRepository'

export interface IAddonSettingsVaultGateway {
  getSettings(
    scope: AddonVaultScope,
  ): Promise<Either<AppError, AddonSettingsSnapshot>>

  saveSettings(
    scope: AddonVaultScope,
    expectedRevision: number,
    settings: AddonSettingsValues,
    editableFieldIds: readonly string[],
  ): Promise<Either<AppError, AddonSettingsSnapshot>>

  getCredential(
    scope: AddonVaultScope,
    key: string,
  ): Promise<Either<AppError, string | null>>

  setCredential(
    scope: AddonVaultScope,
    key: string,
    value: string,
  ): Promise<Either<AppError, void>>

  deleteCredential(
    scope: AddonVaultScope,
    key: string,
  ): Promise<Either<AppError, void>>
}
