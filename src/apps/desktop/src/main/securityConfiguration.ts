import {
  IAddonPackageVerificationConfiguration,
  OfflineAuthorizationVerificationConfiguration,
} from '@mr-tick/adapters/auth'
import { LicensingApiConfiguration } from '@mr-tick/adapters/http'

// Trust anchors are distributed with the host, never supplied by an addon.
export const offlineAuthorizationVerificationConfiguration: OfflineAuthorizationVerificationConfiguration =
  {
    publicKeys: [
      {
        keyId: 'lic-2026-01',
        publicKeyJwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'aUIFpXKS5jDp5fHYIRy7TYOO07sK9ZB-i8eGmjcsAHQ',
        },
      },
    ],
  }
export const addonPackageVerificationConfiguration: IAddonPackageVerificationConfiguration =
  {
    publicKeys: [
      {
        keyId: 'cat-2026-01',
        publicKeyJwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'FQu7vY7EJtrZarydSZRX-UMOsMszVptn5G_e2QzSCgo',
        },
      },
    ],
  }
export const licensingApiConfiguration: LicensingApiConfiguration = {
  baseUrl: 'https://mistertick-api.mistertick.workers.dev',
}
