import { AddonTier } from '@mr-tick/domain'

export interface AddonScreenshotDTO {
  url: string
  caption?: string
}

export interface AddonPackageDTO {
  version: string
  requiredApiVersion?: string
  releaseDate?: string
  downloadUrl: string
  sha256?: string
  size?: number
  changelog?: string[]
}

export interface AddonManifestDTO {
  id: string
  version: string
  name: string
  creator: string
  description: string
  path: string
  logo: string
  downloads: number
  stars: number
  installed: boolean
  tier?: AddonTier
  sha256?: string
  size?: number
  installerManifestUrl?: string
  sourceUrl?: string
  homepage?: string
  tags?: string[]
  category?: string
  categories?: string[]
  screenshots?: AddonScreenshotDTO[]
  downloadUrl?: string
  requiredApiVersion?: string
  releaseDate?: string
  changelog?: string[]
  packages?: AddonPackageDTO[]
  updateAvailable?: boolean
  latestVersion?: string
  latestDownloadUrl?: string
  latestSha256?: string
  latestSize?: number
  incompatibleUpdate?: boolean
  incompatibleReason?: string
}
