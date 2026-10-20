import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { AddonSettingsSnapshot } from '../settings/IAddonSettingsRepository'

export type AddonVaultScope =
  | { kind: 'addon' }
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'connection'; workspaceId: string; connectionInstanceId: string }
  | {
      kind: 'capability'
      workspaceId: string
      connectionInstanceId: string
      capabilityId: string
    }
export type AddonSettingValue = string | number | boolean | null
export type AddonSettingsValues = Record<string, AddonSettingValue>

export interface IAddonVaultAPI {
  get(
    scope: AddonVaultScope,
    key: string,
  ): Promise<Either<AppError, string | null>>
  set(
    scope: AddonVaultScope,
    key: string,
    value: string,
  ): Promise<Either<AppError, void>>
  delete(scope: AddonVaultScope, key: string): Promise<Either<AppError, void>>
  getSettings(
    scope: AddonVaultScope,
  ): Promise<Either<AppError, AddonSettingsSnapshot>>
}
