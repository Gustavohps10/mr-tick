import type { ConnectionProfileDescriptor } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'

import type { IAddonConnectionProfilesRegistry } from '@/contracts/core/IAddonConnectionProfilesResolver'

export class AddonConnectionProfilesResolver implements IAddonConnectionProfilesRegistry {
  private readonly profilesByAddon = new Map<
    string,
    readonly ConnectionProfileDescriptor[]
  >()

  public registerProfiles(
    addonId: string,
    profiles: readonly ConnectionProfileDescriptor[],
  ): void {
    this.profilesByAddon.set(addonId, profiles)
  }

  public unregisterProfiles(addonId: string): void {
    this.profilesByAddon.delete(addonId)
  }

  public async getConnectionProfiles(
    addonId: string,
  ): Promise<Either<AppError, readonly ConnectionProfileDescriptor[]>> {
    const profiles = this.profilesByAddon.get(addonId)
    if (profiles === undefined) {
      return Either.failure(
        AppError.NotFound('ADDON_CONNECTION_PROFILES_NOT_FOUND'),
      )
    }
    return Either.success(profiles)
  }
}
