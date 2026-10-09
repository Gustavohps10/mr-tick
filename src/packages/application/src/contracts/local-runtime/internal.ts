import type { SyncFailureViewModel } from '@mr-tick/shared/view-models'
export interface TimerJournalEntry {
  id: string
  action: 'start' | 'pause' | 'resume' | 'stop' | 'adjust'
  timestamp: string
  secondsAtMoment: number
  note?: string
  event: 'started' | 'adjusted' | 'paused' | 'resumed' | 'stopped'
  at: string
  secondsAtEvent: number
}

export interface TimerConfig {
  mode: 'countup' | 'countdown'
  manualInitialSeconds?: number
}

export interface AddonSourceInfo {
  pluginId: string
  name?: string
  imageUrl?: string
  rawId?: string
  lastSyncedAt?: string
}

export type RecordSyncStatus =
  | 'synced'
  | 'pending_push'
  | 'creating'
  | 'ambiguous'
  | 'conflict'
  | 'local_only'
  | 'error'

export type ConflictDataSnapshot = TimeEntryRemoteState

export interface ConflictData {
  server?: ConflictDataSnapshot
  local?: ConflictDataSnapshot
}

export interface TimeEntryRemoteState {
  id: string
  task: { id: string }
  activity: { id: string; name?: string }
  user: { id: string; name?: string }
  timeSpent: number
  comments?: string | null
  startDate?: string
  endDate?: string | null
  createdAt: string
  updatedAt: string
}

export interface LocalTimeEntrySnapshot {
  /** Commit evidence retained through replication acknowledgement and canonical reads. */
  lastLocalCommandId?: string
  // ── Identificadores e integridade ────────────
  id: string
  connectionInstanceId: string
  dataSourceId: string
  _deleted: boolean

  // ── Rastreabilidade de sincronização ─────────
  syncStatus: RecordSyncStatus
  /** A tombstone acknowledging remote absence must never be sent as a DELETE. */
  remoteDeleted?: boolean
  /** Durable acknowledgement of an explicitly requested remote deletion. */
  deletionConfirmed?: boolean
  creationAttemptId?: string | null
  creationState?: TimeEntryRemoteState | null
  /** Submitted state of a confirmed write awaiting its canonical read. */
  confirmationState?: TimeEntryRemoteState | null
  remoteState?: TimeEntryRemoteState | null
  syncError?: string | null
  syncFailure?: SyncFailureViewModel | null
  remoteId?: string | null
  lastPulledAt?: string | null
  lastPushedAt?: string | null
  /**
   * `updatedAt` do registro no destino remoto na última vez que ele foi lido ou
   * gravado. É a versão conhecida do servidor: o conflito só existe se o
   * servidor mudou depois dela. Nunca recebe hora do cliente.
   */
  remoteUpdatedAt?: string | null

  // ── Dados de negócio ─────────────────────────
  task: { id: string }
  taskData?: LocalTaskSnapshot
  activity: { id: string; name?: string }
  user: { id: string; name?: string }

  /**
   * Âncora temporal do timer.
   */
  startDate: string

  /**
   * Fim da sessão de tempo. Pode ser nulo se ainda estiver correndo.
   */
  endDate?: string | null

  /**
   * Tempo acumulado em horas.
   */
  timeSpent: number

  comments?: string | null
  createdAt: string
  updatedAt: string
  timeStatus?: 'running' | 'paused' | 'finished' | 'suggestion'
  source?: 'manual' | 'timer' | 'ai_suggestion' | 'addon'
  addonSource?: AddonSourceInfo
  type?: 'increasing' | 'decreasing' | 'manual'
  conflictData?: ConflictData

  // ── Campos locais (nunca sincronizados) ───────
  journal?: TimerJournalEntry[]
  timerConfig?: TimerConfig
}

export interface LocalTaskParticipant {
  id: string
  name: string
  role: { id: string }
}

export interface LocalTaskEstimate {
  id: string
  name: string
  activities: { id: string; name: string }[]
  hours: number
}

export interface LocalTaskSnapshot {
  // ── Identificadores e integridade ────────────
  id: string
  sourceId: string
  connectionInstanceId: string
  dataSourceId: string
  _deleted: boolean

  // ── Rastreabilidade de sincronização ─────────
  syncStatus: 'synced' | 'pending_push' | 'pulling' | 'conflict' | 'local_only'
  lastPulledAt: string | null
  lastPushedAt: string | null
  lastReconciledAt: string | null

  // ── Dados de negócio ─────────────────────────
  title: string
  description?: string | null
  url?: string | null
  projectName?: string | null
  status: { id: string; name: string }
  tracker?: { id: string } | null
  priority?: { id: string; name: string } | null
  author?: { id?: string; name: string } | null
  assignedTo?: { id?: string; name: string } | null
  createdAt: string
  updatedAt: string
  startDate?: string | null
  dueDate?: string | null
  doneRatio?: number | null
  spentHours?: number | null
  estimatedTimes?: LocalTaskEstimate[]
  statusChanges?: {
    fromStatus: string
    toStatus: string
    description?: string
    changedBy: { id: string; name: string }
    changedAt: string
  }[]
  participants?: LocalTaskParticipant[]
  conflicted?: boolean
  timeEntryIds: string[]
  timeEntries?: LocalTimeEntrySnapshot[]
}

export interface LocalPersistenceIdentity {
  commandId: string
  workspaceId: string
  entryId: string
}
export type LocalPersistenceCommand =
  | (LocalPersistenceIdentity & {
      action: 'insertRecord'
      record: LocalTimeEntrySnapshot
    })
  | (LocalPersistenceIdentity & {
      action: 'editRecord'
      changes: Partial<LocalTimeEntrySnapshot>
    })
  | (LocalPersistenceIdentity & {
      action: 'deleteRecord' | 'authorizeRecreation'
    })
  | (LocalPersistenceIdentity & {
      action: 'resolveConflict'
      expectedServer: TimeEntryRemoteState
      selection: LocalConflictSelection
    })
export interface LocalConflictSelection {
  periodAndDuration: 'local' | 'remote'
  comments: 'local' | 'remote'
  task: 'local' | 'remote'
  activity: 'local' | 'remote'
}
export type LocalPersistenceResponse =
  | { ok: true; record: LocalTimeEntrySnapshot | null; replayed?: boolean }
  | { ok: false; error: { messageKey: string; statusCode: number } }
export interface ILocalPersistenceAPI {
  request(command: LocalPersistenceCommand): Promise<LocalPersistenceResponse>
}
export interface LocalSyncRequest {
  action:
    | 'connect'
    | 'disconnect'
    | 'forceSync'
    | 'reconcile'
    | 'drop'
    | 'reset'
    | 'status'
  workspaceId: string
  connectionInstanceId?: string
  dataSourceId?: string
  direction?: 'pull' | 'push' | 'both'
  windowDays?: number
}
export type LocalSyncResponse =
  | { ok: true; statuses?: LocalRuntimeSyncStatus[] }
  | { ok: false; error: { messageKey: string; statusCode: number } }
export interface ILocalSyncAPI {
  request(request: LocalSyncRequest): Promise<LocalSyncResponse>
}
export interface LocalRuntimeSyncStatus {
  key: string
  isActive: boolean
  isPulling: boolean
  isPushing: boolean
  isReconciling: boolean
  lastPulledAt: string | null
  lastPushedAt: string | null
  lastReconciledAt: string | null
  lastReplication: string | null
  lastPushResult: 'success' | 'error' | null
  lastPullResult: 'success' | 'error' | null
  error: string | null
  failures?: SyncFailureViewModel[]
}
