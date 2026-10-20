import type { AddonConnectionAuthenticator } from '@mr-tick/application'
import type { ConnectionProfileDescriptor } from '@mr-tick/domain'

export interface IAddonConnectionsContributionAPI {
  registerProfiles(profiles: readonly ConnectionProfileDescriptor[]): void
  unregisterProfiles(): void
  registerAuthenticator(authenticator: AddonConnectionAuthenticator): void
  unregisterAuthenticator(authProfileId: string): void
}
