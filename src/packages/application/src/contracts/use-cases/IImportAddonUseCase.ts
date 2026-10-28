import { AppError, Either } from '@mr-tick/shared/helpers'
import { IJobEvent } from '@mr-tick/shared/transport'

import { FileData } from '@/contracts/infra'

export interface IImportAddonUseCase {
  execute(
    fileData: FileData,
    onProgress?: (event: IJobEvent) => void,
  ): Promise<Either<AppError, void>>
}
