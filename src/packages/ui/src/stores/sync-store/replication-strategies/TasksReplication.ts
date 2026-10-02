import { IHostBridge } from '@mr-tick/application'
import { TaskViewModel } from '@mr-tick/shared/view-models'

import { mapTaskViewModelToRxDB } from '@/lib/tasks-enrichment'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'

import { IReplicationStrategy, ReplicationCheckpoint } from '../types'

const dateToISO = (
  value: Date | string | null | undefined,
): string | undefined => {
  if (!value) {
    return undefined
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  const parsedDate = new Date(value)
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString()
  }
  return String(value)
}

export class TasksReplication implements IReplicationStrategy<
  SyncTaskRxDBDTO,
  ReplicationCheckpoint
> {
  constructor(
    private client: IHostBridge,
    private workspaceId: string,
    private connectionInstanceId: string,
    private pluginId: string,
  ) {}

  async pull(
    checkpoint: ReplicationCheckpoint | undefined,
    batchSize: number,
  ): Promise<{
    documents: SyncTaskRxDBDTO[]
    checkpoint: ReplicationCheckpoint
  }> {
    const res = await this.client.tasks.pull({
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

    if (!res.isSuccess) {
      const err = new Error(res.error ? String(res.error) : 'SYNC_PULL_FAILED')
      Object.assign(err, { statusCode: res.statusCode, status: res.statusCode })
      throw err
    }

    const data: TaskViewModel[] = res.data ?? []
    if (data.length === 0) {
      if (checkpoint) {
        return { documents: [], checkpoint }
      }
      return {
        documents: [],
        checkpoint: {
          updatedAt: new Date(0).toISOString(),
          id: '',
        },
      }
    }
    const last = data[data.length - 1]
    const nowIso = new Date().toISOString()

    const docs: SyncTaskRxDBDTO[] = data.map((item: TaskViewModel) =>
      mapTaskViewModelToRxDB(item, this.connectionInstanceId, this.pluginId),
    )
    const lastUpdatedAtIso = dateToISO(last.updatedAt) ?? nowIso
    return {
      documents: docs,
      checkpoint: {
        updatedAt: lastUpdatedAtIso,
        id: String(last.id),
      },
    }
  }

  async push(): Promise<SyncTaskRxDBDTO[]> {
    return []
  }
}
