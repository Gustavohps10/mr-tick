export type AddonCapability =
  'dataSource' | 'watcher' | 'calendar' | 'punch' | 'theme'

export const VALID_ADDON_CAPABILITIES: readonly AddonCapability[] = [
  'dataSource',
  'watcher',
  'calendar',
  'punch',
  'theme',
]

export function isAddonCapability(value: string): value is AddonCapability {
  return VALID_ADDON_CAPABILITIES.some((capability) => capability === value)
}

export function hasCapability(
  capabilities: readonly AddonCapability[] | undefined | null,
  capability: AddonCapability,
): boolean {
  if (!capabilities) return false
  return capabilities.includes(capability)
}

export function isDataSource(
  capabilities: readonly AddonCapability[] | undefined | null,
): boolean {
  return hasCapability(capabilities, 'dataSource')
}

export function isWatcher(
  capabilities: readonly AddonCapability[] | undefined | null,
): boolean {
  return hasCapability(capabilities, 'watcher')
}

export function isTheme(
  capabilities: readonly AddonCapability[] | undefined | null,
): boolean {
  return hasCapability(capabilities, 'theme')
}
