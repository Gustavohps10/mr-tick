export type LicensingStatusStateViewModel =
  'inactive' | 'active' | 'past_due_grace' | 'expired' | 'revoked'

export interface LicensingStatusViewModel {
  state: LicensingStatusStateViewModel
  tier: 'free' | 'plus'
  isPlusActive: boolean
  licenseKeyMasked?: string
  activationId?: string
  subscriptionStatus?: string
  currentPeriodEnd?: string
  graceUntil?: string
  offlineVerifyUntil?: string
  lastVerifiedAt?: string
  entitlements: string[]
}
