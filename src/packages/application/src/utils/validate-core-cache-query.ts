import {
  AppError,
  Either,
  isNonEmptyString,
  isNumber,
  isRecord,
  isString,
} from '@mr-tick/shared/helpers'

import type { CoreCacheQuery, CoreConnectionScope } from '../contracts/core'

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
  const scope = validateCoreScope(input)
  if (scope.isFailure()) return scope
  switch (input.action) {
    case 'task':
      if (!isNonEmptyString(input.taskId))
        return Either.failure(AppError.ValidationError('TASK_REQUIRED'))
      return Either.success()
    case 'metadata':
      return Either.success()
    case 'tasks':
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
