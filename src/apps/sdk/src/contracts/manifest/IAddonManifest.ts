import type { AddonCapability } from '@mr-tick/shared/helpers'
export {
  type AddonCapability,
  hasCapability,
  isAddonCapability,
  isDataSource,
  isTheme,
  isWatcher,
  VALID_ADDON_CAPABILITIES,
} from '@mr-tick/shared/helpers'

export type AddonTier = 'free' | 'plus'

export const VALID_ADDON_TIERS: AddonTier[] = ['free', 'plus']

export interface AddonScreenshot {
  url: string
  caption?: string
}

export interface AddonPackage {
  version: string
  requiredApiVersion?: string
  releaseDate?: string
  downloadUrl: string
  sha256?: string
  size?: number
  changelog?: string[]
}

export interface IAddonManifest {
  id: string
  name: string
  version: string
  tier?: AddonTier
  capabilities: readonly AddonCapability[]
  author: string
  shortDescription: string
  description: string
  iconUrl?: string
  sourceUrl?: string
  homepage?: string
  tags?: string[]
  screenshots?: AddonScreenshot[]
  downloadUrl?: string
  sha256?: string
  size?: number
  requiredApiVersion?: string
  releaseDate?: string
  changelog?: string[]
  packages?: AddonPackage[]
}
