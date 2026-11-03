export type AddonLoadFailureStage =
  | 'authorize'
  | 'apiVersion'
  | 'entry'
  | 'manifest'
  | 'contract'
  | 'import'
  | 'instantiate'
  | 'activate'

export type AddonLoadFailureReason =
  | 'AUTHORIZATION_FAILED'
  | 'API_VERSION_INCOMPATIBLE'
  | 'ENTRY_NOT_FOUND'
  | 'MANIFEST_INVALID'
  | 'CONTRACT_VIOLATION'
  | 'IMPORT_FAILED'
  | 'INVALID_DEFAULT_EXPORT'
  | 'INSTANTIATION_FAILED'
  | 'INITIALIZATION_FAILED'
  | 'UNEXPECTED_ERROR'

export interface AddonLoadFailureViewModel {
  addonId: string
  addonName?: string
  iconUrl?: string
  folderPath: string
  entryPath?: string
  stage: AddonLoadFailureStage
  reason: AddonLoadFailureReason
  technicalMessage: string
  timestamp: number
}

export interface AddonLoadFailuresSnapshot {
  revision: number
  failures: AddonLoadFailureViewModel[]
}
