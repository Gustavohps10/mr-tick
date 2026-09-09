import {
  AddonInstallerDTO,
  AddonManifestDTO,
  IAddonsFacade,
  IFileStorage,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { IJobEvent } from '@mr-tick/shared/transport'
import axios from 'axios'
import { promises as fs } from 'fs'
import yaml from 'js-yaml'
import { join, resolve } from 'path'

type RawPackage = {
  version?: string
  Version?: string
  requiredApiVersion?: string
  RequiredApiVersion?: string
  releaseDate?: string
  ReleaseDate?: string
  downloadUrl?: string
  DownloadUrl?: string
  changelog?: string[]
  Changelog?: string[]
}

type RawScreenshot = {
  url?: string
  caption?: string
}

type RawManifest = {
  id?: string
  AddonId?: string
  version?: string
  Version?: string
  name?: string
  Name?: string
  author?: string
  Author?: string
  creator?: string
  Creator?: string
  shortDescription?: string
  ShortDescription?: string
  description?: string
  Description?: string
  iconUrl?: string
  IconUrl?: string
  logo?: string
  sourceUrl?: string
  SourceUrl?: string
  homepage?: string
  Homepage?: string
  installerUrl?: string
  InstallerUrl?: string
  tags?: string[]
  Tags?: string[]
  category?: string
  Category?: string
  categories?: string[]
  Categories?: string[]
  screenshots?: RawScreenshot[]
  Screenshots?: RawScreenshot[]
  downloadUrl?: string
  DownloadUrl?: string
  requiredApiVersion?: string
  RequiredApiVersion?: string
  releaseDate?: string
  ReleaseDate?: string
  changelog?: string[]
  Changelog?: string[]
  packages?: RawPackage[]
  Packages?: RawPackage[]
}

type RawInstaller = {
  id?: string
  AddonId?: string
  packages?: RawPackage[]
  Packages?: RawPackage[]
}

interface IPathResolvableStorage {
  getAbsolutePath(filePath: string): string
}

function isPathResolvableStorage(
  storage: IFileStorage,
): storage is IFileStorage & IPathResolvableStorage {
  return (
    'getAbsolutePath' in storage &&
    typeof (storage as Partial<IPathResolvableStorage>).getAbsolutePath ===
      'function'
  )
}

export class AddonsFacade implements IAddonsFacade {
  constructor(private readonly fileStorage?: IFileStorage) {}

  private getAddonsBasePaths(): string[] {
    const paths: string[] = [resolve('./addons'), resolve('./storage/addons')]

    if (this.fileStorage && isPathResolvableStorage(this.fileStorage)) {
      const storageAddonsPath = this.fileStorage.getAbsolutePath('addons')
      if (storageAddonsPath && !paths.includes(storageAddonsPath)) {
        paths.push(storageAddonsPath)
      }
    }

    return paths
  }

  public async listAvailable(): Promise<Either<AppError, AddonManifestDTO[]>> {
    try {
      const primaryUrl =
        'https://mistertick.github.io/addons-manifest/index.json'
      const fallbackUrl =
        'https://addons-manifest.mistertick.workers.dev/index.json'

      let response
      try {
        response = await axios.get<unknown>(primaryUrl)
      } catch {
        response = await axios.get<unknown>(fallbackUrl)
      }

      const data = response.data

      if (Array.isArray(data)) {
        // Se o index.json já contém os objetos consolidados completos (Novo Formato - 1 única requisição!)
        if (data.length === 0) {
          return Either.success([])
        }

        if (typeof data[0] === 'object' && data[0] !== null) {
          const addons = data
            .map((item) => this.mapRawToDTO(item as RawManifest))
            .filter((item): item is AddonManifestDTO => item !== null)

          return Either.success(addons)
        }

        // Fallback legatário: se ainda for array de strings de arquivos yaml
        if (typeof data[0] === 'string') {
          const yamlFiles = data as string[]
          const addons: AddonManifestDTO[] = await Promise.all(
            yamlFiles.map(async (filename) => {
              const yamlUrl = `https://mistertick.github.io/addons-manifest/addonDatabase/dataSource/${filename}`
              const { data: rawYaml } = await axios.get(yamlUrl)
              const parsed = await this.parseManifest(rawYaml)
              if (parsed.isFailure()) throw parsed.failure
              return parsed.success
            }),
          )
          return Either.success(addons)
        }
      }

      return Either.success([])
    } catch {
      return Either.failure(AppError.NotFound('FAILED_TO_FETCH_ADDONS'))
    }
  }

  public async listInstalled(): Promise<Either<AppError, AddonManifestDTO[]>> {
    try {
      const searchDirs = this.getAddonsBasePaths()
      const manifestPaths: string[] = []

      for (const dir of searchDirs) {
        const found = await this.findManifestFiles(dir)
        manifestPaths.push(...found)
      }

      const installedAddons: AddonManifestDTO[] = []
      const seenIdsAndVersions = new Set<string>()

      for (const manifestPath of manifestPaths) {
        try {
          const content = await fs.readFile(manifestPath)
          const manifestResult = await this.parseManifest(content)
          if (manifestResult.isSuccess()) {
            const key = `${manifestResult.success.id}@${manifestResult.success.version}`
            if (seenIdsAndVersions.has(key)) continue
            seenIdsAndVersions.add(key)

            const addonFolder = join(manifestPath, '..')
            const addon = {
              ...manifestResult.success,
              installed: true,
              path: addonFolder,
            }
            const base64Logo =
              await this.getLocalIconBase64FromFolder(addonFolder)
            if (base64Logo) addon.logo = base64Logo
            installedAddons.push(addon)
          }
        } catch {
          continue
        }
      }

      return Either.success(installedAddons)
    } catch {
      return Either.failure(
        AppError.NotFound('FAILED_TO_LIST_INSTALLED_ADDONS'),
      )
    }
  }

  public async getInstalledById(
    addonId: string,
  ): Promise<Either<AppError, AddonManifestDTO>> {
    const result = await this.listInstalled()
    if (result.isFailure()) return result.forwardFailure()

    const addon = result.success.find((a: AddonManifestDTO) => a.id === addonId)
    if (!addon)
      return Either.failure(AppError.NotFound('LOCAL_ADDON_NOT_FOUND'))

    return Either.success(addon)
  }

  public async uninstallAddon(
    addonId: string,
    version?: string,
  ): Promise<Either<AppError, void>> {
    try {
      const searchDirs = this.getAddonsBasePaths()
      const manifestPaths: string[] = []

      for (const dir of searchDirs) {
        const found = await this.findManifestFiles(dir)
        manifestPaths.push(...found)
      }

      let removedCount = 0

      for (const manifestPath of manifestPaths) {
        try {
          const content = await fs.readFile(manifestPath)
          const manifestResult = await this.parseManifest(content)
          if (manifestResult.isSuccess()) {
            const matchesId = manifestResult.success.id === addonId
            const matchesVersion =
              !version || manifestResult.success.version === version

            if (matchesId && matchesVersion) {
              const targetFolder = join(manifestPath, '..')
              await fs.rm(targetFolder, { recursive: true, force: true })
              removedCount++
            }
          }
        } catch {
          continue
        }
      }

      if (removedCount === 0) {
        return Either.failure(
          AppError.NotFound('ADDON_INSTALADO_NAO_ENCONTRADO'),
        )
      }

      return Either.success()
    } catch {
      return Either.failure(AppError.Internal('ERRO_AO_DESINSTALAR_ADDON'))
    }
  }

  public async getInstaller(
    installerUrl: string,
  ): Promise<Either<AppError, AddonInstallerDTO>> {
    try {
      const { data: rawYaml } = await axios.get(installerUrl)
      return this.parseInstaller(rawYaml)
    } catch {
      return Either.failure(AppError.NotFound('FAILED_TO_FETCH_INSTALLER'))
    }
  }

  public async parseManifest(
    fileContent: Buffer | string,
  ): Promise<Either<AppError, AddonManifestDTO>> {
    try {
      const doc = yaml.load(fileContent.toString()) as RawManifest
      const dto = this.mapRawToDTO(doc)

      if (!dto) {
        return Either.failure(AppError.NotFound('ADDONID_NOT_FOUND'))
      }

      return Either.success(dto)
    } catch {
      return Either.failure(AppError.NotFound('FAILED_TO_PARSE_MANIFEST'))
    }
  }

  public async parseInstaller(
    fileContent: Buffer | string,
  ): Promise<Either<AppError, AddonInstallerDTO>> {
    try {
      const doc = yaml.load(fileContent.toString()) as RawInstaller
      const id = doc.id ?? doc.AddonId
      const rawPackages = doc.packages ?? doc.Packages ?? []

      if (!id)
        return Either.failure(AppError.ValidationError('INSTALLER_INVALID'))

      const installer: AddonInstallerDTO = {
        id,
        packages: rawPackages.map((pkg) => ({
          version: pkg.version ?? pkg.Version ?? '',
          requiredApiVersion:
            pkg.requiredApiVersion ?? pkg.RequiredApiVersion ?? '',
          releaseDate: pkg.releaseDate ?? pkg.ReleaseDate ?? '',
          downloadUrl: pkg.downloadUrl ?? pkg.DownloadUrl ?? '',
          changelog: pkg.changelog ?? pkg.Changelog ?? [],
        })),
      }

      return Either.success(installer)
    } catch {
      return Either.failure(AppError.NotFound('FAILED_TO_PARSE_INSTALLER'))
    }
  }

  private mapRawToDTO(doc: RawManifest): AddonManifestDTO | null {
    const id = doc.id ?? doc.AddonId
    if (!id) return null

    const category = doc.category ?? doc.Category
    const rawCategories = doc.categories ?? doc.Categories
    const categories: string[] = Array.isArray(rawCategories)
      ? rawCategories
      : category
        ? [category]
        : []

    const rawScreenshots = doc.screenshots ?? doc.Screenshots ?? []
    const screenshots = rawScreenshots.map((s) => ({
      url: s.url ?? '',
      caption: s.caption,
    }))

    const rawPackages = doc.packages ?? doc.Packages ?? []
    const packages = rawPackages.map((pkg) => ({
      version: pkg.version ?? pkg.Version ?? '',
      requiredApiVersion:
        pkg.requiredApiVersion ?? pkg.RequiredApiVersion ?? '',
      releaseDate: pkg.releaseDate ?? pkg.ReleaseDate ?? '',
      downloadUrl: pkg.downloadUrl ?? pkg.DownloadUrl ?? '',
      changelog: pkg.changelog ?? pkg.Changelog ?? [],
    }))

    return {
      id,
      version: doc.version ?? doc.Version ?? '',
      name: doc.name ?? doc.Name ?? '',
      creator: doc.author ?? doc.Author ?? doc.creator ?? doc.Creator ?? '',
      description:
        doc.shortDescription ??
        doc.ShortDescription ??
        doc.description ??
        doc.Description ??
        '',
      logo: doc.iconUrl ?? doc.IconUrl ?? doc.logo ?? '',
      sourceUrl: doc.sourceUrl ?? doc.SourceUrl ?? '',
      homepage: doc.homepage ?? doc.Homepage ?? '',
      tags: doc.tags ?? doc.Tags ?? [],
      category: category ?? categories[0] ?? '',
      categories,
      screenshots,
      installed: false,
      installerManifestUrl: doc.installerUrl ?? doc.InstallerUrl,
      downloadUrl: doc.downloadUrl ?? doc.DownloadUrl ?? '',
      requiredApiVersion:
        doc.requiredApiVersion ?? doc.RequiredApiVersion ?? '',
      releaseDate: doc.releaseDate ?? doc.ReleaseDate ?? '',
      changelog: doc.changelog ?? doc.Changelog ?? [],
      packages,
      path: '',
      downloads: 0,
      stars: 1,
    }
  }

  public async downloadFile(
    downloadUrl: string,
    onProgress?: (event: IJobEvent) => void,
  ): Promise<Either<AppError, Uint8Array>> {
    try {
      if (!downloadUrl || !downloadUrl.trim()) {
        return Either.failure(AppError.ValidationError('URL_DOWNLOAD_INVALIDA'))
      }

      onProgress?.({
        status: 'data',
        data: 'Conectando ao servidor de download...',
      })

      let lastLoggedPercent = -1

      const response = await axios.get<ArrayBuffer>(downloadUrl, {
        responseType: 'arraybuffer',
        maxRedirects: 10,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Mr-tickApp/1.0.0',
          Accept: 'application/octet-stream, application/zip, */*',
        },
        onDownloadProgress: (progressEvent) => {
          if (!onProgress) return

          const loaded = progressEvent.loaded || 0
          const total = progressEvent.total || loaded

          const percent =
            total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 100
          onProgress({ status: 'progress', value: percent })

          const loadedMB = (loaded / 1024 / 1024).toFixed(2)
          const totalMB = (total / 1024 / 1024).toFixed(2)

          if (percent % 10 === 0 && percent !== lastLoggedPercent) {
            lastLoggedPercent = percent

            onProgress({
              status: 'data',
              data: `Baixando: ${loadedMB} MB / ${totalMB} MB (${percent}%)`,
            })
          }
        },
      })

      if (!response.data || response.data.byteLength === 0) {
        return Either.failure(AppError.NotFound('ARQUIVO_BAIXADO_VAZIO'))
      }

      onProgress?.({ status: 'data', data: 'Download concluído com sucesso!' })
      return Either.success(new Uint8Array(response.data))
    } catch (error: any) {
      const errorDetail =
        error?.response?.status === 404
          ? 'Arquivo não encontrado no servidor de download (HTTP 404).'
          : error?.message || 'Falha ao baixar arquivo'

      console.error('[AddonsFacade.downloadFile Error]:', errorDetail, error)
      return Either.failure(AppError.NotFound(errorDetail))
    }
  }

  private async findManifestFiles(dir: string): Promise<string[]> {
    const manifestPaths: string[] = []

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        let isDirectory = entry.isDirectory()

        if (entry.isSymbolicLink()) {
          try {
            const stats = await fs.stat(fullPath)
            isDirectory = stats.isDirectory()
          } catch {
            isDirectory = false
          }
        }

        if (isDirectory) {
          const nested = await this.findManifestFiles(fullPath)
          manifestPaths.push(...nested)
        }

        const isManifestFile =
          entry.name === 'manifest.yaml' || entry.name === 'manifest.yml'

        if (isManifestFile) {
          manifestPaths.push(fullPath)
        }
      }
    } catch {
      // Diretório não existe
    }

    return manifestPaths
  }

  private async getLocalIconBase64FromFolder(
    folderPath: string,
  ): Promise<string | null> {
    const possibleIcons = ['icon.png', 'icon.jpg', 'icon.jpeg', 'icon.svg']
    for (const iconName of possibleIcons) {
      const iconPath = join(folderPath, iconName)
      try {
        const file = await fs.readFile(iconPath)
        const ext = iconName.split('.').pop()
        return `data:image/${ext};base64,${file.toString('base64')}`
      } catch {
        continue
      }
    }
    return null
  }
}
