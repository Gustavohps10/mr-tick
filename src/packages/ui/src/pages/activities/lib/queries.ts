import { MangoQuery, MangoQuerySelector, MangoQuerySortPart } from 'rxdb'

import { ConnectionScope, isNoneScope } from '@/lib/connection-scope'
import {
  SyncMetadataItem,
  SyncMetadataRxDBDTO,
} from '@/local-db/schemas/metadata-sync-schema'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { AppDatabase } from '@/stores/syncStore'

type SortDescriptor = {
  id: keyof SyncTaskRxDBDTO
  desc: boolean
}

export interface GetTasksSchema {
  page: number
  perPage: number
  sort: SortDescriptor[]
  title?: string
  status: string[]
  priority: string[]
  createdAt: string[]
  estimatedHours: number[]
}

function getMemberTaskSelector(
  memberIds: string[],
  scope?: ConnectionScope,
): MangoQuery<SyncTaskRxDBDTO> {
  const selector: MangoQuery<SyncTaskRxDBDTO>['selector'] = {
    _deleted: { $ne: true },
  }

  if (scope && scope.kind === 'subset') {
    selector.connectionInstanceId = { $in: scope.ids }
  }

  if (memberIds.length > 0) {
    selector.$or = [
      { 'author.id': { $in: memberIds } },
      { 'assignedTo.id': { $in: memberIds } },
      ...memberIds.map((id) => ({
        participants: { $elemMatch: { id: { $eq: id } } },
      })),
    ]
  }

  return { selector }
}

/**
 * Busca todas as tarefas de um usuário (para agregações).
 */
async function getAllUserTasks(
  db: AppDatabase,
  memberIds: string[],
  scope?: ConnectionScope,
): Promise<SyncTaskRxDBDTO[]> {
  if (scope && isNoneScope(scope)) {
    return []
  }

  const { selector } = getMemberTaskSelector(memberIds, scope)
  const allDocs = await db.tasks.find({ selector }).exec()

  // Converte DeepReadonlyObject[] para SyncTaskRxDBDTO[]
  const readonlyData = allDocs.map((doc) => doc.toJSON())
  return JSON.parse(JSON.stringify(readonlyData)) as SyncTaskRxDBDTO[]
}

/**
 * Busca e mescla deterministicamente os metadados (status, prioridades)
 * das conexões selecionadas, deduplicando por id.
 */
async function getMetadata(
  db: AppDatabase,
  scope?: ConnectionScope,
): Promise<SyncMetadataRxDBDTO | undefined> {
  if (scope && isNoneScope(scope)) {
    return undefined
  }

  let selector: MangoQuerySelector<SyncMetadataRxDBDTO> | undefined

  if (scope && scope.kind === 'subset') {
    selector = { connectionInstanceId: { $in: scope.ids } }
  }

  const metadataDocs = selector
    ? await db.metadata.find({ selector }).exec()
    : await db.metadata.find().exec()

  if (!metadataDocs || metadataDocs.length === 0) {
    return undefined
  }

  const plainDocs = metadataDocs.map(
    (doc) => doc.toJSON() as SyncMetadataRxDBDTO,
  )

  const mergedStatuses: SyncMetadataItem[] = []
  const seenStatusIds = new Set<string>()

  const mergedPriorities: SyncMetadataItem[] = []
  const seenPriorityIds = new Set<string>()

  for (const doc of plainDocs) {
    for (const status of doc.taskStatuses ?? []) {
      if (!seenStatusIds.has(status.id)) {
        seenStatusIds.add(status.id)
        mergedStatuses.push(status)
      }
    }

    for (const priority of doc.taskPriorities ?? []) {
      if (!seenPriorityIds.has(priority.id)) {
        seenPriorityIds.add(priority.id)
        mergedPriorities.push(priority)
      }
    }
  }

  return {
    ...plainDocs[0],
    taskStatuses: mergedStatuses,
    taskPriorities: mergedPriorities,
  }
}

export async function getTasks(
  db: AppDatabase,
  memberIds: string[],
  input: GetTasksSchema,
  scope?: ConnectionScope,
) {
  if (scope && isNoneScope(scope)) {
    return { data: [], pageCount: 0 }
  }

  try {
    const offset = (input.page - 1) * input.perPage
    const { selector: userSelector } = getMemberTaskSelector(memberIds, scope)

    const selector: MangoQuery<SyncTaskRxDBDTO>['selector'] = {
      ...userSelector,
    }

    if (input.title) {
      // CORREÇÃO: O tipo $regex do RxDB espera uma string.
      // Usamos '(?i)' no início da string para habilitar case-insensitivity.
      selector.title = { $regex: '(?i)' + input.title }
    }

    if (input.status?.length > 0) {
      selector['status.name'] = { $in: input.status }
    }

    if (input.priority?.length > 0) {
      selector['priority.name'] = { $in: input.priority }
    }
    if (input.createdAt?.length === 2) {
      selector.createdAt = {
        $gte: new Date(input.createdAt[0]).toISOString(),
        $lte: new Date(input.createdAt[1]).toISOString(),
      }
    }

    const sort: MangoQuerySortPart<SyncTaskRxDBDTO>[] =
      input.sort.length > 0
        ? input.sort.map((item) => ({
            [item.id]: item.desc ? 'desc' : 'asc',
          }))
        : [{ updatedAt: 'desc' }]

    const tasksDocs = await db.tasks
      .find({
        selector,
        sort,
        skip: offset,
        limit: input.perPage,
      })
      .exec()

    const total = await db.tasks
      .count({
        selector,
      })
      .exec()

    const pageCount = Math.ceil(total / input.perPage)

    const data = JSON.parse(
      JSON.stringify(tasksDocs.map((doc) => doc.toJSON())),
    ) as SyncTaskRxDBDTO[]

    return { data, pageCount }
  } catch (err) {
    console.error('Error fetching tasks from RxDB:', err)
    return { data: [], pageCount: 0 }
  }
}

export async function getTaskStatusCounts(
  db: AppDatabase,
  memberIds: string[],
  scope?: ConnectionScope,
) {
  if (scope && isNoneScope(scope)) {
    return {}
  }

  const [tasks, metadata] = await Promise.all([
    getAllUserTasks(db, memberIds, scope),
    getMetadata(db, scope),
  ])

  const counts: Record<string, number> = {}
  metadata?.taskStatuses.forEach((status: SyncMetadataItem) => {
    counts[status.name] = 0
  })

  for (const task of tasks) {
    if (counts[task.status.name] !== undefined) {
      counts[task.status.name]++
    }
  }
  return counts
}

export async function getTaskPriorityCounts(
  db: AppDatabase,
  memberIds: string[],
  scope?: ConnectionScope,
) {
  if (scope && isNoneScope(scope)) {
    return {}
  }

  const [tasks, metadata] = await Promise.all([
    getAllUserTasks(db, memberIds, scope),
    getMetadata(db, scope),
  ])

  const counts: Record<string, number> = {}
  metadata?.taskPriorities.forEach((priority: SyncMetadataItem) => {
    counts[priority.name] = 0
  })

  for (const task of tasks) {
    if (task.priority && counts[task.priority.name] !== undefined) {
      counts[task.priority.name]++
    }
  }
  return counts
}

export async function getEstimatedHoursRange(
  db: AppDatabase,
  memberIds: string[],
  scope?: ConnectionScope,
) {
  if (scope && isNoneScope(scope)) {
    return { min: 0, max: 0 }
  }

  const tasks = await getAllUserTasks(db, memberIds, scope)
  if (tasks.length === 0) return { min: 0, max: 0 }

  let min = 0
  let max = 0
  let firstRun = true

  for (const task of tasks) {
    const totalEstimated =
      task.estimatedTimes?.reduce((acc, curr) => acc + curr.hours, 0) || 0

    if (firstRun) {
      min = totalEstimated
      max = totalEstimated
      firstRun = false
    } else {
      if (totalEstimated < min) min = totalEstimated
      if (totalEstimated > max) max = totalEstimated
    }
  }

  return { min, max }
}

export async function getAllstatus(db: AppDatabase, scope?: ConnectionScope) {
  const metadata = await getMetadata(db, scope)
  return metadata?.taskStatuses || []
}

export async function getAllPriorities(
  db: AppDatabase,
  scope?: ConnectionScope,
) {
  const metadata = await getMetadata(db, scope)
  return metadata?.taskPriorities || []
}
