import {
  AddonConnectionAuthenticator,
  IAddonAuthenticatorRegistry,
} from '@/contracts/core/IAddonConnectionAuthenticator'

export class AddonAuthenticatorRegistry implements IAddonAuthenticatorRegistry {
  private readonly authenticators = new Map<
    string,
    Map<string, AddonConnectionAuthenticator>
  >()

  public register(
    addonId: string,
    authenticator: AddonConnectionAuthenticator,
  ): void {
    let addonMap = this.authenticators.get(addonId)
    if (addonMap === undefined) {
      addonMap = new Map<string, AddonConnectionAuthenticator>()
      this.authenticators.set(addonId, addonMap)
    }
    addonMap.set(authenticator.authProfileId, authenticator)
  }

  public unregister(addonId: string, authProfileId: string): void {
    const addonMap = this.authenticators.get(addonId)
    if (addonMap === undefined) return
    addonMap.delete(authProfileId)
    if (addonMap.size === 0) {
      this.authenticators.delete(addonId)
    }
  }

  public getAuthenticator(
    addonId: string,
    authProfileId: string,
  ): AddonConnectionAuthenticator | undefined {
    const addonMap = this.authenticators.get(addonId)
    if (addonMap === undefined) return undefined
    return addonMap.get(authProfileId)
  }

  public getAuthenticatorsForAddon(
    addonId: string,
  ): readonly AddonConnectionAuthenticator[] {
    const addonMap = this.authenticators.get(addonId)
    if (addonMap === undefined) return []
    return Array.from(addonMap.values())
  }
}
