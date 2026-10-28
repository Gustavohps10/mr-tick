import type { CoreRuntimeState } from '../core/CoreContext'
import type { LocalRuntimeSyncStatus } from '../local-runtime'
import type { DiagnosticCheckResult } from './DiagnosticCheck'
import type { DiagnosticEvent } from './DiagnosticEvent'
import type { DiagnosticStorageItem } from './DiagnosticMeasurement'

export type DiagnosticStartupFailureKind =
  'explicit' | 'deadline_exceeded' | 'process_gone' | 'navigation'

export interface DiagnosticStartupFailure {
  kind: DiagnosticStartupFailureKind
  stage: string
  messageKey: string
  statusCode?: number
  timestamp: string
}

export interface DiagnosticDispatcherState {
  state: CoreRuntimeState
  generation: string
  startupStage: string
  lastStartupFailure?: DiagnosticStartupFailure
  pendingRequestsByChannel: Record<string, number>
}

export type DiagnosticWorkspaceOperationalStatus =
  'ready' | 'opening' | 'maintenance' | 'unavailable' | 'closed'

export type DiagnosticCountAvailability =
  | { status: 'available'; count: number; collectedAt: string }
  | {
      status: 'not-supported' | 'unavailable' | 'error'
      reason: string
      collectedAt: string
    }

export type DiagnosticReplicationAvailability =
  | {
      status: 'available'
      items: LocalRuntimeSyncStatus[]
      collectedAt: string
    }
  | {
      status: 'disabled' | 'not-supported' | 'unavailable' | 'error'
      reason: string
      collectedAt: string
    }

export interface DiagnosticOperationalWorkspaceStatus {
  workspaceId: string
  status: DiagnosticWorkspaceOperationalStatus
  hasDb: boolean
  pendingWrites?: DiagnosticCountAvailability
  tombstones?: DiagnosticCountAvailability
  receipts?: DiagnosticCountAvailability
  replication?: DiagnosticReplicationAvailability
}

export interface DiagnosticSnapshot {
  formatVersion: '1.0'
  sessionId: string
  revision: number
  emittedAt: string
  observedGeneration: string
  dispatcher: DiagnosticDispatcherState
  checks: DiagnosticCheckResult[]
  storages: DiagnosticStorageItem[]
  workspaces: DiagnosticOperationalWorkspaceStatus[]
  recentEvents: DiagnosticEvent[]
  discardedEventsCount: number
}
