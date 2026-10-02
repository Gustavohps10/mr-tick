import { IHostBridge } from '@mr-tick/application'
import { StatusChange, TaskViewModel } from '@mr-tick/shared/view-models'

import {
  SyncParticipantsRxDBDTO,
  SyncTaskRxDBDTO,
} from '@/local-db/schemas/tasks-sync-schema'
import { extractPureTaskId } from '@/pages/time-entries/lib/time-entries-utils'
import { AppDatabase } from '@/stores/sync-store/types'

function dateToISO(
  value: Date | string | null | undefined,
): string | undefined {
  if (!value) return undefined
  if (value instanceof Date) return value.toISOString()
  const parsedDate = new Date(value)
  if (!Number.isNaN(parsedDate.getTime())) return parsedDate.toISOString()
  return String(value)
}

export function mapTaskViewModelToRxDB(
  item: TaskViewModel,
  connectionInstanceId: string,
  dataSourceId: string,
): SyncTaskRxDBDTO {
  const sourceId = String(item.id)
  const nowIso = new Date().toISOString()
  const createdAtIso = dateToISO(item.createdAt)
  const updatedAtIso = dateToISO(item.updatedAt)

  return {
    id: `${connectionInstanceId}::${sourceId}`,
    sourceId,
    dataSourceId,
    connectionInstanceId,
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
    createdAt: createdAtIso ? createdAtIso : nowIso,
    updatedAt: updatedAtIso ? updatedAtIso : nowIso,
    startDate: dateToISO(item.startDate) ? dateToISO(item.startDate) : null,
    dueDate: dateToISO(item.dueDate) ? dateToISO(item.dueDate) : null,
    spentHours: typeof item.spentHours === 'number' ? item.spentHours : null,
    estimatedTimes: item.estimatedTimes ? item.estimatedTimes : [],
    timeEntryIds: [],
    conflicted: false,
    participants: item.participants
      ? item.participants.map((participant): SyncParticipantsRxDBDTO => ({
          id: participant.id,
          name: participant.name,
          role: participant.role,
        }))
      : [],
    statusChanges: item.statusChanges
      ? item.statusChanges.map((changeItem: StatusChange) => {
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
        })
      : [],
  }
}

export interface FetchAndPersistTasksParams {
  hostBridge: IHostBridge
  db: AppDatabase
  workspaceId: string
  connectionInstanceId: string
  dataSourceId: string
  ids?: string[]
  search?: string
  page?: number
  pageSize?: number
}

export async function fetchAndPersistTasks(
  params: FetchAndPersistTasksParams,
): Promise<SyncTaskRxDBDTO[]> {
  const {
    hostBridge,
    db,
    workspaceId,
    connectionInstanceId,
    dataSourceId,
    ids,
    search,
    page,
    pageSize,
  } = params

  if (!connectionInstanceId || !workspaceId) return []
  if ((!ids || ids.length === 0) && (!search || search.trim() === '')) return []

  const cleanIds = ids
    ? Array.from(
        new Set(
          ids.map((id) => extractPureTaskId(id)).filter((id) => id.length > 0),
        ),
      )
    : undefined

  if (
    ids &&
    cleanIds &&
    cleanIds.length === 0 &&
    (!search || search.trim() === '')
  ) {
    return []
  }

  const response = await hostBridge.tasks.listTasks({
    body: {
      workspaceId,
      connectionInstanceId,
      ids: cleanIds,
      search: search && search.trim() !== '' ? search.trim() : undefined,
      page: page ? page : 1,
      pageSize: pageSize ? pageSize : 50,
    },
  })

  if (!response.isSuccess) return []
  if (!response.data || response.data.length === 0) return []

  const mappedDocs: SyncTaskRxDBDTO[] = response.data.map((task) =>
    mapTaskViewModelToRxDB(task, connectionInstanceId, dataSourceId),
  )

  await db.tasks.bulkUpsert(mappedDocs)
  return mappedDocs
}
