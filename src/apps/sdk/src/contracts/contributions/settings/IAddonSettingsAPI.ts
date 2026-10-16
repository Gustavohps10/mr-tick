import { AddonVaultScope } from '../../host/vault/IAddonVaultAPI'
import { AddonSettingsSchema } from './AddonSettingsSchema'

export interface AddonSettingsContext {
  scope?: AddonVaultScope
  workspaceId?: string
}

export type AddonSettingsSchemaProvider =
  | AddonSettingsSchema
  | ((
      context?: AddonSettingsContext,
    ) => Promise<AddonSettingsSchema> | AddonSettingsSchema)

export interface IAddonSettingsAPI {
  register(schema: AddonSettingsSchemaProvider): void
  getSchema(
    context?: AddonSettingsContext,
  ): Promise<AddonSettingsSchema | undefined> | AddonSettingsSchema | undefined
}
