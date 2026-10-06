import {
  AppError,
  compareSemVer,
  Either,
  isApiVersionCompatible,
  parseSemVer,
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

    const newVersion = newManifest.version
    const parsedNewVersion = parseSemVer(newVersion)
    const parsedCurrentVersion = parseSemVer(currentVersion)
    if (
      !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
        newVersion,
      ) ||
      !parsedNewVersion ||
      !parsedCurrentVersion ||
      compareSemVer(parsedNewVersion, parsedCurrentVersion) <= 0
    )
      return Either.failure(
        AppError.ValidationError('VERSAO_ATUALIZACAO_DEVE_SER_SUPERIOR'),
      )

    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(input.addonId) ||
      extractedFiles.some(
        (file) =>
          /^(?:[\\/]|[a-zA-Z]:)/.test(file.name) ||
          file.name.split(/[\\/]/).includes('..') ||
          file.name.includes(':'),
      )
    )
      return Either.failure(
        AppError.ValidationError('CAMINHO_ARQUIVO_ADDON_INVALIDO'),
      )

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
        const rollbackResult = await this.rollback(
          input.addonId,
          backupPath,
          currentPath,
          newVersion,
        )
        if (rollbackResult.isFailure()) return rollbackResult.forwardFailure()
        return Either.failure(
          AppError.Internal('FALHA_AO_GRAVAR_ARQUIVOS_ATUALIZACAO'),
        )
      }
      const fileProgress = 75 + Math.floor(((i + 1) / totalFiles) * 15)
      onProgress?.({ status: 'progress', value: fileProgress })
    }

    onProgress?.({ status: 'data', data: 'Ativando nova versão...' })
    onProgress?.({ status: 'progress', value: 92 })

    const writtenAddon = await this.addonsFacade.getInstalledById(
      input.addonId,
      newVersion,
    )
    if (writtenAddon.isFailure()) {
      const rollbackResult = await this.rollback(
        input.addonId,
        backupPath,
        currentPath,
        newVersion,
      )
      if (rollbackResult.isFailure()) return rollbackResult.forwardFailure()
      return writtenAddon.forwardFailure()
    }

    let activated = false
    try {
      activated = await this.addonReloader.loadAndActivateFromDisk(
        input.addonId,
        writtenAddon.success.path,
      )
    } catch {
      activated = false
    }

    if (!activated) {
      const rollbackResult = await this.rollback(
        input.addonId,
        backupPath,
        currentPath,
        newVersion,
      )
      if (rollbackResult.isFailure()) return rollbackResult.forwardFailure()
      return Either.failure(AppError.Internal('FALHA_AO_ATIVAR_NOVA_VERSAO'))
    }

    const removedOldVersion = await this.addonsFacade.uninstallAddon(
      input.addonId,
      currentVersion,
    )
    if (removedOldVersion.isSuccess()) {
      const removedBackup =
        await this.addonsFacade.removeAddonBackup(backupPath)
      if (removedBackup.isFailure())
        onProgress?.({
          status: 'data',
          data:
            'Nova versão ativada; não foi possível remover o backup: ' +
            removedBackup.failure.messageKey,
        })
    }
    if (removedOldVersion.isFailure())
      onProgress?.({
        status: 'data',
        data:
          'Nova versão ativada; backup preservado porque a limpeza da versão anterior falhou: ' +
          removedOldVersion.failure.messageKey,
      })

    onProgress?.({ status: 'data', data: 'Atualização concluída com sucesso.' })
    onProgress?.({ status: 'progress', value: 100 })

    return Either.success()
  }

  private async rollback(
    addonId: string,
    backupPath: string,
    currentPath: string,
    failedVersion: string,
  ): Promise<Either<AppError, void>> {
    await this.addonReloader.deactivateAddon(addonId)
    const restored = await this.addonsFacade.restoreAddonBackup(
      addonId,
      backupPath,
    )
    if (restored.isFailure()) return restored.forwardFailure()
    const reactivated = await this.addonReloader.loadAndActivateFromDisk(
      addonId,
      currentPath,
    )
    if (!reactivated)
      return Either.failure(
        AppError.Internal('FALHA_AO_REATIVAR_VERSAO_ANTERIOR'),
      )
    const removed = await this.addonsFacade.uninstallAddon(
      addonId,
      failedVersion,
    )
    if (removed.isFailure() && removed.failure.statusCode !== 404)
      return removed.forwardFailure()
    return this.addonsFacade.removeAddonBackup(backupPath)
  }
}
