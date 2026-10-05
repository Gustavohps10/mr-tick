export interface IAddonReloader {
  getHostSdkVersion(): string
  deactivateAddon(addonId: string): Promise<void>
  loadAndActivateFromDisk(
    addonId: string,
    addonFolderPath: string,
  ): Promise<boolean>
}
