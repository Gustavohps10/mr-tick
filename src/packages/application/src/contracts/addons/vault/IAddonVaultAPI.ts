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

export type AddonSettingScalarValue = string | number | boolean | null

export type AddonSettingValue =
  AddonSettingScalarValue | AddonSettingObjectValue | AddonSettingArrayValue

export interface AddonSettingObjectValue {
  readonly [key: string]: AddonSettingValue | undefined
}

export type AddonSettingArrayValue = readonly AddonSettingValue[]

export type AddonSettingsValues = Record<string, AddonSettingValue>

export type AddonCollectionItemRecord = {
  readonly itemId: string
  readonly values: AddonSettingsValues
}

export type AddonCollectionItemEnvelope = AddonCollectionItemRecord

export type AddonTaskReferenceValue = {
  readonly workspaceId: string
  readonly connectionInstanceId: string
  readonly taskId: string
  readonly titleSnapshot?: string
  readonly projectNameSnapshot?: string
  readonly metadataValues?: Readonly<Record<string, string | number | boolean>>
}

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
