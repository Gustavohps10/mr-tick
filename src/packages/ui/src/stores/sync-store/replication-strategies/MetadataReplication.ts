import { IHostBridge } from '@mr-tick/application'

import { SyncMetadataRxDBDTO } from '@/local-db/schemas/metadata-sync-schema'

import { ReplicationError } from '../ReplicationError'
import { IReplicationStrategy, ReplicationCheckpoint } from '../types'

export class MetadataReplication implements IReplicationStrategy<
  SyncMetadataRxDBDTO,
  ReplicationCheckpoint
> {
  constructor(
    private client: Pick<IHostBridge, 'metadata'>,
    private workspaceId: string,
    private connectionInstanceId: string,
    private pluginId: string,
  ) {}

  async pull(
    checkpoint: ReplicationCheckpoint | undefined,
    batchSize: number,
  ): Promise<{
    documents: SyncMetadataRxDBDTO[]
    checkpoint: ReplicationCheckpoint
  }> {
    const res = await this.client.metadata.pull({
      body: {
        workspaceId: this.workspaceId,
        connectionInstanceId: this.connectionInstanceId,
        batch: batchSize,
        checkpoint: {
          id: checkpoint ? checkpoint.id : '',
          updatedAt: checkpoint ? new Date(checkpoint.updatedAt) : new Date(0),
        },
      },
    })

    if (!res.isSuccess)
      return Promise.reject(
        new ReplicationError(res.error ? res.error : 'SYNC_PULL_FAILED', [
          {
            statusCode: res.statusCode,
            messageKey: res.error ? res.error : 'SYNC_PULL_FAILED',
          },
        ]),
      )

    if (!res.data)
      return {
        documents: [],
        checkpoint: checkpoint ?? {
          updatedAt: new Date(0).toISOString(),
          id: '',
        },
      }

    const now = new Date().toISOString()
    const doc: SyncMetadataRxDBDTO = {
      id: `${this.connectionInstanceId}::metadata`,
      sourceId: 'metadata',
      dataSourceId: this.pluginId,
      connectionInstanceId: this.connectionInstanceId,
      _deleted: false,
      syncStatus: 'synced',
      lastPulledAt: now,
      participantRoles: res.data.participantRoles ?? [],
      estimationTypes: res.data.estimationTypes ?? [],
      trackStatuses: res.data.trackStatuses ?? [],
      taskStatuses: res.data.taskStatuses ?? [],
      taskPriorities: res.data.taskPriorities ?? [],
      activities: res.data.activities ?? [],
    }

    return {
      documents: [doc],
      checkpoint: {
        updatedAt: now,
        id: `metadata_sync_${this.connectionInstanceId}`,
      },
    }
  }

  async push(): Promise<SyncMetadataRxDBDTO[]> {
    return []
  }
}
