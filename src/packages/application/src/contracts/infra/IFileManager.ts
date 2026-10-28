import { AppError, Either } from '@mr-tick/shared/helpers'

import { FileData } from '@/contracts/infra/IFileStorage'

export interface IFileManager {
  zip(files: { name: string; content: FileData }[]): Promise<Buffer>
  unzipInMemory(
    fileData: FileData,
  ): Promise<{ name: string; content: Buffer }[]>
  getMimeType(
    file: FileData,
  ): Promise<Either<AppError, { mime: string; ext: string }>>
}
