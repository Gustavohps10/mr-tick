import type { ConnectionProfileDescriptor } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'

import type { IAddonConnectionProfilesRegistry } from '@/contracts/core/IAddonConnectionProfilesResolver'
import type { AddonSettingsSchema } from '@/contracts/host/IHostBridge'

export class AddonConnectionProfilesResolver implements IAddonConnectionProfilesRegistry {
  private readonly schemasByAddon = new Map<
    string,
    Map<string, AddonSettingsSchema>
  >()

  private readonly profilesByAddon = new Map<
    string,
    readonly ConnectionProfileDescriptor[]
  >()

  public registerProfiles(
    addonId: string,
    profiles: readonly ConnectionProfileDescriptor[],
  ): void {
    this.schemasByAddon.delete(addonId)
    this.profilesByAddon.set(addonId, profiles)
  }

  public unregisterProfiles(addonId: string): void {
    this.schemasByAddon.delete(addonId)
    this.profilesByAddon.delete(addonId)
  }

  public registerSchema(
    addonId: string,
    connectionProfileId: string,
    schema: AddonSettingsSchema,
  ): Either<AppError, void> {
    const profiles = this.profilesByAddon.get(addonId)
    if (
      !profiles?.some(
        (profile) => profile.connectionProfileId === connectionProfileId,
      )
    )
      return Either.failure(AppError.NotFound('CONNECTION_PROFILE_NOT_FOUND'))
    let schemas = this.schemasByAddon.get(addonId)
    if (schemas === undefined) {
      schemas = new Map<string, AddonSettingsSchema>()
      this.schemasByAddon.set(addonId, schemas)
    }
    schemas.set(connectionProfileId, schema)
    return Either.success()
  }

  public unregisterSchema(addonId: string, connectionProfileId: string): void {
    this.schemasByAddon.get(addonId)?.delete(connectionProfileId)
  }

  public async getConnectionSchema(
    addonId: string,
    connectionProfileId: string,
  ): Promise<Either<AppError, AddonSettingsSchema>> {
    const schema = this.schemasByAddon.get(addonId)?.get(connectionProfileId)
    if (schema === undefined)
      return Either.failure(AppError.NotFound('CONNECTION_SCHEMA_NOT_FOUND'))
    return Either.success(schema)
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
