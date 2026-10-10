import { AddonSettingsSchema } from './AddonSettingsSchema'

export type AddonSettingsSchemaProvider =
  | AddonSettingsSchema
  | (() => Promise<AddonSettingsSchema> | AddonSettingsSchema)

export interface IAddonSettingsAPI {
  register(schema: AddonSettingsSchemaProvider): void
  getSchema():
    Promise<AddonSettingsSchema | undefined> | AddonSettingsSchema | undefined
}
