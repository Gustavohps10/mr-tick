export type AddonCategory =
  'auth' | 'dataSource' | 'watcher' | 'calendar' | 'punch' | 'theme'

export type AddonTier = 'free' | 'plus'

export const VALID_ADDON_CATEGORIES: AddonCategory[] = [
  'auth',
  'dataSource',
  'watcher',
  'calendar',
  'punch',
  'theme',
]

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

export type CapabilityExecutionPolicy =
  | { kind: 'activeWorkspace'; exclusivity?: 'exclusiveSocket' | 'none' }
  | { kind: 'independent' }

export type CapabilityAuthRequirement =
  | { kind: 'none' }
  | {
      kind: 'required'
      connectionProfileId: string
      authorizationRole: string
    }

export interface AddonCapabilityDescriptor {
  readonly capabilityId: string
  readonly kind:
    'dataSource' | 'watcher' | 'calendar' | 'punch' | 'theme' | 'custom'
  readonly contractVersion: string
  readonly required: boolean
  readonly executionPolicy: CapabilityExecutionPolicy
  readonly authRequirement: CapabilityAuthRequirement
  readonly supportedOperations: readonly string[]
  readonly settingsSchemaScope?:
    'workspace' | 'connection' | 'capability' | 'addon'
}

export interface IAddonManifest {
  id: string
  name: string
  version: string
  tier?: AddonTier
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
  sha256?: string
  size?: number
  requiredApiVersion?: string
  releaseDate?: string
  changelog?: string[]
  packages?: AddonPackage[]
  capabilities?: AddonCapabilityDescriptor[]
}
