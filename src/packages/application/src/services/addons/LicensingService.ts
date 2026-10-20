import { PlusAccessPolicy } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import crypto from 'crypto'
import os from 'os'

import {
  ILicensingApiClient,
  ILicensingFacade,
  ILicensingStateRepository,
  IOfflineAuthorizationVerifier,
} from '@/contracts'
import {
  LicensingApiEnvelopeDTO,
  LicensingPlusDownloadResultDTO,
  LicensingStatusDTO,
  StoredLicensingStateDTO,
} from '@/dtos/LicensingDTO'

function maskLicenseKey(rawKey: string): string {
  const trimmed = rawKey.trim()
  if (trimmed.length <= 12) {
    return '****'
  }
  const prefix = trimmed.slice(0, 7)
  const suffix = trimmed.slice(-4)
  return `${prefix}-****-****-${suffix}`
}

function resolveDefaultDeviceLabel(): string {
  const host = os.hostname()
  if (host && host.trim().length > 0) {
    return host.trim()
  }
  return 'Mr. Tick Desktop'
}

export class LicensingService implements ILicensingFacade {
  constructor(
    private readonly licensingStateRepository: ILicensingStateRepository,
    private readonly licensingApiClient: ILicensingApiClient,
    private readonly offlineAuthorizationVerifier: IOfflineAuthorizationVerifier,
  ) {}

  private async getOrCreateInstallationId(): Promise<Either<AppError, string>> {
    const existingSeedResult =
      await this.licensingStateRepository.getInstallationSeed()
    if (existingSeedResult.isFailure()) {
      return existingSeedResult.forwardFailure()
    }

    let rawSeed = existingSeedResult.success
    if (!rawSeed) {
      rawSeed = `${os.platform()}:${os.arch()}:${crypto.randomUUID()}`
      const saveResult =
        await this.licensingStateRepository.saveInstallationSeed(rawSeed)
      if (saveResult.isFailure()) {
        return saveResult.forwardFailure()
      }
    }

    const installationId = crypto
      .createHash('sha256')
      .update(rawSeed, 'utf8')
      .digest('hex')
    return Either.success(installationId)
  }

  private async buildStatusFromStored(
    stored: StoredLicensingStateDTO | null,
    expectedInstallationId: string,
  ): Promise<LicensingStatusDTO> {
    if (!stored) {
      return {
        state: 'inactive',
        tier: 'free',
        isPlusActive: false,
        entitlements: [],
      }
    }

    const verifiedResult = await this.offlineAuthorizationVerifier.verify(
      stored.signedAuthorization,
    )
    if (verifiedResult.isFailure()) {
      return {
        state: 'revoked',
        tier: 'free',
        isPlusActive: false,
        licenseKeyMasked: maskLicenseKey(stored.licenseKey),
        activationId: stored.installationId,
        lastVerifiedAt: stored.lastVerifiedAt,
        entitlements: [],
      }
    }

    const claims = verifiedResult.success
    const evaluation = PlusAccessPolicy.evaluateClaims(
      claims,
      expectedInstallationId,
      Date.now(),
    )

    return {
      state: evaluation.state,
      tier: evaluation.tier,
      isPlusActive: evaluation.isPlusActive,
      licenseKeyMasked: maskLicenseKey(stored.licenseKey),
      activationId: claims.installationId,
      subscriptionStatus: claims.status,
      currentPeriodEnd: new Date(claims.paidThrough).toISOString(),
      offlineVerifyUntil: new Date(claims.offlineThrough).toISOString(),
      lastVerifiedAt: stored.lastVerifiedAt,
      entitlements: evaluation.entitlements,
      claims,
    }
  }

  private async persistEnvelopeAndEvaluate(
    licenseKey: string,
    installationId: string,
    envelope: LicensingApiEnvelopeDTO,
  ): Promise<Either<AppError, LicensingStatusDTO>> {
    const verified = await this.offlineAuthorizationVerifier.verify(
      envelope.signedAuthorization,
    )
    if (verified.isFailure()) {
      return verified.forwardFailure()
    }

    const claims = verified.success
    if (claims.installationId !== installationId) {
      return Either.failure(
        AppError.Unauthorized('LICENCA_INSTALACAO_DIVERGENTE'),
      )
    }

    const stored: StoredLicensingStateDTO = {
      licenseKey,
      installationId,
      signedAuthorization: envelope.signedAuthorization,
      lastVerifiedAt: new Date().toISOString(),
    }

    const writeResult = await this.licensingStateRepository.saveState(stored)
    if (writeResult.isFailure()) {
      return writeResult.forwardFailure()
    }

    const status = await this.buildStatusFromStored(stored, installationId)
    return Either.success(status)
  }

  async getStatus(): Promise<Either<AppError, LicensingStatusDTO>> {
    const installationResult = await this.getOrCreateInstallationId()
    if (installationResult.isFailure()) {
      return installationResult.forwardFailure()
    }

    const storedResult = await this.licensingStateRepository.readState()
    if (storedResult.isFailure()) {
      return storedResult.forwardFailure()
    }

    const status = await this.buildStatusFromStored(
      storedResult.success,
      installationResult.success,
    )
    return Either.success(status)
  }

  async activateLicense(
    licenseKey: string,
  ): Promise<Either<AppError, LicensingStatusDTO>> {
    const normalizedKey = licenseKey.trim()
    if (normalizedKey.length < 10) {
      return Either.failure(AppError.ValidationError('CHAVE_LICENCA_INVALIDA'))
    }

    const installationResult = await this.getOrCreateInstallationId()
    if (installationResult.isFailure()) {
      return installationResult.forwardFailure()
    }

    const apiResult = await this.licensingApiClient.activate({
      activationKey: normalizedKey,
      installationId: installationResult.success,
      deviceLabel: resolveDefaultDeviceLabel(),
    })
    if (apiResult.isFailure()) {
      return apiResult.forwardFailure()
    }

    return this.persistEnvelopeAndEvaluate(
      normalizedKey,
      installationResult.success,
      apiResult.success,
    )
  }

  async refreshLicense(): Promise<Either<AppError, LicensingStatusDTO>> {
    const installationResult = await this.getOrCreateInstallationId()
    if (installationResult.isFailure()) {
      return installationResult.forwardFailure()
    }

    const storedResult = await this.licensingStateRepository.readState()
    if (storedResult.isFailure()) {
      return storedResult.forwardFailure()
    }

    const stored = storedResult.success
    if (!stored) {
      return this.getStatus()
    }

    const apiResult = await this.licensingApiClient.refresh({
      activationKey: stored.licenseKey,
      installationId: installationResult.success,
    })

    if (apiResult.isFailure()) {
      const errorStatus = apiResult.failure.statusCode
      if (errorStatus === 401 || errorStatus === 403 || errorStatus === 404) {
        await this.licensingStateRepository.clearState()
        return this.getStatus()
      }
      return this.getStatus()
    }

    return this.persistEnvelopeAndEvaluate(
      stored.licenseKey,
      installationResult.success,
      apiResult.success,
    )
  }

  async deactivateLicense(): Promise<Either<AppError, LicensingStatusDTO>> {
    const installationResult = await this.getOrCreateInstallationId()
    if (installationResult.isFailure()) {
      return installationResult.forwardFailure()
    }

    const storedResult = await this.licensingStateRepository.readState()
    if (storedResult.isFailure()) {
      return storedResult.forwardFailure()
    }

    const stored = storedResult.success
    if (stored) {
      await this.licensingApiClient.deactivate({
        activationKey: stored.licenseKey,
        installationId: installationResult.success,
      })
    }

    const clearResult = await this.licensingStateRepository.clearState()
    if (clearResult.isFailure()) {
      return clearResult.forwardFailure()
    }

    return this.getStatus()
  }

  async downloadPlusPackage(
    addonId: string,
    version: string,
  ): Promise<Either<AppError, LicensingPlusDownloadResultDTO>> {
    const installationResult = await this.getOrCreateInstallationId()
    if (installationResult.isFailure()) {
      return installationResult.forwardFailure()
    }

    const storedResult = await this.licensingStateRepository.readState()
    if (storedResult.isFailure()) {
      return storedResult.forwardFailure()
    }

    const stored = storedResult.success
    if (!stored) {
      return Either.failure(
        AppError.Unauthorized('LICENCA_PLUS_NECESSARIA_PARA_DOWNLOAD'),
      )
    }

    const status = await this.buildStatusFromStored(
      stored,
      installationResult.success,
    )
    if (!status.isPlusActive) {
      return Either.failure(
        AppError.Unauthorized('LICENCA_PLUS_INATIVA_OU_EXPIRADA'),
      )
    }

    return this.licensingApiClient.downloadPlusAddonPackage({
      addonId,
      version,
      activationKey: stored.licenseKey,
      installationId: installationResult.success,
    })
  }
}
