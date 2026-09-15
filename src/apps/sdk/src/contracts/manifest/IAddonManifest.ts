export type AddonCategory =
  'dataSource' | 'watcher' | 'calendar' | 'punch' | 'theme'

export const VALID_ADDON_CATEGORIES: AddonCategory[] = [
  'dataSource',
  'watcher',
  'calendar',
  'punch',
  'theme',
]

export interface AddonScreenshot {
  url: string
  caption?: string
}

export interface AddonPackage {
  version: string
  requiredApiVersion?: string
  releaseDate?: string
  downloadUrl: string
  changelog?: string[]
}

export interface IAddonManifest {
  id: string
  name: string
  version: string
  categories: AddonCategory[]
  author: string
  shortDescription: string
  description: string
  iconUrl?: string
  sourceUrl?: string
  homepage?: string
  tags?: string[]
  screenshots?: AddonScreenshot[]
  downloadUrl?: string
  requiredApiVersion?: string
  releaseDate?: string
  changelog?: string[]
  packages?: AddonPackage[]
}
