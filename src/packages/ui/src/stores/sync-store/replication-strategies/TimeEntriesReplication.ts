import { IOpenAPI, SyncTimeEntryDTO } from '@mr-tick/sdk'
import { TimeEntryViewModel } from '@mr-tick/shared/view-models'

import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'

import {
  IReplicationStrategy,
  ReplicationCheckpoint,
  RxReplicationWriteToMasterRow,
} from '../types'

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

export class TimeEntriesReplication implements IReplicationStrategy<
  SyncTimeEntryRxDBDTO,
  ReplicationCheckpoint
> {
  constructor(
    private client: IOpenAPI,
    private workspaceId: string,
    private connectionInstanceId: string,
    private pluginId: string,
  ) {}

  async pull(
    checkpoint: ReplicationCheckpoint | undefined,
    batchSize: number,
  ): Promise<{
    documents: SyncTimeEntryRxDBDTO[]
    checkpoint: ReplicationCheckpoint
  }> {
    const res = await this.client.services.timeEntries.pull({
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

    const data: TimeEntryViewModel[] = res.data ?? []
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

    const docs: SyncTimeEntryRxDBDTO[] = data.map(
      (item: TimeEntryViewModel): SyncTimeEntryRxDBDTO => {
        const sourceId = String(item.id)
        const rawStartDate = dateToISO(item.startDate)
        let resolvedStartDate = rawStartDate
        if (!resolvedStartDate) {
          const rawCreatedAt = dateToISO(item.createdAt)
          if (rawCreatedAt) {
            resolvedStartDate = rawCreatedAt
          } else {
            resolvedStartDate = nowIso
          }
        }
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
          task: item.task,
          activity: item.activity,
          user: item.user,
          timeSpent: item.timeSpent,
          comments: item.comments,
          startDate: resolvedStartDate,
          endDate: dateToISO(item.endDate),
          createdAt: createdAtIso,
          updatedAt: updatedAtIso,
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

  async push(
    rows: RxReplicationWriteToMasterRow<SyncTimeEntryRxDBDTO>[],
  ): Promise<SyncTimeEntryRxDBDTO[]> {
    if (rows.length === 0) return []

    const entries: SyncTimeEntryDTO[] = rows.map((r) => {
      const doc = r.newDocumentState
      const assumedState = r.assumedMasterState

      const entry: SyncTimeEntryDTO = {
        id: doc.sourceId,
        _deleted: doc._deleted,
        task: { id: doc.task.id },
        activity: { id: doc.activity.id, name: doc.activity.name },
        user: { id: doc.user.id, name: doc.user.name },
        timeSpent: doc.timeSpent,
        comments: doc.comments,
        startDate: doc.startDate ? new Date(doc.startDate) : undefined,
        endDate: doc.endDate ? new Date(doc.endDate) : undefined,
        createdAt: new Date(doc.createdAt),
        updatedAt: new Date(doc.updatedAt),
      }

      if (assumedState) {
        entry.assumedMasterState = {
          id: assumedState.sourceId,
          task: { id: assumedState.task.id },
          activity: {
            id: assumedState.activity.id,
            name: assumedState.activity.name,
          },
          user: { id: assumedState.user.id, name: assumedState.user.name },
          timeSpent: assumedState.timeSpent,
          comments: assumedState.comments,
          startDate: assumedState.startDate
            ? new Date(assumedState.startDate)
            : undefined,
          endDate: assumedState.endDate
            ? new Date(assumedState.endDate)
            : undefined,
          createdAt: new Date(assumedState.createdAt),
          updatedAt: new Date(assumedState.updatedAt),
        }
      }

      return entry
    })

    const res = await this.client.services.timeEntries.push({
      body: {
        workspaceId: this.workspaceId,
        pluginId: this.pluginId,
        connectionInstanceId: this.connectionInstanceId,
        entries,
      },
    })

    const serverItems = res.data ?? []
    const conflictedDocs: SyncTimeEntryRxDBDTO[] = []

    for (const item of serverItems) {
      if (item.conflicted) {
        const matchingRow = rows.find(
          (r) => r.newDocumentState.sourceId === item.id,
        )
        if (matchingRow) {
          conflictedDocs.push({
            ...matchingRow.newDocumentState,
            conflicted: true,
            syncStatus: 'conflict',
            updatedAt: item.updatedAt
              ? item.updatedAt.toISOString()
              : matchingRow.newDocumentState.updatedAt,
            lastPulledAt: new Date().toISOString(),
          })
        }
      }
    }

    return conflictedDocs
  }
}
