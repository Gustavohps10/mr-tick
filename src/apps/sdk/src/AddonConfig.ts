import {
  AddonCategory,
  AddonPackage,
  AddonScreenshot,
  AddonTier,
} from './contracts/manifest'

export type AddonConfig = {
  id?: string
  AddonId?: string
  name?: string
  Name?: string
  main?: string
  version?: string
  Version?: string
  tier?: AddonTier
  Tier?: AddonTier
  author?: string
  Author?: string
  shortDescription?: string
  ShortDescription?: string
  description?: string
  Description?: string
  categories?: AddonCategory[]
  Categories?: AddonCategory[]
  category?: string
  Category?: string
  tags?: string[]
  Tags?: string[]
  iconUrl?: string
  IconUrl?: string
  sourceUrl?: string
  SourceUrl?: string
  homepage?: string
  Homepage?: string
  screenshots?: AddonScreenshot[]
  downloadUrl?: string
  DownloadUrl?: string
  sha256?: string
  size?: number
  requiredApiVersion?: string
  RequiredApiVersion?: string
  releaseDate?: string
  ReleaseDate?: string
  changelog?: string[]
  Changelog?: string[]
  packages?: AddonPackage[]
}
