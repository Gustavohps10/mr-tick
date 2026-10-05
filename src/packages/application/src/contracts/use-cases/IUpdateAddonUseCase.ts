import { AppError, Either } from '@mr-tick/shared/helpers'
import { IJobEvent } from '@mr-tick/shared/transport'

export interface UpdateAddonInput {
  addonId: string
  downloadUrl: string
}

export interface IUpdateAddonUseCase {
  execute(
    input: UpdateAddonInput,
    onProgress?: (event: IJobEvent) => void,
  ): Promise<Either<AppError, void>>
}
