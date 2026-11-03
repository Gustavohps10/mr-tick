import {
  AppError,
  Either,
  isNonEmptyString,
  isNumber,
  isRecord,
  isString,
} from '@mr-tick/shared/helpers'

import type { CoreCacheQuery, CoreConnectionScope } from '../contracts/core'
import type { MetadataDTO } from '../dtos'

export function validateCoreScope(
  scope: CoreConnectionScope,
): Either<AppError, void> {
  if (!isRecord(scope) || !isNonEmptyString(scope.workspaceId))
    return Either.failure(AppError.ValidationError('WORKSPACE_REQUIRED'))
  if (!isNonEmptyString(scope.connectionInstanceId))
    return Either.failure(AppError.ValidationError('CONNECTION_REQUIRED'))
  return Either.success()
}
export function validateCoreCacheQuery(
  input: CoreCacheQuery,
): Either<AppError, void> {
  if (input === null || typeof input !== 'object')
    return Either.failure(AppError.ValidationError('CORE_QUERY_INVALID'))
  if (input.action === 'taskReferences') {
    if (
      !isNonEmptyString(input.workspaceId) ||
      !isString(input.search) ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    )
      return Either.failure(
        AppError.ValidationError('INVALID_REFERENCE_LOOKUP'),
      )
    if (
      input.origin === 'remote' &&
      !isNonEmptyString(input.connectionInstanceId)
    )
      return Either.failure(AppError.ValidationError('CONNECTION_REQUIRED'))
    if (input.origin === 'local' && input.connectionInstanceId !== '')
      return Either.failure(AppError.ValidationError('INVALID_LOCAL_ORIGIN'))
    if (input.origin !== 'local' && input.origin !== 'remote')
      return Either.failure(
        AppError.ValidationError('INVALID_REFERENCE_ORIGIN'),
      )
    return Either.success()
  }
  if (
    input.action === 'localMetadata' ||
    input.action === 'saveLocalMetadata'
  ) {
    if (
      !isNonEmptyString(input.workspaceId) ||
      input.connectionInstanceId !== ''
    )
      return Either.failure(
        AppError.ValidationError('INVALID_LOCAL_METADATA_SCOPE'),
      )
    if (input.action === 'saveLocalMetadata') {
      if (!isString(input.revision) || !isRecord(input.values))
        return Either.failure(
          AppError.ValidationError('INVALID_LOCAL_METADATA'),
        )
      const categories: Array<keyof MetadataDTO> = [
        'activities',
        'taskStatuses',
        'taskPriorities',
        'trackStatuses',
        'participantRoles',
        'estimationTypes',
      ]

      for (const category of categories) {
        if (!Array.isArray(input.values[category]))
          return Either.failure(
            AppError.ValidationError('INVALID_LOCAL_METADATA'),
          )

        for (const item of input.values[category]) {
          if (
            !isRecord(item) ||
            !isNonEmptyString(item.id) ||
            !isNonEmptyString(item.name) ||
            !isNonEmptyString(item.icon) ||
            !isRecord(item.colors)
          )
            return Either.failure(
              AppError.ValidationError('INVALID_LOCAL_METADATA_ITEM'),
            )
          if (
            !isNonEmptyString(item.colors.badge) ||
            !isNonEmptyString(item.colors.background) ||
            !isNonEmptyString(item.colors.text)
          )
            return Either.failure(
              AppError.ValidationError('INVALID_LOCAL_METADATA_COLORS'),
            )
        }
      }
    }

    return Either.success()
  }

  const scope = validateCoreScope(input)
  if (scope.isFailure()) return scope
  switch (input.action) {
    case 'cacheTasks':
      return Either.success()
    case 'task':
      if (!isNonEmptyString(input.taskId))
        return Either.failure(AppError.ValidationError('TASK_REQUIRED'))
      return Either.success()
    case 'metadata':
    case 'currentUser':
      return Either.success()
    case 'tasks':
      if (
        input.offset !== undefined &&
        (!Number.isInteger(input.offset) || input.offset < 0)
      )
        return Either.failure(AppError.ValidationError('TASK_OFFSET_INVALID'))
      if (
        input.sortByUpdatedAt !== undefined &&
        input.sortByUpdatedAt !== 'asc' &&
        input.sortByUpdatedAt !== 'desc'
      )
        return Either.failure(AppError.ValidationError('TASK_SORT_INVALID'))
      if (
        !isNumber(input.limit) ||
        !Number.isInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 100
      )
        return Either.failure(AppError.ValidationError('TASK_LIMIT_INVALID'))
      if (
        input.search !== undefined &&
        (!isString(input.search) || input.search.length > 250)
      )
        return Either.failure(AppError.ValidationError('TASK_SEARCH_INVALID'))
      return Either.success()
    default:
      return Either.failure(AppError.ValidationError('CORE_QUERY_INVALID'))
  }
}
