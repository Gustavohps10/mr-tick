import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  OFFLINE_AUTHORIZATION_WINDOW_MS,
  OfflineAuthorizationClaims,
  offlineAuthorizationClaimsSchema,
  PlusAccessPolicy,
} from './PlusAccessPolicy'

const now = 1790000000000
const claims: OfflineAuthorizationClaims = {
  formatVersion: 1,
  keyId: 'lic-test',
  licenseId: 'lic-one',
  installationId: 'installation-one',
  plan: 'plus',
  status: 'active',
  issuedAt: now - 1000,
  paidThrough: now + 30 * 86400000,
  offlineThrough: now + 86400000,
}

describe('PlusAccessPolicy formato real do Worker', () => {
  afterEach(() => vi.restoreAllMocks())
  it('autoriza plano Plus válido e corta no menor prazo pago/offline/7 dias', () => {
    expect(
      PlusAccessPolicy.evaluateClaims(claims, 'installation-one', now)
        .isPlusActive,
    ).toBe(true)
    expect(
      PlusAccessPolicy.evaluateClaims(
        { ...claims, paidThrough: now },
        'installation-one',
        now,
      ).state,
    ).toBe('expired')
    expect(
      PlusAccessPolicy.evaluateClaims(
        { ...claims, offlineThrough: now },
        'installation-one',
        now,
      ).state,
    ).toBe('expired')
    expect(
      PlusAccessPolicy.evaluateClaims(
        { ...claims, offlineThrough: now + 30 * 86400000 },
        'installation-one',
        claims.issuedAt + OFFLINE_AUTHORIZATION_WINDOW_MS,
      ).state,
    ).toBe('expired')
  })
  it('recusa identidade copiada, token futuro e revogação', () => {
    expect(
      PlusAccessPolicy.evaluateClaims(claims, 'other-installation', now)
        .isPlusActive,
    ).toBe(false)
    expect(
      PlusAccessPolicy.evaluateClaims(
        { ...claims, issuedAt: now + 1 },
        'installation-one',
        now,
      ).isPlusActive,
    ).toBe(false)
    expect(
      PlusAccessPolicy.evaluateClaims(
        { ...claims, status: 'revoked' },
        'installation-one',
        now,
      ).state,
    ).toBe('revoked')
  })
  it('somente release Free conhecido é livre; unknown/undefined exige Plus', () => {
    const free = PlusAccessPolicy.evaluateClaims(null, 'installation-one', now)
    const plus = PlusAccessPolicy.evaluateClaims(
      claims,
      'installation-one',
      now,
    )
    expect(PlusAccessPolicy.canInstallOrLoadAddon('free', free)).toBe(true)
    expect(PlusAccessPolicy.canInstallOrLoadAddon('unknown', free)).toBe(false)
    expect(PlusAccessPolicy.canInstallOrLoadAddon(undefined, free)).toBe(false)
    expect(PlusAccessPolicy.canInstallOrLoadAddon('plus', plus)).toBe(true)
    expect(PlusAccessPolicy.canInstallOrLoadAddon('unknown', plus)).toBe(true)
  })
  it('validação canônica rejeita plano/status/versão e datas legados', () => {
    expect(
      offlineAuthorizationClaimsSchema.safeParse({ ...claims, plan: 'free' })
        .success,
    ).toBe(false)
    expect(
      offlineAuthorizationClaimsSchema.safeParse({
        ...claims,
        status: 'trialing',
      }).success,
    ).toBe(false)
    expect(
      offlineAuthorizationClaimsSchema.safeParse({
        ...claims,
        formatVersion: 2,
      }).success,
    ).toBe(false)
    expect(
      offlineAuthorizationClaimsSchema.safeParse({
        ...claims,
        paidThrough: new Date().toISOString(),
      }).success,
    ).toBe(false)
  })
})
