import { AddonSettingsSchema } from './AddonSettingsSchema'

export type AddonSettingsSchemaProvider =
  | AddonSettingsSchema
  | (() => Promise<AddonSettingsSchema> | AddonSettingsSchema)

export interface ISettingsRegistry {
  register(schema: AddonSettingsSchemaProvider): void
  getSchema():
    Promise<AddonSettingsSchema | undefined> | AddonSettingsSchema | undefined
}
