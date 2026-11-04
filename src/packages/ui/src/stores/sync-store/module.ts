import { RxCollection, RxError } from 'rxdb'
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
  ReplicationBridge,
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
  private pullInstance?: RxReplicationState<DocType, ReplicationCheckpoint>
  private pushInstance?: RxReplicationState<DocType, ReplicationCheckpoint>
  private subs: Subscription[] = []
  private resyncInterval?: NodeJS.Timeout

  constructor(
    private collection: RxCollection<DocType>,
    private strategy: IReplicationStrategy<DocType, ReplicationCheckpoint>,
    private options: {
      identifier: string
      batchSize?: number
      resyncSeconds?: number
      retryTime?: number
      hasPush?: boolean
      initialCheckpoint?: ReplicationCheckpoint
      onStatusChange: (status: Partial<ReplicationStatus>) => void
    },
  ) {}

  private async documentError(): Promise<Error | null> {
    if (!this.strategy.getDocumentError) return null
    return this.strategy.getDocumentError()
  }

  async start() {
    if (this.pullInstance || this.pushInstance) return

    const resolvedBatchSize =
      this.options.batchSize !== undefined ? this.options.batchSize : 25

    const retryTimeout =
      this.options.retryTime !== undefined ? this.options.retryTime : 30000

    this.pullInstance = replicateRxCollection<DocType, ReplicationCheckpoint>({
      collection: this.collection,
      replicationIdentifier: `${this.options.identifier}-pull`,
      live: true,
      retryTime: retryTimeout,
      waitForLeadership: false,
      autoStart: true,
      pull: {
        batchSize: resolvedBatchSize,
        initialCheckpoint: this.options.initialCheckpoint,
        handler: async (
          checkpoint: ReplicationCheckpoint | undefined,
          batch: number,
        ) => {
          this.options.onStatusChange({
            isPulling: true,
            error: await this.documentError(),
          })
          try {
            const result = await this.strategy.pull(checkpoint, batch)
            this.options.onStatusChange({
              isPulling: false,
              lastPulledAt: new Date(),
              lastReplication: new Date(),
              lastPullResult: 'success',
              error: await this.documentError(),
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
    })

    if (this.options.hasPush) {
      this.pushInstance = replicateRxCollection<DocType, ReplicationCheckpoint>(
        {
          collection: this.collection,
          replicationIdentifier: `${this.options.identifier}-push`,
          live: true,
          retryTime: retryTimeout,
          waitForLeadership: false,
          autoStart: true,
          push: {
            batchSize: 20,
            handler: async (rows: RxReplicationWriteToMasterRow<DocType>[]) => {
              this.options.onStatusChange({
                isPushing: true,
                error: await this.documentError(),
              })
              try {
                const result = await this.strategy.push(rows)

                const documentError = await this.documentError()
                const hasErrors = documentError !== null || result.length > 0

                this.options.onStatusChange({
                  isPushing: false,
                  lastPushedAt: new Date(),
                  lastReplication: new Date(),
                  lastPushResult: hasErrors ? 'error' : 'success',
                  error: documentError
                    ? documentError
                    : hasErrors
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
          },
        },
      )
    }

    const instances = [this.pullInstance, this.pushInstance].filter(
      (inst): inst is RxReplicationState<DocType, ReplicationCheckpoint> =>
        inst !== undefined,
    )

    for (const inst of instances) {
      this.subs.push(
        inst.active$.subscribe((isActive) => {
          if (!isActive) {
            this.options.onStatusChange({
              isActive: false,
              isPulling: false,
              isPushing: false,
            })
            return
          }
          this.options.onStatusChange({ isActive: true })
        }),
        inst.error$.subscribe((error) =>
          this.options.onStatusChange({
            error,
            isPulling: false,
            isPushing: false,
          }),
        ),
      )
    }

    if (this.options.resyncSeconds && this.options.resyncSeconds > 0) {
      this.resyncInterval = setInterval(
        () => this.pullInstance?.reSync(),
        this.options.resyncSeconds * 1000,
      )
    }
  }

  async forceSync(direction: 'pull' | 'push' | 'both' = 'both'): Promise<void> {
    const shouldPull = direction === 'pull' || direction === 'both'
    const shouldPush =
      (direction === 'push' || direction === 'both') &&
      (this.options.hasPush ? true : false)

    if (!shouldPull && !shouldPush) {
      return
    }

    const promises: Promise<void>[] = []

    if (shouldPull && this.pullInstance) {
      this.options.onStatusChange({
        isPulling: true,
        error: await this.documentError(),
      })
      this.pullInstance.reSync()
      const inSyncPromise = this.pullInstance.awaitInSync()
      const errorPromise = firstValueFrom(this.pullInstance.error$).then(
        (error) => {
          throw error
        },
      )
      promises.push(
        Promise.race([inSyncPromise, errorPromise])
          .then(() => undefined)
          .finally(() => {
            this.options.onStatusChange({ isPulling: false })
          }),
      )
    }

    if (shouldPush && this.pushInstance) {
      this.options.onStatusChange({
        isPushing: true,
        error: await this.documentError(),
      })
      this.pushInstance.reSync()
      const inSyncPromise = this.pushInstance.awaitInSync()
      const errorPromise = firstValueFrom(this.pushInstance.error$).then(
        (error) => {
          throw error
        },
      )
      promises.push(
        Promise.race([inSyncPromise, errorPromise])
          .then(() => undefined)
          .finally(() => {
            this.options.onStatusChange({ isPushing: false })
          }),
      )
    }

    try {
      await Promise.all(promises)
    } catch (err) {
      if (err instanceof Error || err instanceof RxError) {
        this.options.onStatusChange({ error: err })
      }
    }
  }

  async destroy() {
    if (this.resyncInterval) clearInterval(this.resyncInterval)
    this.subs.forEach((subscription) => subscription.unsubscribe())
    if (this.pullInstance) await this.pullInstance.cancel()
    if (this.pushInstance) await this.pushInstance.cancel()
    this.pullInstance = undefined
    this.pushInstance = undefined
  }
}

export interface CollectionConfigMetadata {
  name: 'metadata'
  hasPush: false
  strategyFactory: (
    client: ReplicationBridge,
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
    client: ReplicationBridge,
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
    client: ReplicationBridge,
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
