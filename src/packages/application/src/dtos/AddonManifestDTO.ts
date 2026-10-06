export interface AddonScreenshotDTO {
  url: string
  caption?: string
}

export interface AddonPackageDTO {
  version: string
  requiredApiVersion?: string
  releaseDate?: string
  downloadUrl: string
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
  incompatibleUpdate?: boolean
  incompatibleReason?: string
}
