import type { AppError, Either } from '@mr-tick/shared/helpers'

export type AddonVaultScope =
  { kind: 'addon' } | { kind: 'workspace'; workspaceId: string }
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
}
