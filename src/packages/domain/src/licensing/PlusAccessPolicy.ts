import { z } from 'zod'

export type AddonTier = 'free' | 'plus'
export type AddonExecutionClassification = 'free' | 'plus' | 'unknown'
export const OFFLINE_AUTHORIZATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export const offlineAuthorizationClaimsSchema = z
  .object({
    formatVersion: z.literal(1),
    keyId: z.string().min(1),
    licenseId: z.string().min(1),
    installationId: z.string().min(1),
    plan: z.literal('plus'),
    status: z.enum(['active', 'revoked']),
    issuedAt: z.number().int().positive().max(8640000000000000).finite(),
    paidThrough: z.number().int().positive().max(8640000000000000).finite(),
    offlineThrough: z.number().int().positive().max(8640000000000000).finite(),
  })
  .strict()

export type OfflineAuthorizationClaims = z.infer<
  typeof offlineAuthorizationClaimsSchema
>
export type PlusLicenseEvalState =
  'inactive' | 'active' | 'past_due_grace' | 'expired' | 'revoked'

export interface PlusLicenseEvaluation {
  state: PlusLicenseEvalState
  tier: AddonTier
  isPlusActive: boolean
  entitlements: string[]
}

export class PlusAccessPolicy {
  static evaluateClaims(
    claims: OfflineAuthorizationClaims | null,
    expectedInstallationId: string,
    nowMs: number,
  ): PlusLicenseEvaluation {
    if (!claims)
      return {
        state: 'inactive',
        tier: 'free',
        isPlusActive: false,
        entitlements: [],
      }
    if (
      claims.formatVersion !== 1 ||
      claims.plan !== 'plus' ||
      claims.installationId !== expectedInstallationId ||
      claims.status !== 'active' ||
      !Number.isFinite(nowMs) ||
      !Number.isFinite(claims.issuedAt) ||
      claims.issuedAt <= 0 ||
      claims.issuedAt > nowMs
    )
      return {
        state: 'revoked',
        tier: 'free',
        isPlusActive: false,
        entitlements: [],
      }
    const offlineUntil = Math.min(
      claims.offlineThrough,
      claims.paidThrough,
      claims.issuedAt + OFFLINE_AUTHORIZATION_WINDOW_MS,
    )
    if (!Number.isFinite(offlineUntil) || offlineUntil <= nowMs)
      return {
        state: 'expired',
        tier: 'free',
        isPlusActive: false,
        entitlements: [],
      }
    return {
      state: 'active',
      tier: 'plus',
      isPlusActive: true,
      entitlements: ['plus_addons', 'plus_updates'],
    }
  }

  static canInstallOrLoadAddon(
    classification: AddonExecutionClassification | undefined,
    evaluation: PlusLicenseEvaluation,
  ): boolean {
    if (classification === 'free') return true
    return (
      evaluation.isPlusActive &&
      evaluation.tier === 'plus' &&
      evaluation.entitlements.includes('plus_addons')
    )
  }
}
