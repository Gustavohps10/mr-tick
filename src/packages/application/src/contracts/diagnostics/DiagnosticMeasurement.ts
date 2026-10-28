export type DiagnosticMeasurementPrecision = 'exact' | 'estimated'

export type DiagnosticStorageCoverage = 'file' | 'origin' | 'workspace'

export type DiagnosticStorageRole = 'metadata' | 'operational' | 'browser'

export type DiagnosticStorageTechnology = string

export type DiagnosticStorageAvailability =
  | {
      status: 'available'
      bytes: number
      precision: DiagnosticMeasurementPrecision
      coverage: DiagnosticStorageCoverage
      unit: 'bytes'
      collectedAt: string
      overlappingTargets?: readonly string[]
    }
  | {
      status: 'unavailable' | 'not-supported'
      reason: string
      collectedAt: string
    }

export interface DiagnosticStorageItem {
  id: string
  name: string
  role: DiagnosticStorageRole
  technology: DiagnosticStorageTechnology
  location?: string
  measurement: DiagnosticStorageAvailability
}
