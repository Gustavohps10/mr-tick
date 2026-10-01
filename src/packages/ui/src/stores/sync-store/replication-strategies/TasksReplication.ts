import { IHostBridge } from '@mr-tick/application'
import { StatusChange, TaskViewModel } from '@mr-tick/shared/view-models'

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

    const docs: SyncTaskRxDBDTO[] = data.map(
      (item: TaskViewModel): SyncTaskRxDBDTO => {
        const sourceId = String(item.id)
        const createdAtIso = dateToISO(item.createdAt) ?? nowIso
        const updatedAtIso = dateToISO(item.updatedAt) ?? nowIso

        return {
          id: `${this.connectionInstanceId}::${sourceId}`,
          sourceId,
          dataSourceId: this.pluginId,
          connectionInstanceId: this.connectionInstanceId,
          _deleted: false,
          syncStatus: 'synced',
          lastPulledAt: nowIso,
          lastPushedAt: null,
          lastReconciledAt: nowIso,
          title: item.title,
          description: item.description ? item.description : null,
          projectName: item.projectName ? item.projectName : null,
          url: item.url ? item.url : null,
          tracker: item.tracker?.id ? item.tracker : undefined,
          status: item.status,
          priority: item.priority?.name ? item.priority : undefined,
          assignedTo: item.assignedTo?.name ? item.assignedTo : undefined,
          author: item.author?.name ? item.author : undefined,
          doneRatio: typeof item.doneRatio === 'number' ? item.doneRatio : null,
          createdAt: createdAtIso,
          updatedAt: updatedAtIso,
          startDate: dateToISO(item.startDate) ?? null,
          dueDate: dateToISO(item.dueDate) ?? null,
          timeEntryIds: [],
          statusChanges: item.statusChanges?.map((changeItem: StatusChange) => {
            const changedAtIso = dateToISO(changeItem.changedAt)
            return {
              fromStatus: changeItem.fromStatus,
              toStatus: changeItem.toStatus,
              description: changeItem.description
                ? changeItem.description
                : undefined,
              changedBy: changeItem.changedBy,
              changedAt: changedAtIso ? changedAtIso : nowIso,
            }
          }),
        }
      },
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
