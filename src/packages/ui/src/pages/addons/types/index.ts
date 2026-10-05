import type { AddonCategory } from '../components/addon-category-sidebar'

export type ConnectionStatus =
  'connected' | 'disconnected' | 'warning' | 'error'

export interface AddonConnection {
  id: string
  name: string
  url?: string
  status: ConnectionStatus
  lastSync?: string
  userName?: string
  userId?: string
}

export interface AddonItem {
  id: string
  name: string
  description: string
  author: string
  version: string
  logo: string
  installed: boolean
  category: AddonCategory
  connections: AddonConnection[]
  documentationUrl?: string
  installerManifestUrl?: string
  /** from marketplace, has update */
  updateAvailable?: boolean
  latestVersion?: string
  latestDownloadUrl?: string
  requiredApiVersion?: string
  changelog?: string[]
  incompatibleUpdate?: boolean
  incompatibleReason?: string
}
