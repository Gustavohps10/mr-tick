import { OfflineAuthorizationClaims } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { describe, expect, it, vi } from 'vitest'

import {
  ILicensingApiClient,
  ILicensingStateRepository,
  IOfflineAuthorizationVerifier,
} from '@/contracts'
import { StoredLicensingStateDTO } from '@/dtos/LicensingDTO'

import { LicensingService } from './LicensingService'

function createInMemoryStateRepository(): ILicensingStateRepository {
  let seed: string | null = null
  let state: StoredLicensingStateDTO | null = null
  return {
    getInstallationSeed: vi.fn(async () => Either.success(seed)),
    saveInstallationSeed: vi.fn(async (nextSeed: string) => {
      seed = nextSeed
      return Either.success()
    }),
    readState: vi.fn(async () => Either.success(state)),
    saveState: vi.fn(async (nextState: StoredLicensingStateDTO) => {
      state = nextState
      return Either.success()
    }),
    clearState: vi.fn(async () => {
      state = null
      return Either.success()
    }),
  }
}

describe('LicensingService', () => {
  it('ativa licença, verifica assinatura offline e libera download de addon Plus', async () => {
    const stateRepository = createInMemoryStateRepository()
    let capturedInstallationId = ''

    const apiClient: ILicensingApiClient = {
      activate: vi.fn(async (input) => {
        capturedInstallationId = input.installationId
        return Either.success({
          signedAuthorization: 'payload.signature',
        })
      }),
      refresh: vi.fn(async () => Either.failure(AppError.Internal('NOT_USED'))),
      deactivate: vi.fn(async () => Either.success()),
      downloadPlusAddonPackage: vi.fn(async () =>
        Either.success({
          bytes: new Uint8Array([80, 75, 3, 4]),
          sha256:
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        }),
      ),
    }

    const verifier: IOfflineAuthorizationVerifier = {
      verify: vi.fn(async () => {
        const now = Date.now()
        const claims: OfflineAuthorizationClaims = {
          formatVersion: 1,
          keyId: 'lic-2026-01',
          licenseId: 'lic-1',
          installationId: capturedInstallationId,
          plan: 'plus',
          status: 'active',
          issuedAt: now - 1000,
          paidThrough: now + 30 * 86400000,
          offlineThrough: now + 7 * 86400000,
        }
        return Either.success(claims)
      }),
    }

    const service = new LicensingService(stateRepository, apiClient, verifier)

    const initial = await service.getStatus()
    expect(initial.isSuccess()).toBe(true)
    expect(initial.success.isPlusActive).toBe(false)

    const activated = await service.activateLicense(
      'MRTICK-ABCD-EFGH-IJKL-MNOP',
    )
    expect(activated.isSuccess()).toBe(true)
    expect(activated.success.isPlusActive).toBe(true)
    expect(activated.success.tier).toBe('plus')
    expect(activated.success.licenseKeyMasked).toBe('MRTICK--****-****-MNOP')

    const download = await service.downloadPlusPackage(
      'mistertick-discord',
      '0.1.0',
    )
    expect(download.isSuccess()).toBe(true)
    expect(download.success.bytes.byteLength).toBe(4)

    const deactivated = await service.deactivateLicense()
    expect(deactivated.isSuccess()).toBe(true)
    expect(deactivated.success.isPlusActive).toBe(false)
  })
})
