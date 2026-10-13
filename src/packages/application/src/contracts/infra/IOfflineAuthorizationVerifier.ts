import { OfflineAuthorizationClaims } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'

export interface IOfflineAuthorizationVerifier {
  verify(token: string): Promise<Either<AppError, OfflineAuthorizationClaims>>
}
