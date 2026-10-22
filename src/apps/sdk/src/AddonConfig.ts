import {
  AddonCapability,
  AddonPackage,
  AddonScreenshot,
  AddonTier,
} from './contracts/manifest'

export type AddonConfig = {
  id?: string
  name?: string
  main?: string
  version?: string
  tier?: AddonTier
  author?: string
  shortDescription?: string
  description?: string
  capabilities?: AddonCapability[]
  tags?: string[]
  iconUrl?: string
  sourceUrl?: string
  homepage?: string
  screenshots?: AddonScreenshot[]
  downloadUrl?: string
  sha256?: string
  size?: number
  requiredApiVersion?: string
  releaseDate?: string
  changelog?: string[]
  packages?: AddonPackage[]
}
