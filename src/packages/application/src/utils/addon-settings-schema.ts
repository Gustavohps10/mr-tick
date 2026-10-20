import type {
  AddonSettingsField,
  AddonSettingsSchema,
} from '../contracts/host/IHostBridge'

export function isFlatSettingsFieldList(
  schema: AddonSettingsSchema,
): schema is AddonSettingsField[] {
  if (!Array.isArray(schema)) return false
  const first = schema[0]
  if (first === undefined) return true
  return 'id' in first && 'type' in first
}

export function flattenSettingsFields(
  schema: AddonSettingsSchema,
): AddonSettingsField[] {
  if (!Array.isArray(schema)) return []
  if (isFlatSettingsFieldList(schema)) {
    return schema
  }
  const fields: AddonSettingsField[] = []
  for (const tab of schema) {
    if (tab.fields !== undefined) {
      fields.push(...tab.fields)
    }
    if (tab.groups !== undefined) {
      for (const group of tab.groups) {
        fields.push(...group.fields)
      }
    }
  }
  return fields
}

export function hasUnclassifiedPassword(
  fields: readonly AddonSettingsField[],
): boolean {
  for (const field of fields) {
    if (field.type === 'password' && field.scope !== 'credential') {
      return true
    }
  }
  return false
}
