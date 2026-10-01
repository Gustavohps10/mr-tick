import { RxJsonSchema } from 'rxdb'

import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'

export interface SyncParticipantsRxDBDTO {
  id: string
  name: string
  role: { id: string }
}

export interface SyncEstimatedTimeRxDBDTO {
  id: string
  name: string
  activities: { id: string; name: string }[]
  hours: number
}

export interface SyncTaskRxDBDTO {
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
  estimatedTimes?: SyncEstimatedTimeRxDBDTO[]
  statusChanges?: {
    fromStatus: string
    toStatus: string
    description?: string
    changedBy: { id: string; name: string }
    changedAt: string
  }[]
  participants?: SyncParticipantsRxDBDTO[]
  conflicted?: boolean
  timeEntryIds: string[]
  timeEntries?: SyncTimeEntryRxDBDTO[]
}

export const tasksSyncSchema: RxJsonSchema<SyncTaskRxDBDTO> = {
  title: 'tasks schema',
  version: 0,
  description: 'Tasks with sync metadata and time entry relation',
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
    title: { type: 'string', maxLength: 250 },
    description: { type: ['string', 'null'] },
    url: { type: ['string', 'null'] },
    projectName: { type: ['string', 'null'] },
    status: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string', maxLength: 250 },
      },
      required: ['id', 'name'],
    },
    tracker: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
      },
      required: ['id'],
    },
    priority: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string', maxLength: 100 },
      },
      required: ['id', 'name'],
    },
    author: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string', maxLength: 100 },
      },
      required: ['name'],
    },
    assignedTo: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string', maxLength: 100 },
      },
      required: ['name'],
    },
    createdAt: { type: 'string', format: 'date-time', maxLength: 30 },
    updatedAt: { type: 'string', format: 'date-time', maxLength: 30 },
    startDate: { type: ['string', 'null'], format: 'date-time', maxLength: 30 },
    dueDate: { type: ['string', 'null'], format: 'date-time', maxLength: 30 },
    doneRatio: { type: ['number', 'null'] },
    spentHours: { type: ['number', 'null'] },
    estimatedTimes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', maxLength: 100 },
          name: { type: 'string', maxLength: 100 },
          hours: { type: 'number' },
          activities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', maxLength: 100 },
                name: { type: 'string', maxLength: 100 },
              },
              required: ['id', 'name'],
            },
          },
        },
        required: ['id', 'name', 'activities', 'hours'],
      },
    },
    statusChanges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fromStatus: { type: 'string', maxLength: 100 },
          toStatus: { type: 'string', maxLength: 100 },
          description: { type: 'string' },
          changedBy: {
            type: 'object',
            properties: {
              id: { type: 'string', maxLength: 100 },
              name: { type: 'string', maxLength: 100 },
            },
            required: ['id', 'name'],
          },
          changedAt: { type: 'string', format: 'date-time', maxLength: 30 },
        },
        required: ['fromStatus', 'toStatus', 'changedBy', 'changedAt'],
      },
    },
    participants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', maxLength: 100 },
          name: { type: 'string', maxLength: 250 },
          role: {
            type: 'object',
            properties: { id: { type: 'string', maxLength: 100 } },
            required: ['id'],
          },
        },
        required: ['id', 'name', 'role'],
      },
    },
    conflicted: { type: 'boolean' },
    timeEntryIds: {
      type: 'array',
      default: [],
      items: { type: 'string', maxLength: 100 },
    },
    timeEntries: { type: 'array', items: { type: 'object' } },
  },
  required: [
    'id',
    'sourceId',
    'connectionInstanceId',
    'dataSourceId',
    'syncStatus',
    'title',
    'status',
    'createdAt',
    'updatedAt',
  ],
  indexes: [
    'connectionInstanceId',
    'dataSourceId',
    'status.name',
    'createdAt',
    'updatedAt',
    'title',
    'syncStatus',
  ],
}
