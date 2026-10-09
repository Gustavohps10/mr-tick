import type { LocalTimeEntrySnapshot } from '@mr-tick/application'
import type { RxJsonSchema } from 'rxdb'

export type {
  AddonSourceInfo,
  ConflictData,
  ConflictDataSnapshot,
  RecordSyncStatus,
  TimeEntryRemoteState,
  TimerConfig,
  TimerJournalEntry,
} from '@mr-tick/application'

export type SyncTimeEntryRxDBDTO = LocalTimeEntrySnapshot

export const legacyTimeEntriesSyncSchema: RxJsonSchema<
  Omit<SyncTimeEntryRxDBDTO, 'lastLocalCommandId'>
> = {
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
      enum: [
        'synced',
        'pending_push',
        'creating',
        'ambiguous',
        'conflict',
        'local_only',
        'error',
      ],
      maxLength: 20,
    },
    remoteDeleted: { type: 'boolean' },
    deletionConfirmed: { type: 'boolean' },
    creationAttemptId: { type: ['string', 'null'], maxLength: 100 },
    creationState: { type: ['object', 'null'] },
    confirmationState: { type: ['object', 'null'] },
    remoteState: { type: ['object', 'null'] },
    syncError: { type: ['string', 'null'], maxLength: 500 },
    syncFailure: { type: ['object', 'null'] },
    remoteId: { type: ['string', 'null'], maxLength: 100 },
    lastPulledAt: { type: ['string', 'null'], format: 'date-time' },
    lastPushedAt: { type: ['string', 'null'], format: 'date-time' },
    remoteUpdatedAt: { type: ['string', 'null'], format: 'date-time' },
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
    endDate: { type: ['string', 'null'], format: 'date-time', maxLength: 30 },
    timeSpent: { type: 'number' },
    comments: { type: ['string', 'null'] },
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

export const timeEntriesSyncSchema: RxJsonSchema<SyncTimeEntryRxDBDTO> = {
  ...legacyTimeEntriesSyncSchema,
  version: 1,
  properties: {
    ...legacyTimeEntriesSyncSchema.properties,
    lastLocalCommandId: { type: 'string', maxLength: 200 },
  },
}
