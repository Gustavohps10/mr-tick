import { RxJsonSchema } from 'rxdb'

export interface SyncMetadataItem {
  id: string
  name: string
  icon: string
  colors: {
    badge: string
    background: string
    text: string
    border?: string
  }
}

export interface SyncMetadataRxDBDTO {
  id: string
  sourceId: string
  connectionInstanceId: string
  dataSourceId: string
  _deleted: boolean
  syncStatus: 'synced' | 'pending_push' | 'pulling' | 'conflict' | 'local_only'
  lastPulledAt: string | null
  taskStatuses: SyncMetadataItem[]
  taskPriorities: SyncMetadataItem[]
  activities: SyncMetadataItem[]
  trackStatuses: SyncMetadataItem[]
  participantRoles: SyncMetadataItem[]
  estimationTypes: SyncMetadataItem[]
  conflicted?: boolean
}

export const metadataSyncSchema: RxJsonSchema<SyncMetadataRxDBDTO> = {
  title: 'metadata schema',
  version: 0,
  description: 'Stores metadata from external sources like Redmine or Jira',
  primaryKey: {
    key: 'id',
    fields: ['connectionInstanceId', 'sourceId'],
    separator: '::',
  },
  type: 'object',
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
    taskStatuses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          icon: { type: 'string' },
          colors: {
            type: 'object',
            properties: {
              badge: { type: 'string' },
              background: { type: 'string' },
              text: { type: 'string' },
              border: { type: 'string' },
            },
            required: ['badge', 'background', 'text'],
          },
        },
        required: ['id', 'name', 'icon', 'colors'],
      },
    },
    taskPriorities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          icon: { type: 'string' },
          colors: {
            type: 'object',
            properties: {
              badge: { type: 'string' },
              background: { type: 'string' },
              text: { type: 'string' },
              border: { type: 'string' },
            },
            required: ['badge', 'background', 'text'],
          },
        },
        required: ['id', 'name', 'icon', 'colors'],
      },
    },
    activities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          icon: { type: 'string' },
          colors: {
            type: 'object',
            properties: {
              badge: { type: 'string' },
              background: { type: 'string' },
              text: { type: 'string' },
              border: { type: 'string' },
            },
            required: ['badge', 'background', 'text'],
          },
        },
        required: ['id', 'name', 'icon', 'colors'],
      },
    },
    trackStatuses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          icon: { type: 'string' },
          colors: {
            type: 'object',
            properties: {
              badge: { type: 'string' },
              background: { type: 'string' },
              text: { type: 'string' },
              border: { type: 'string' },
            },
            required: ['badge', 'background', 'text'],
          },
        },
        required: ['id', 'name', 'icon', 'colors'],
      },
    },
    participantRoles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          icon: { type: 'string' },
          colors: {
            type: 'object',
            properties: {
              badge: { type: 'string' },
              background: { type: 'string' },
              text: { type: 'string' },
              border: { type: 'string' },
            },
            required: ['badge', 'background', 'text'],
          },
        },
        required: ['id', 'name', 'icon', 'colors'],
      },
    },
    estimationTypes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          icon: { type: 'string' },
          colors: {
            type: 'object',
            properties: {
              badge: { type: 'string' },
              background: { type: 'string' },
              text: { type: 'string' },
              border: { type: 'string' },
            },
            required: ['badge', 'background', 'text'],
          },
        },
        required: ['id', 'name', 'icon', 'colors'],
      },
    },
    conflicted: { type: 'boolean' },
  },
  required: [
    'id',
    'sourceId',
    'connectionInstanceId',
    'dataSourceId',
    'syncStatus',
    'taskStatuses',
    'taskPriorities',
    'activities',
    'trackStatuses',
    'participantRoles',
    'estimationTypes',
  ],
  indexes: ['dataSourceId', 'syncStatus'],
}
