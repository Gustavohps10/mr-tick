import type { ConnectionProfileDescriptor } from '@mr-tick/domain'
import type { AppError, Either } from '@mr-tick/shared/helpers'

export interface IAddonConnectionProfilesResolver {
  getConnectionProfiles(
    addonId: string,
  ): Promise<Either<AppError, readonly ConnectionProfileDescriptor[]>>
}

export interface IAddonConnectionProfilesRegistry extends IAddonConnectionProfilesResolver {
  registerProfiles(
    addonId: string,
    profiles: readonly ConnectionProfileDescriptor[],
  ): void
  unregisterProfiles(addonId: string): void
}
