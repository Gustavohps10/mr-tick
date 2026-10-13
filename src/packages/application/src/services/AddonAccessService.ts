import { AppError, Either } from '@mr-tick/shared/helpers'

import { ILicensingFacade } from '@/contracts/facades/ILicensingFacade'
import { IAddonConsentRepository } from '@/contracts/infra/IAddonConsentRepository'
import {
  AddonPackageFile,
  IAddonPackageVerifier,
  VerifiedAddonPackage,
} from '@/contracts/infra/IAddonPackageVerifier'
import {
  AddonAuthorizationIntent,
  IAddonAccessService,
} from '@/contracts/use-cases/IAddonAccessService'

export class AddonAccessService implements IAddonAccessService {
  constructor(
    private readonly addonPackageVerifier: IAddonPackageVerifier,
    private readonly licensingFacade: ILicensingFacade,
    private readonly addonConsentRepository: IAddonConsentRepository,
  ) {}

  private async authorize(
    verified: VerifiedAddonPackage,
    intent: AddonAuthorizationIntent,
  ): Promise<Either<AppError, VerifiedAddonPackage>> {
    if (verified.classification === 'free') return Either.success(verified)
    const status = await this.licensingFacade.getStatus()
    if (status.isFailure()) return status.forwardFailure()
    if (
      !status.success.isPlusActive ||
      !status.success.entitlements.includes('plus_addons')
    )
      return Either.failure(
        AppError.Unauthorized('LICENCA_PLUS_NECESSARIA_PARA_ADDON'),
      )
    if (verified.classification === 'plus') return Either.success(verified)
    if (intent === 'install') {
      const approval = await this.addonConsentRepository.approve(
        verified.fingerprint,
      )
      if (approval.isFailure()) return approval.forwardFailure()
      return Either.success(verified)
    }
    const approval = await this.addonConsentRepository.isApproved(
      verified.fingerprint,
    )
    if (approval.isFailure()) return approval.forwardFailure()
    if (!approval.success)
      return Either.failure(
        AppError.Unauthorized('ADDON_DESCONHECIDO_REQUER_CONFIRMACAO'),
      )
    return Either.success(verified)
  }

  async authorizeFiles(
    files: readonly AddonPackageFile[],
    addonId: string,
    version: string,
    intent: AddonAuthorizationIntent,
  ): Promise<Either<AppError, VerifiedAddonPackage>> {
    const verified = await this.addonPackageVerifier.verify(
      files,
      addonId,
      version,
    )
    if (verified.isFailure()) return verified.forwardFailure()
    return this.authorize(verified.success, intent)
  }

  async authorizeDirectory(
    addonId: string,
    directory: string,
    intent: AddonAuthorizationIntent,
  ): Promise<Either<AppError, VerifiedAddonPackage>> {
    const verified = await this.addonPackageVerifier.verifyDirectory(
      addonId,
      directory,
    )
    if (verified.isFailure()) return verified.forwardFailure()
    return this.authorize(verified.success, intent)
  }
}
