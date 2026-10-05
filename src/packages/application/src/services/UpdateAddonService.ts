import {
  AppError,
  DEFAULT_MIN_API_VERSION,
  Either,
  isApiVersionCompatible,
} from '@mr-tick/shared/helpers'
import { IJobEvent } from '@mr-tick/shared/transport'

import {
  IAddonReloader,
  IAddonsFacade,
  IFileManager,
  IFileStorage,
  IUpdateAddonUseCase,
  UpdateAddonInput,
} from '@/contracts'

export class UpdateAddonService implements IUpdateAddonUseCase {
  constructor(
    private readonly fileStorage: IFileStorage,
    private readonly fileManager: IFileManager,
    private readonly addonsFacade: IAddonsFacade,
    private readonly addonReloader: IAddonReloader,
  ) {}

  public async execute(
    input: UpdateAddonInput,
    onProgress?: (event: IJobEvent) => void,
  ): Promise<Either<AppError, void>> {
    if (!input.addonId)
      return Either.failure(AppError.ValidationError('ADDON_ID_OBRIGATORIO'))

    if (!input.downloadUrl)
      return Either.failure(
        AppError.ValidationError('DOWNLOAD_URL_OBRIGATORIA'),
      )

    const installedResult = await this.addonsFacade.getInstalledById(
      input.addonId,
    )
    if (installedResult.isFailure())
      return Either.failure(AppError.NotFound('ADDON_NAO_INSTALADO'))

    const currentInstalled = installedResult.success
    const currentPath = currentInstalled.path
    const currentVersion = currentInstalled.version

    onProgress?.({ status: 'data', data: 'Baixando atualização...' })
    onProgress?.({ status: 'progress', value: 10 })

    const downloadResult = await this.addonsFacade.downloadFile(
      input.downloadUrl,
      (event) => {
        if (event.status !== 'progress') {
          onProgress?.(event)
          return
        }
        const scaled = 10 + Math.floor(event.value * 0.4)
        onProgress?.({ status: 'progress', value: scaled })
      },
    )

    if (downloadResult.isFailure()) return downloadResult.forwardFailure()

    onProgress?.({
      status: 'data',
      data: 'Extraindo e validando nova versão...',
    })
    onProgress?.({ status: 'progress', value: 55 })

    let extractedFiles
    try {
      extractedFiles = await this.fileManager.unzipInMemory(
        downloadResult.success,
      )
    } catch {
      return Either.failure(AppError.Internal('ERRO_AO_DESCOMPACTAR_ADDON'))
    }

    const manifestFile = extractedFiles.find(
      (file) => file.name === 'manifest.yaml' || file.name === 'manifest.yml',
    )
    if (!manifestFile)
      return Either.failure(AppError.NotFound('MANIFEST_NAO_ENCONTRADO'))

    const manifestResult = await this.addonsFacade.parseManifest(
      manifestFile.content,
    )
    if (manifestResult.isFailure()) return manifestResult.forwardFailure()

    const newManifest = manifestResult.success
    if (newManifest.id !== input.addonId)
      return Either.failure(AppError.ValidationError('ADDON_ID_INCOMPATIVEL'))

    if (newManifest.requiredApiVersion) {
      const hostSdkVersion = this.addonReloader.getHostSdkVersion()
      const isCompatible = isApiVersionCompatible(
        newManifest.requiredApiVersion,
        hostSdkVersion,
      )
      if (!isCompatible)
        return Either.failure(
          AppError.ValidationError('VERSAO_INCOMPATIVEL_COM_HOST'),
        )
    }

    onProgress?.({
      status: 'data',
      data: 'Criando backup e desativando versão anterior...',
    })
    onProgress?.({ status: 'progress', value: 65 })

    const backupResult = await this.addonsFacade.backupAddon(
      input.addonId,
      currentVersion,
    )
    if (backupResult.isFailure()) return backupResult.forwardFailure()

    const backupPath = backupResult.success

    await this.addonReloader.deactivateAddon(input.addonId)

    const newVersion = newManifest.version || DEFAULT_MIN_API_VERSION
    const newFolderPath = `./addons/${input.addonId}/${newVersion}`

    onProgress?.({ status: 'data', data: 'Instalando novos arquivos...' })
    onProgress?.({ status: 'progress', value: 75 })

    const totalFiles = extractedFiles.length
    for (let i = 0; i < totalFiles; i++) {
      const file = extractedFiles[i]
      const finalPath = `${newFolderPath}/${file.name}`
      try {
        await this.fileStorage.write(finalPath, file.content)
      } catch {
        await this.rollback(input.addonId, backupPath, currentPath)
        return Either.failure(
          AppError.Internal('FALHA_AO_GRAVAR_ARQUIVOS_ATUALIZACAO'),
        )
      }
      const fileProgress = 75 + Math.floor(((i + 1) / totalFiles) * 15)
      onProgress?.({ status: 'progress', value: fileProgress })
    }

    onProgress?.({ status: 'data', data: 'Ativando nova versão...' })
    onProgress?.({ status: 'progress', value: 92 })

    let activated = false
    try {
      activated = await this.addonReloader.loadAndActivateFromDisk(
        input.addonId,
        newFolderPath,
      )
    } catch {
      activated = false
    }

    if (!activated) {
      await this.rollback(input.addonId, backupPath, currentPath)
      return Either.failure(AppError.Internal('FALHA_AO_ATIVAR_NOVA_VERSAO'))
    }

    await this.addonsFacade.removeAddonBackup(backupPath)
    if (newVersion !== currentVersion) {
      await this.addonsFacade.uninstallAddon(input.addonId, currentVersion)
    }

    onProgress?.({ status: 'data', data: 'Atualização concluída com sucesso.' })
    onProgress?.({ status: 'progress', value: 100 })

    return Either.success()
  }

  private async rollback(
    addonId: string,
    backupPath: string,
    currentPath: string,
  ): Promise<void> {
    await this.addonsFacade.restoreAddonBackup(addonId, backupPath)
    await this.addonReloader.loadAndActivateFromDisk(addonId, currentPath)
    await this.addonsFacade.removeAddonBackup(backupPath)
  }
}
