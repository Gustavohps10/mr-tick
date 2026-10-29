import { EMPTY_HTTP_CONFIG } from '@mr-tick/adapters/contracts'
import {
  AddonAuthenticatorRegistry,
  AddonConnectionProfilesResolver,
  type IConnectionCredentialsVault,
  type ICredentialsVault,
  type ILocalRuntimeAPI,
  OAuthAttemptCoordinator,
} from '@mr-tick/application'

import {
  ElectronHttpClientFactory,
  NodeFetchTransport,
} from '../../../../adapters/ElectronHttpClient'
import {
  permissiveAddonAccessService,
  unavailableCore,
} from '../../core/addon-core-test-fixture'
import {
  emptyAddonCredentialsVault,
  emptyAddonSettingsRepository,
  emptyAddonStorageRepository,
  emptyWorkspaceReferenceRegistry,
} from '../../core/addon-workspace-reference-test-fixture'
import { AddonLoader } from '../AddonLoader'

export const unavailableRuntime: ILocalRuntimeAPI = {
  request: async () => ({
    ok: false,
    error: { messageKey: 'RUNTIME_UNAVAILABLE', statusCode: 503 },
  }),
}

export function createOAuthTestSetup(): {
  addonLoader: AddonLoader
  fakeCredentialsVault: ICredentialsVault & IConnectionCredentialsVault
} {
  const fakeCredentialsVault = emptyAddonCredentialsVault()

  const addonLoader = new AddonLoader(
    fakeCredentialsVault,
    unavailableRuntime,
    '1.4.0',
    () => unavailableCore,
    permissiveAddonAccessService,
    emptyWorkspaceReferenceRegistry,
    emptyAddonSettingsRepository,
    new AddonAuthenticatorRegistry(),
    new AddonConnectionProfilesResolver(),
    new OAuthAttemptCoordinator(),
    new ElectronHttpClientFactory(EMPTY_HTTP_CONFIG, new NodeFetchTransport()),
    emptyAddonStorageRepository,
  )

  return { addonLoader, fakeCredentialsVault }
}
