import type { CoreCacheValue, MetadataDTO } from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import type { MangoQuerySelector } from 'rxdb'

import type { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import type { AppDatabase } from '@/stores/sync-store/types'

export function emptyLocalMetadata(): MetadataDTO {
  return {
    taskStatuses: [],
    taskPriorities: [],
    activities: [],
    trackStatuses: [],
    participantRoles: [],
    estimationTypes: [],
  }
}

const categories: Array<keyof MetadataDTO> = [
  'taskStatuses',
  'taskPriorities',
  'activities',
  'trackStatuses',
  'participantRoles',
  'estimationTypes',
]

export async function readLocalMetadata(db: AppDatabase): Promise<MetadataDTO> {
  const document = await db.metadata.findOne('::metadata').exec()
  if (document === null) return emptyLocalMetadata()
  const record = document.toMutableJSON()
  return {
    taskStatuses: record.taskStatuses,
    taskPriorities: record.taskPriorities,
    activities: record.activities,
    trackStatuses: record.trackStatuses,
    participantRoles: record.participantRoles,
    estimationTypes: record.estimationTypes,
  }
}

export async function saveLocalMetadata(
  db: AppDatabase,
  values: MetadataDTO,
  revision: string,
): Promise<Either<AppError, CoreCacheValue>> {
  const current = await readLocalMetadata(db)
  if (JSON.stringify(current) !== revision)
    return Either.failure(
      AppError.Http(
        409,
        'Os metadados foram alterados em outra janela. Recarregue antes de salvar.',
      ),
    )

  for (const category of categories) {
    const names = new Set<string>()
    const ids = new Set<string>()

    for (const item of values[category]) {
      const name = item.name.trim().toLocaleLowerCase()
      if (
        !item.id.trim() ||
        !name ||
        !item.icon.trim() ||
        names.has(name) ||
        ids.has(item.id)
      )
        return Either.failure(
          AppError.ValidationError(
            'Cada item precisa de ID e nome únicos na categoria, e um ícone.',
          ),
        )
      if (
        !item.colors.badge.trim() ||
        !item.colors.background.trim() ||
        !item.colors.text.trim()
      )
        return Either.failure(
          AppError.ValidationError('Defina as cores do metadado.'),
        )
      names.add(name)
      ids.add(item.id)
    }

    for (const removed of current[category]) {
      if (ids.has(removed.id)) continue
      if (await metadataInUse(db, category, removed.id))
        return Either.failure(
          AppError.ValidationError(
            'Este metadado está em uso e não pode ser removido.',
            { [category]: [removed.id] },
          ),
        )
    }
  }

  const canonical: MetadataDTO = {
    taskStatuses: values.taskStatuses,
    taskPriorities: values.taskPriorities,
    activities: values.activities,
    trackStatuses: values.trackStatuses,
    participantRoles: values.participantRoles,
    estimationTypes: values.estimationTypes,
  }
  await db.metadata.upsert({
    id: '::metadata',
    sourceId: 'metadata',
    connectionInstanceId: '',
    dataSourceId: '',
    _deleted: false,
    syncStatus: 'local_only',
    lastPulledAt: null,
    ...canonical,
  })
  const saved = await readLocalMetadata(db)
  return Either.success({
    kind: 'localMetadata',
    values: saved,
    revision: JSON.stringify(saved),
  })
}

async function metadataInUse(
  db: AppDatabase,
  category: keyof MetadataDTO,
  id: string,
): Promise<boolean> {
  if (category === 'activities') {
    const entry = await db.timeEntries
      .findOne({ selector: { syncStatus: 'local_only', 'activity.id': id } })
      .exec()
    if (entry !== null) return true
  }

  const selector: MangoQuerySelector<SyncTaskRxDBDTO> = {
    syncStatus: 'local_only',
  }

  switch (category) {
    case 'taskStatuses':
      selector['status.id'] = id
      break
    case 'taskPriorities':
      selector['priority.id'] = id
      break
    case 'trackStatuses':
      selector['tracker.id'] = id
      break
    case 'participantRoles':
      selector.participants = { $elemMatch: { 'role.id': id } }
      break
    case 'estimationTypes':
      selector.estimatedTimes = { $elemMatch: { id } }
      break
    case 'activities':
      selector.estimatedTimes = {
        $elemMatch: { activities: { $elemMatch: { id } } },
      }
      break
  }

  return (await db.tasks.findOne({ selector }).exec()) !== null
}
