import { AppError, Either } from '@mr-tick/shared/helpers'
import { IJobEvent } from '@mr-tick/shared/transport'

import { AddonInstallerDTO } from '@/dtos/AddonInstallerDTO'
import { AddonManifestDTO } from '@/dtos/AddonManifestDTO'

export interface IAddonsFacade {
  listAvailable(): Promise<Either<AppError, AddonManifestDTO[]>>
  listInstalled(): Promise<Either<AppError, AddonManifestDTO[]>>

  getInstalledById(addonId: string): Promise<Either<AppError, AddonManifestDTO>>
  getInstaller(
    installerUrl: string,
  ): Promise<Either<AppError, AddonInstallerDTO>>

  parseManifest(
    fileContent: Buffer | string,
  ): Promise<Either<AppError, AddonManifestDTO>>
  parseInstaller(
    fileContent: Buffer | string,
  ): Promise<Either<AppError, AddonInstallerDTO>>

  downloadFile(
    downloadUrl: string,
    onProgress?: (event: IJobEvent) => void,
  ): Promise<Either<AppError, Uint8Array>>

  uninstallAddon(
    addonId: string,
    version?: string,
  ): Promise<Either<AppError, void>>

  checkUpdates(
    installed: AddonManifestDTO[],
    available: AddonManifestDTO[],
    hostSdkVersion?: string,
  ): AddonManifestDTO[]

  backupAddon(
    addonId: string,
    version?: string,
  ): Promise<Either<AppError, string>>

  restoreAddonBackup(
    addonId: string,
    backupPath: string,
  ): Promise<Either<AppError, void>>

  removeAddonBackup(backupPath: string): Promise<Either<AppError, void>>
}
