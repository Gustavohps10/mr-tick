import { IOpenAPI } from '@mr-tick/sdk'
import { ReplicationOptions, RxCollection, RxError } from 'rxdb'
import {
  replicateRxCollection,
  RxReplicationState,
} from 'rxdb/plugins/replication'
import { firstValueFrom, Subscription } from 'rxjs'

import { SyncMetadataRxDBDTO } from '@/local-db/schemas/metadata-sync-schema'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'

import { MetadataReplication } from './replication-strategies/MetadataReplication'
import { TasksReplication } from './replication-strategies/TasksReplication'
import { TimeEntriesReplication } from './replication-strategies/TimeEntriesReplication'
import {
  IReplicationStrategy,
  ReplicationCheckpoint,
  ReplicationStatus,
  RxReplicationWriteToMasterRow,
  SyncReplicationDoc,
} from './types'

export interface IReplicationModule {
  start(): Promise<void>
  forceSync(direction?: 'pull' | 'push' | 'both'): Promise<void>
  destroy(): Promise<void>
}

export class ReplicationModule<
  DocType extends SyncReplicationDoc = SyncReplicationDoc,
> implements IReplicationModule {
  private instance?: RxReplicationState<DocType, ReplicationCheckpoint>
  private subs: Subscription[] = []
  private resyncInterval?: NodeJS.Timeout

  constructor(
    private collection: RxCollection<DocType>,
    private strategy: IReplicationStrategy<DocType, ReplicationCheckpoint>,
    private options: {
      identifier: string
      batchSize?: number
      resyncSeconds?: number
      hasPush?: boolean
      initialCheckpoint?: ReplicationCheckpoint
      onStatusChange: (status: Partial<ReplicationStatus>) => void
    },
  ) {}

  async start() {
    if (this.instance) return

    const resolvedBatchSize =
      this.options.batchSize !== undefined ? this.options.batchSize : 25

    const replicationConfig: ReplicationOptions<
      DocType,
      ReplicationCheckpoint
    > = {
      collection: this.collection,
      replicationIdentifier: this.options.identifier,
      live: true,
      retryTime: 30000,
      waitForLeadership: false,
      autoStart: true,
      pull: {
        batchSize: resolvedBatchSize,
        initialCheckpoint: this.options.initialCheckpoint,
        handler: async (
          checkpoint: ReplicationCheckpoint | undefined,
          batch: number,
        ) => {
          this.options.onStatusChange({ isPulling: true, error: null })
          try {
            const result = await this.strategy.pull(checkpoint, batch)
            this.options.onStatusChange({
              isPulling: false,
              lastPulledAt: new Date(),
              lastReplication: new Date(),
              lastPullResult: 'success',
              error: null,
            })
            return result
          } catch (err) {
            this.options.onStatusChange({
              isPulling: false,
              lastPullResult: 'error',
              error: err instanceof Error ? err : new Error(String(err)),
            })
            throw err
          }
        },
      },
    }

    if (this.options.hasPush) {
      replicationConfig.push = {
        batchSize: 20,
        handler: async (rows: RxReplicationWriteToMasterRow<DocType>[]) => {
          this.options.onStatusChange({ isPushing: true, error: null })
          try {
            const result = await this.strategy.push(rows)

            const hasErrors = result.length > 0

            this.options.onStatusChange({
              isPushing: false,
              lastPushedAt: new Date(),
              lastReplication: new Date(),
              lastPushResult: hasErrors ? 'error' : 'success',
              error: hasErrors
                ? new Error('Alguns registros não puderam ser enviados')
                : null,
            })
            return result
          } catch (err) {
            this.options.onStatusChange({
              isPushing: false,
              lastPushResult: 'error',
              error: err instanceof Error ? err : new Error(String(err)),
            })
            throw err
          }
        },
      }
    }

    this.instance = replicateRxCollection(replicationConfig)

    this.subs.push(
      this.instance.active$.subscribe((isActive) => {
        if (!isActive) {
          this.options.onStatusChange({
            isActive,
            isPulling: false,
            isPushing: false,
          })
        } else {
          this.options.onStatusChange({ isActive })
        }
      }),
      this.instance.error$.subscribe((error) =>
        this.options.onStatusChange({
          error,
          isPulling: false,
          isPushing: false,
        }),
      ),
    )

    if (this.options.resyncSeconds && this.options.resyncSeconds > 0) {
      this.resyncInterval = setInterval(
        () => this.instance?.reSync(),
        this.options.resyncSeconds * 1000,
      )
    }
  }

  async forceSync(direction: 'pull' | 'push' | 'both' = 'both'): Promise<void> {
    const activeInstance = this.instance
    if (!activeInstance) return

    const shouldPull = direction === 'pull' || direction === 'both'
    const shouldPush =
      (direction === 'push' || direction === 'both') &&
      (this.options.hasPush ?? false)

    if (!shouldPull && !shouldPush) {
      return
    }

    if (shouldPull) {
      this.options.onStatusChange({ isPulling: true, error: null })
    }
    if (shouldPush) {
      this.options.onStatusChange({ isPushing: true, error: null })
    }

    try {
      if (shouldPull) {
        activeInstance.reSync()
      }
      const inSyncPromise = activeInstance.awaitInSync()
      const errorPromise = firstValueFrom(activeInstance.error$).then(
        (error) => {
          throw error
        },
      )
      await Promise.race([inSyncPromise, errorPromise])
    } catch (err) {
      if (err instanceof Error || err instanceof RxError) {
        this.options.onStatusChange({ error: err })
      }
    } finally {
      this.options.onStatusChange({ isPulling: false, isPushing: false })
    }
  }

  async destroy() {
    if (this.resyncInterval) clearInterval(this.resyncInterval)
    this.subs.forEach((subscription) => subscription.unsubscribe())
    if (this.instance) await this.instance.cancel()
    this.instance = undefined
  }
}

export interface CollectionConfigMetadata {
  name: 'metadata'
  hasPush: false
  strategyFactory: (
    client: IOpenAPI,
    workspaceId: string,
    connectionInstanceId: string,
    dataSourceId: string,
  ) => IReplicationStrategy<SyncMetadataRxDBDTO, ReplicationCheckpoint>
  interval: number
  batch: number
}

export interface CollectionConfigTasks {
  name: 'tasks'
  hasPush: false
  strategyFactory: (
    client: IOpenAPI,
    workspaceId: string,
    connectionInstanceId: string,
    dataSourceId: string,
  ) => IReplicationStrategy<SyncTaskRxDBDTO, ReplicationCheckpoint>
  interval: number
  batch: number
}

export interface CollectionConfigTimeEntries {
  name: 'timeEntries'
  hasPush: true
  strategyFactory: (
    client: IOpenAPI,
    workspaceId: string,
    connectionInstanceId: string,
    dataSourceId: string,
    collection?: RxCollection<SyncTimeEntryRxDBDTO>,
  ) => IReplicationStrategy<SyncTimeEntryRxDBDTO, ReplicationCheckpoint>
  interval: number
  batch: number
}

export type CollectionConfig =
  CollectionConfigMetadata | CollectionConfigTasks | CollectionConfigTimeEntries

export const COLLECTION_CONFIGS: CollectionConfig[] = [
  {
    name: 'metadata',
    hasPush: false,
    strategyFactory: (client, workspaceId, connId, dsId) =>
      new MetadataReplication(client, workspaceId, connId, dsId),
    interval: 3600,
    batch: 10,
  },
  {
    name: 'tasks',
    hasPush: false,
    strategyFactory: (client, workspaceId, connId, dsId) =>
      new TasksReplication(client, workspaceId, connId, dsId),
    interval: 300,
    batch: 30,
  },
  {
    name: 'timeEntries',
    hasPush: true,
    strategyFactory: (client, workspaceId, connId, dsId, collection) =>
      new TimeEntriesReplication(client, workspaceId, connId, dsId, collection),
    interval: 60,
    batch: 30,
  },
]
