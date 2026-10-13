import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  AddonPackageFile,
  VerifiedAddonPackage,
} from '../infra/IAddonPackageVerifier'

export type AddonAuthorizationIntent = 'install' | 'load'
export interface IAddonAccessService {
  authorizeFiles(
    files: readonly AddonPackageFile[],
    addonId: string,
    version: string,
    intent: AddonAuthorizationIntent,
  ): Promise<Either<AppError, VerifiedAddonPackage>>
  authorizeDirectory(
    addonId: string,
    directory: string,
    intent: AddonAuthorizationIntent,
  ): Promise<Either<AppError, VerifiedAddonPackage>>
}
