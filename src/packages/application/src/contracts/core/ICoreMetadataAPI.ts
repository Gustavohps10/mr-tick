import type { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  CoreConnectionScope,
  CoreMetadata,
  LocalMetadataSnapshot,
} from './CoreContext'

export interface ICoreMetadataAPI {
  getLocal(
    workspaceId: string,
  ): Promise<Either<AppError, LocalMetadataSnapshot>>
  get(scope: CoreConnectionScope): Promise<Either<AppError, CoreMetadata>>
}
