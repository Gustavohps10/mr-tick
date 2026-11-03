import type { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  CoreTask,
  CoreTaskListRequest,
  CoreTaskPage,
  CoreTaskReference,
} from './CoreContext'

export interface ICoreTasksAPI {
  search(request: CoreTaskListRequest): Promise<Either<AppError, CoreTaskPage>>
  list(request: CoreTaskListRequest): Promise<Either<AppError, CoreTaskPage>>
  get(reference: CoreTaskReference): Promise<Either<AppError, CoreTask>>
}
