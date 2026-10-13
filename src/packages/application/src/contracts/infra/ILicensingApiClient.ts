import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  LicensingActivationRequestDTO,
  LicensingApiEnvelopeDTO,
  LicensingDeactivateRequestDTO,
  LicensingPlusDownloadRequestDTO,
  LicensingPlusDownloadResultDTO,
  LicensingRefreshRequestDTO,
} from '@/dtos/LicensingDTO'

export interface ILicensingApiClient {
  activate(
    input: LicensingActivationRequestDTO,
  ): Promise<Either<AppError, LicensingApiEnvelopeDTO>>
  refresh(
    input: LicensingRefreshRequestDTO,
  ): Promise<Either<AppError, LicensingApiEnvelopeDTO>>
  deactivate(
    input: LicensingDeactivateRequestDTO,
  ): Promise<Either<AppError, void>>
  downloadPlusAddonPackage(
    input: LicensingPlusDownloadRequestDTO,
  ): Promise<Either<AppError, LicensingPlusDownloadResultDTO>>
}
