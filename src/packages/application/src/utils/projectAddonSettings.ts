import type { AddonSettingsSnapshot } from '../contracts/addons/settings/IAddonSettingsRepository'
import type { AddonSettingsValues } from '../contracts/addons/vault/IAddonVaultAPI'

export type AddonSettingsFieldBoundary = {
  id: string
  scope?: 'credential' | 'configuration'
}

export function projectAddonSettings(
  snapshot: AddonSettingsSnapshot,
  fields: readonly AddonSettingsFieldBoundary[],
): AddonSettingsSnapshot {
  const configurationIds = new Set<string>()
  for (const field of fields) {
    if (field.scope === 'credential') continue
    configurationIds.add(field.id)
  }
  const values: AddonSettingsValues = {}
  for (const [fieldId, value] of Object.entries(snapshot.values)) {
    if (!configurationIds.has(fieldId)) continue
    Object.defineProperty(values, fieldId, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return {
    schemaVersion: snapshot.schemaVersion,
    revision: snapshot.revision,
    values,
  }
}
