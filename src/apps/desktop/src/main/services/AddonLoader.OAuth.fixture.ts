import {
  AddonAuthenticatorRegistry,
  AddonConnectionProfilesResolver,
  type IConnectionCredentialsVault,
  type ICredentialsVault,
  type ILocalRuntimeAPI,
  OAuthAttemptCoordinator,
} from '@mr-tick/application'

import {
  permissiveAddonAccessService,
  unavailableCore,
} from './addon-core-test-fixture'
import {
  emptyAddonCredentialsVault,
  emptyAddonSettingsRepository,
  emptyWorkspaceReferenceRegistry,
} from './addon-workspace-reference-test-fixture'
import { AddonLoader } from './AddonLoader'

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
  )

  return { addonLoader, fakeCredentialsVault }
}
