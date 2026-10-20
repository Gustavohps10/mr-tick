import type { AddonSettingsValues } from '../contracts/addons/vault/IAddonVaultAPI'

export function rebaseAddonSettings(
  latest: AddonSettingsValues,
  patch: AddonSettingsValues,
): AddonSettingsValues {
  const rebased: AddonSettingsValues = { ...latest }
  for (const [fieldId, value] of Object.entries(patch)) {
    Object.defineProperty(rebased, fieldId, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return rebased
}
