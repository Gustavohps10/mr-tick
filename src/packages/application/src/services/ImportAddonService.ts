import {
  AppError,
  DEFAULT_MIN_API_VERSION,
  Either,
} from '@mr-tick/shared/helpers'
import { IJobEvent } from '@mr-tick/shared/transport'

import { FileData, IFileManager, IFileStorage } from '@/contracts'
import { IAddonsFacade } from '@/contracts/facades'
import { IImportAddonUseCase } from '@/contracts/use-cases'
import { IAddonAccessService } from '@/contracts/use-cases/IAddonAccessService'

export class ImportAddonService implements IImportAddonUseCase {
  constructor(
    private readonly fileStorage: IFileStorage,
    private readonly fileManager: IFileManager,
    private readonly addonsFacade: IAddonsFacade,
    private readonly addonAccessService: IAddonAccessService,
  ) {}

  async execute(
    fileData: FileData,
    onProgress?: (event: IJobEvent) => void,
  ): Promise<Either<AppError, void>> {
    try {
      onProgress?.({
        status: 'data',
        data: 'Descompactando pacote do addon...',
      })
      onProgress?.({ status: 'progress', value: 10 })

      const extractedFiles = await this.fileManager.unzipInMemory(fileData)

      onProgress?.({
        status: 'data',
        data: 'Validando arquivo de manifesto - manifest.yaml',
      })
      onProgress?.({ status: 'progress', value: 20 })

      const manifestFile = extractedFiles.find(
        (e) => e.name === 'manifest.yaml' || e.name === 'manifest.yml',
      )

      if (!manifestFile) {
        return Either.failure(AppError.NotFound('MANIFEST_NAO_ENCONTRADO'))
      }

      const manifestContentResult = await this.addonsFacade.parseManifest(
        manifestFile.content,
      )

      if (manifestContentResult.isFailure()) {
        return manifestContentResult.forwardFailure()
      }

      const manifest = manifestContentResult.success
      const authorized = await this.addonAccessService.authorizeFiles(
        extractedFiles,
        manifest.id,
        manifest.version,
        'install',
      )
      if (authorized.isFailure()) return authorized.forwardFailure()

      const addonId = manifest.id
      let version = DEFAULT_MIN_API_VERSION
      if (manifest.version && manifest.version.trim().length > 0) {
        version = manifest.version
      }

      if (!addonId) {
        return Either.failure(AppError.NotFound('ADDONID_NAO_ENCONTRADO'))
      }

      onProgress?.({
        status: 'data',
        data: `Instalando arquivos em /addons/${addonId}/${version}...`,
      })

      const totalFiles = extractedFiles.length

      for (let i = 0; i < totalFiles; i++) {
        const file = extractedFiles[i]
        const finalPath = `./addons/${addonId}/${version}/${file.name}`

        await this.fileStorage.write(finalPath, file.content)

        const fileProgress = 20 + Math.floor(((i + 1) / totalFiles) * 75)
        onProgress?.({ status: 'progress', value: fileProgress })
      }

      onProgress?.({ status: 'data', data: 'Instalação concluída.' })
      onProgress?.({ status: 'progress', value: 100 })

      return Either.success()
    } catch {
      return Either.failure(AppError.NotFound('ERRO_AO_IMPORTAR_ADDON'))
    }
  }
}
