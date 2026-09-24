import { RxCollection, RxDatabase, RxError } from 'rxdb'

import { ConnectionInstanceId } from '@/contexts/DataSourceConnectionsContext'
import { AutomationRxDBDTO } from '@/local-db/schemas/automations-schema'
import { KanbanColumnRxDBDTO } from '@/local-db/schemas/kanban-column-schema'
import { TaskKanbanColumnRxDBDTO } from '@/local-db/schemas/kanban-task-columns-schema'
import { SyncMetadataRxDBDTO } from '@/local-db/schemas/metadata-sync-schema'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'

export type ReplicationCheckpoint = { updatedAt: string; id: string }

export type SyncReplicationDoc =
  SyncMetadataRxDBDTO | SyncTaskRxDBDTO | SyncTimeEntryRxDBDTO

export type AppCollections = {
  timeEntries: RxCollection<SyncTimeEntryRxDBDTO>
  tasks: RxCollection<SyncTaskRxDBDTO>
  metadata: RxCollection<SyncMetadataRxDBDTO>
  kanbanColumns: RxCollection<KanbanColumnRxDBDTO>
  kanbanTaskColumns: RxCollection<TaskKanbanColumnRxDBDTO>
  automations: RxCollection<AutomationRxDBDTO>
}

export type AppDatabase = RxDatabase<AppCollections>

export interface ReplicationStatus {
  isActive: boolean
  isPulling: boolean
  isPushing: boolean
  isReconciling: boolean
  lastPulledAt: Date | null
  lastPushedAt: Date | null
  lastReconciledAt: Date | null
  lastReplication: Date | null
  lastPushResult: 'success' | 'error' | null
  lastPullResult: 'success' | 'error' | null
  error: Error | RxError | null
}

export interface RxReplicationWriteToMasterRow<RxDocType> {
  assumedMasterState?: RxDocType
  newDocumentState: RxDocType
}

export interface IReplicationStrategy<T, C = ReplicationCheckpoint> {
  pull: (
    checkpoint: C | undefined,
    batchSize: number,
  ) => Promise<{ documents: T[]; checkpoint: C }>
  push: (rows: RxReplicationWriteToMasterRow<T>[]) => Promise<T[]>
}

export interface SyncState {
  db: AppDatabase | null
  statuses: Record<string, ReplicationStatus>
  isInitialized: boolean
}

export type SyncStore = SyncState & {
  init: () => Promise<void>
  destroy: () => Promise<void>
  drop: () => Promise<void>
  resetDatabase: () => Promise<void>
  forceSync: (
    connectionInstanceId?: string,
    direction?: 'pull' | 'push' | 'both',
  ) => Promise<void>
  reconcile: (
    connectionInstanceId?: string,
    windowDays?: number,
  ) => Promise<void>
  connectDataSource: (params: {
    connectionInstanceId: ConnectionInstanceId
    dataSourceId: string
  }) => Promise<void>
  disconnectDataSource: (
    connectionInstanceId: ConnectionInstanceId,
  ) => Promise<void>
}

export interface DataSourceRef {
  id: string
  dataSourceId: string
}
