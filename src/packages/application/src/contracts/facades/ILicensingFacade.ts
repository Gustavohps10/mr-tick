import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  LicensingPlusDownloadResultDTO,
  LicensingStatusDTO,
} from '@/dtos/LicensingDTO'

export interface ILicensingFacade {
  getStatus(): Promise<Either<AppError, LicensingStatusDTO>>
  activateLicense(
    licenseKey: string,
  ): Promise<Either<AppError, LicensingStatusDTO>>
  refreshLicense(): Promise<Either<AppError, LicensingStatusDTO>>
  deactivateLicense(): Promise<Either<AppError, LicensingStatusDTO>>
  downloadPlusPackage(
    addonId: string,
    version: string,
  ): Promise<Either<AppError, LicensingPlusDownloadResultDTO>>
}
