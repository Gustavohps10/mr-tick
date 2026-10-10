import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { CoreConnectionScope, CoreMetadata } from './CoreContext'

export interface ICoreMetadataAPI {
  get(scope: CoreConnectionScope): Promise<Either<AppError, CoreMetadata>>
}
