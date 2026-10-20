import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { IAddonEventsAPI } from '../../host/events/IAddonEventsAPI'
import type {
  AddonSettingsValues,
  AddonVaultScope,
} from '../../host/vault/IAddonVaultAPI'
import type { AddonSettingsSchema } from './AddonSettingsSchema'

export interface AddonSettingsContext {
  scope?: AddonVaultScope
  workspaceId?: string
}

export interface AddonSettingsApplyContext {
  scope: AddonVaultScope
  revision: number
  values: AddonSettingsValues
  events: IAddonEventsAPI
  track: (cleanup: () => void) => () => void
}

export type AddonSettingsApplyHandler = (
  context: AddonSettingsApplyContext,
) => Promise<Either<AppError, void>> | Either<AppError, void>

export interface AddonSettingsRegisterOptions {
  onApply?: AddonSettingsApplyHandler
}

export type AddonSettingsSchemaProvider =
  | AddonSettingsSchema
  | ((
      context?: AddonSettingsContext,
    ) => Promise<AddonSettingsSchema> | AddonSettingsSchema)

export interface IAddonSettingsAPI {
  register(
    schema: AddonSettingsSchemaProvider,
    options?: AddonSettingsRegisterOptions,
  ): void
  getSchema(
    context?: AddonSettingsContext,
  ): Promise<AddonSettingsSchema | undefined> | AddonSettingsSchema | undefined
}
