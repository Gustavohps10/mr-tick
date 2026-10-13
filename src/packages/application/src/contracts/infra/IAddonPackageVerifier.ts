import { AppError, Either } from '@mr-tick/shared/helpers'

export interface AddonPackageFile {
  readonly name: string
  readonly content: Uint8Array
}
export interface VerifiedAddonPackage {
  readonly classification: 'free' | 'plus' | 'unknown'
  readonly fingerprint: string
  readonly addonId: string
  readonly version: string
  readonly requiredApiVersion?: string
}
export interface IAddonPackageVerifier {
  verify(
    files: readonly AddonPackageFile[],
    addonId: string,
    version: string,
  ): Promise<Either<AppError, VerifiedAddonPackage>>
  verifyDirectory(
    addonId: string,
    directory: string,
  ): Promise<Either<AppError, VerifiedAddonPackage>>
}
