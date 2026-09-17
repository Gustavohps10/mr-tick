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
  'synced' | 'pending_push' | 'pulling' | 'conflict' | 'local_only'

export interface SyncTimeEntryRxDBDTO {
  // ── Identificadores e integridade ────────────
  id: string
  sourceId: string
  connectionInstanceId: string
  dataSourceId: string
  _deleted: boolean

  // ── Rastreabilidade de sincronização ─────────
  syncStatus: RecordSyncStatus
  lastPulledAt: string | null
  lastPushedAt: string | null
  lastReconciledAt: string | null

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
   * Preenchido no stop pelo renderer.
   */
  endDate?: string

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
  conflicted?: boolean

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
  primaryKey: {
    key: 'id',
    fields: ['connectionInstanceId', 'sourceId'],
    separator: '::',
  },
  properties: {
    id: { type: 'string', maxLength: 200 },
    sourceId: { type: 'string', maxLength: 100 },
    connectionInstanceId: { type: 'string', maxLength: 100 },
    dataSourceId: { type: 'string', maxLength: 100 },
    _deleted: { type: 'boolean' },
    syncStatus: {
      type: 'string',
      enum: ['synced', 'pending_push', 'pulling', 'conflict', 'local_only'],
      maxLength: 20,
    },
    lastPulledAt: { type: ['string', 'null'], format: 'date-time' },
    lastPushedAt: { type: ['string', 'null'], format: 'date-time' },
    lastReconciledAt: { type: ['string', 'null'], format: 'date-time' },
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
    conflicted: { type: 'boolean' },
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
    'sourceId',
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
