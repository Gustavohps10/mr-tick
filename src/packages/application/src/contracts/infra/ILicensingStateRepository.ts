import { AppError, Either } from '@mr-tick/shared/helpers'

import { StoredLicensingStateDTO } from '@/dtos/LicensingDTO'

export interface ILicensingStateRepository {
  getInstallationSeed(): Promise<Either<AppError, string | null>>
  saveInstallationSeed(seed: string): Promise<Either<AppError, void>>
  readState(): Promise<Either<AppError, StoredLicensingStateDTO | null>>
  saveState(state: StoredLicensingStateDTO): Promise<Either<AppError, void>>
  clearState(): Promise<Either<AppError, void>>
}
