import { AppError, Either } from '@mr-tick/shared/helpers'

export interface IAddonConsentRepository {
  isApproved(fingerprint: string): Promise<Either<AppError, boolean>>
  approve(fingerprint: string): Promise<Either<AppError, void>>
}
