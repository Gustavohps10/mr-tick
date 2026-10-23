import type { AddonConnectionAuthenticator } from '@mr-tick/application'
import type { ConnectionProfileDescriptor } from '@mr-tick/domain'
import type { AppError, Either } from '@mr-tick/shared/helpers'

/** Requires the manifest capability `auth`; profiles are independent of datasources. */
export interface IAddonConnectionsContributionAPI {
  registerProfiles(
    profiles: readonly ConnectionProfileDescriptor[],
  ): Either<AppError, void>
  unregisterProfiles(): void
  registerAuthenticator(
    authenticator: AddonConnectionAuthenticator,
  ): Either<AppError, void>
  unregisterAuthenticator(authProfileId: string): void
}
