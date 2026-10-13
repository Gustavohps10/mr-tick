import {
  AddonTier,
  OfflineAuthorizationClaims,
  PlusLicenseEvalState,
} from '@mr-tick/domain'

export interface LicensingActivationRequestDTO {
  activationKey: string
  installationId: string
  deviceLabel: string
}

export interface LicensingRefreshRequestDTO {
  activationKey: string
  installationId: string
}

export interface LicensingDeactivateRequestDTO {
  activationKey: string
  installationId: string
}

export interface LicensingPlusDownloadRequestDTO {
  addonId: string
  version: string
  activationKey: string
  installationId: string
}

export interface LicensingApiEnvelopeDTO {
  signedAuthorization: string
}

export interface LicensingPlusDownloadResultDTO {
  bytes: Uint8Array
  sha256: string
}

export interface StoredLicensingStateDTO {
  licenseKey: string
  installationId: string
  signedAuthorization: string
  lastVerifiedAt: string
}

export interface LicensingStatusDTO {
  state: PlusLicenseEvalState
  tier: AddonTier
  isPlusActive: boolean
  licenseKeyMasked?: string
  activationId?: string
  subscriptionStatus?: string
  currentPeriodEnd?: string
  graceUntil?: string
  offlineVerifyUntil?: string
  lastVerifiedAt?: string
  entitlements: string[]
  claims?: OfflineAuthorizationClaims
}
