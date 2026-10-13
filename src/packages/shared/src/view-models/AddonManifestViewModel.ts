export type AddonTierViewModel = 'free' | 'plus'

export interface AddonScreenshotViewModel {
  url: string
  caption?: string
}

export interface AddonPackageViewModel {
  version: string
  requiredApiVersion?: string
  releaseDate?: string
  downloadUrl: string
  sha256?: string
  size?: number
  changelog?: string[]
}

export interface AddonManifestViewModel {
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
  tier?: AddonTierViewModel
  sha256?: string
  size?: number
  installerManifestUrl?: string
  sourceUrl?: string
  homepage?: string
  tags?: string[]
  category?: string
  categories?: string[]
  screenshots?: AddonScreenshotViewModel[]
  downloadUrl?: string
  requiredApiVersion?: string
  releaseDate?: string
  changelog?: string[]
  packages?: AddonPackageViewModel[]
  updateAvailable?: boolean
  latestVersion?: string
  latestDownloadUrl?: string
  latestSha256?: string
  latestSize?: number
  incompatibleUpdate?: boolean
  incompatibleReason?: string
}
