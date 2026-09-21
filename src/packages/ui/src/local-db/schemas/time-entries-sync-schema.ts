import { RxJsonSchema } from 'rxdb'

import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'

// ─────────────────────────────────────────────
// Tipos auxiliares de negócio e rastreabilidade
// ─────────────────────────────────────────────

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
  'synced' | 'pending_push' | 'conflict' | 'local_only' | 'error'

export interface ConflictDataSnapshot {
  id?: string
  startDate?: string
  endDate?: string | null
  timeSpent?: number
  comments?: string
  updatedAt?: string
  task?: { id: string }
  activity?: { id: string; name?: string }
}

export interface ConflictData {
  server?: ConflictDataSnapshot
  local?: ConflictDataSnapshot
}

export interface SyncTimeEntryRxDBDTO {
  // ── Identificadores e integridade ────────────
  id: string
  connectionInstanceId: string
  dataSourceId: string
  _deleted: boolean

  // ── Rastreabilidade de sincronização ─────────
  syncStatus: RecordSyncStatus
  syncError?: string | null
  remoteId?: string | null
  lastPulledAt?: string | null
  lastPushedAt?: string | null

  // ── Dados de negócio ─────────────────────────
  task: { id: string }
  taskData?: SyncTaskRxDBDTO
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

  comments?: string
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

// ─────────────────────────────────────────────
// Schema RxDB
// ─────────────────────────────────────────────

export const timeEntriesSyncSchema: RxJsonSchema<SyncTimeEntryRxDBDTO> = {
  title: 'timeEntries schema',
  version: 0,
  description:
    'Time entries with sync metadata, task relation, local journal and timer config',
  type: 'object',
  primaryKey: 'id',
  properties: {
    id: { type: 'string', maxLength: 100 },
    connectionInstanceId: { type: 'string', maxLength: 100 },
    dataSourceId: { type: 'string', maxLength: 100 },
    _deleted: { type: 'boolean' },
    syncStatus: {
      type: 'string',
      enum: ['synced', 'pending_push', 'conflict', 'local_only', 'error'],
      maxLength: 20,
    },
    syncError: { type: ['string', 'null'], maxLength: 500 },
    remoteId: { type: ['string', 'null'], maxLength: 100 },
    lastPulledAt: { type: ['string', 'null'], format: 'date-time' },
    lastPushedAt: { type: ['string', 'null'], format: 'date-time' },
    task: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
      },
      required: ['id'],
    },
    taskData: { type: 'object' },
    activity: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string', maxLength: 250 },
      },
      required: ['id'],
    },
    user: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string', maxLength: 250 },
      },
      required: ['id'],
    },
    startDate: { type: 'string', format: 'date-time', maxLength: 30 },
    endDate: { type: 'string', format: 'date-time', maxLength: 30 },
    timeSpent: { type: 'number' },
    comments: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time', maxLength: 30 },
    updatedAt: { type: 'string', format: 'date-time', maxLength: 30 },
    timeStatus: {
      type: 'string',
      enum: ['running', 'paused', 'finished', 'suggestion'],
      maxLength: 20,
    },
    source: {
      type: 'string',
      enum: ['manual', 'timer', 'ai_suggestion', 'addon'],
      maxLength: 20,
    },
    addonSource: {
      type: 'object',
      properties: {
        pluginId: { type: 'string', maxLength: 100 },
        name: { type: 'string', maxLength: 100 },
        imageUrl: { type: 'string', maxLength: 500 },
        rawId: { type: 'string', maxLength: 100 },
        lastSyncedAt: { type: 'string', format: 'date-time', maxLength: 30 },
      },
      required: ['pluginId'],
    },
    type: {
      type: 'string',
      enum: ['increasing', 'decreasing', 'manual'],
      maxLength: 20,
    },
    conflictData: {
      type: 'object',
      properties: {
        server: { type: 'object' },
        local: { type: 'object' },
      },
    },
    journal: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', maxLength: 100 },
          action: {
            type: 'string',
            enum: ['start', 'pause', 'resume', 'stop', 'adjust'],
          },
          timestamp: { type: 'string', format: 'date-time', maxLength: 30 },
          secondsAtMoment: { type: 'number' },
          note: { type: 'string' },
          event: {
            type: 'string',
            enum: ['started', 'adjusted', 'paused', 'resumed', 'stopped'],
            maxLength: 20,
          },
          at: { type: 'string', format: 'date-time', maxLength: 30 },
          secondsAtEvent: { type: 'number' },
        },
        required: [
          'id',
          'action',
          'timestamp',
          'secondsAtMoment',
          'event',
          'at',
          'secondsAtEvent',
        ],
      },
    },
    timerConfig: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['countup', 'countdown'],
        },
        manualInitialSeconds: { type: 'number' },
      },
      required: ['mode'],
    },
  },
  required: [
    'id',
    'connectionInstanceId',
    'dataSourceId',
    'syncStatus',
    'task',
    'activity',
    'user',
    'timeSpent',
    'startDate',
    'createdAt',
    'updatedAt',
  ],
  indexes: ['connectionInstanceId', 'updatedAt', 'startDate', 'syncStatus'],
}
