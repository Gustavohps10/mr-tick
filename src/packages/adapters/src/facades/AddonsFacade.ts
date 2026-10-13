import {
  AddonInstallerDTO,
  AddonManifestDTO,
  AddonPackageDTO,
  AddonScreenshotDTO,
  IAddonsFacade,
  IFileStorage,
  ILicensingFacade,
} from '@mr-tick/application'
import { AddonTier } from '@mr-tick/domain'
import {
  AppError,
  compareSemVer,
  DEFAULT_MIN_API_VERSION,
  Either,
  hasProperty,
  isApiVersionCompatible,
  isArray,
  isFunction,
  isNonEmptyString,
  isNumber,
  isRecord,
  isString,
  parseSemVer,
} from '@mr-tick/shared/helpers'
import { IJobEvent } from '@mr-tick/shared/transport'
import axios from 'axios'
import crypto from 'crypto'
import { promises as fs } from 'fs'
import yaml from 'js-yaml'
import { join, resolve } from 'path'

interface IPathResolvableStorage {
  getAbsolutePath(filePath: string): string
}

function isPathResolvableStorage(
  storage: IFileStorage,
): storage is IFileStorage & IPathResolvableStorage {
  return (
    hasProperty(storage, 'getAbsolutePath') &&
    isFunction(storage.getAbsolutePath)
  )
}

function pickFirstString(
  record: object,
  keys: string[],
  fallback: string,
): string {
  for (const key of keys) {
    if (hasProperty(record, key)) {
      const val = record[key]
      if (isNonEmptyString(val)) return val
    }
  }
  return fallback
}

function pickOptionalString(
  record: object,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    if (hasProperty(record, key)) {
      const val = record[key]
      if (isNonEmptyString(val)) return val
    }
  }
  return undefined
}

function pickOptionalNumber(
  record: object,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    if (hasProperty(record, key)) {
      const val = record[key]
      if (isNumber(val)) return val
    }
  }
  return undefined
}

function pickStringArray(record: object, keys: string[]): string[] {
  for (const key of keys) {
    if (hasProperty(record, key)) {
      const val = record[key]
      if (isArray(val)) {
        const items: string[] = []
        for (const item of val) {
          if (isString(item)) items.push(item)
        }
        return items
      }
    }
  }
  return []
}

function parseAddonTier(record: object): AddonTier {
  const raw = pickOptionalString(record, ['tier', 'Tier'])
  if (raw === 'plus') return 'plus'
  return 'free'
}

function parseScreenshots(record: object): AddonScreenshotDTO[] {
  let listSource: object | undefined = undefined
  if (hasProperty(record, 'screenshots') && isArray(record.screenshots)) {
    listSource = record.screenshots
  }
  if (
    !listSource &&
    hasProperty(record, 'Screenshots') &&
    isArray(record.Screenshots)
  ) {
    listSource = record.Screenshots
  }
  if (!isArray(listSource)) return []

  const result: AddonScreenshotDTO[] = []
  for (const item of listSource) {
    if (isRecord(item)) {
      const url = pickFirstString(item, ['url', 'Url'], '')
      const caption = pickOptionalString(item, ['caption', 'Caption'])
      result.push({ url, caption })
    }
  }
  return result
}

function parsePackages(record: object): AddonPackageDTO[] {
  let listSource: object | undefined = undefined
  if (hasProperty(record, 'packages') && isArray(record.packages)) {
    listSource = record.packages
  }
  if (
    !listSource &&
    hasProperty(record, 'Packages') &&
    isArray(record.Packages)
  ) {
    listSource = record.Packages
  }
  if (!isArray(listSource)) return []

  const result: AddonPackageDTO[] = []
  for (const item of listSource) {
    if (isRecord(item)) {
      result.push({
        version: pickFirstString(
          item,
          ['version', 'Version'],
          DEFAULT_MIN_API_VERSION,
        ),
        requiredApiVersion: pickFirstString(
          item,
          ['requiredApiVersion', 'RequiredApiVersion'],
          DEFAULT_MIN_API_VERSION,
        ),
        releaseDate: pickFirstString(item, ['releaseDate', 'ReleaseDate'], ''),
        downloadUrl: pickFirstString(item, ['downloadUrl', 'DownloadUrl'], ''),
        sha256: pickOptionalString(item, ['sha256', 'Sha256']),
        size: pickOptionalNumber(item, ['size', 'Size']),
        changelog: pickStringArray(item, ['changelog', 'Changelog']),
      })
    }
  }
  return result
}

function extractPlusDownloadRouteParams(
  downloadUrl: string,
): { addonId: string; version: string } | null {
  const match =
    /^https:\/\/mistertick-api\.mistertick\.workers\.dev\/catalog\/(?:plus-addons|addons)\/([^/]+)\/versions\/([^/]+)\/download(?:\.tladdon)?$/i.exec(
      downloadUrl.trim(),
    )
  if (!match || !match[1] || !match[2]) return null
  return {
    addonId: decodeURIComponent(match[1]),
    version: decodeURIComponent(match[2]),
  }
}

function verifyPackageSha256(
  bytes: Uint8Array,
  expectedSha256: string | undefined,
): boolean {
  if (!expectedSha256 || expectedSha256.trim().length === 0) return true
  const computed = crypto
    .createHash('sha256')
    .update(bytes)
    .digest('hex')
    .toLowerCase()
  return computed === expectedSha256.trim().toLowerCase()
}

export class AddonsFacade implements IAddonsFacade {
  constructor(
    private readonly fileStorage: IFileStorage,
    private readonly licensingFacade: ILicensingFacade,
  ) {}

  private getAddonsBasePaths(): string[] {
    const paths: string[] = [resolve('./addons'), resolve('./storage/addons')]

    if (isPathResolvableStorage(this.fileStorage)) {
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
        response = await axios.get<object[]>(primaryUrl)
      } catch {
        response = await axios.get<object[]>(fallbackUrl)
      }

      const data: object = response.data

      if (isArray(data)) {
        if (data.length === 0) {
          return Either.success([])
        }

        const firstItem = data[0]
        if (isRecord(firstItem)) {
          const addons: AddonManifestDTO[] = []
          for (const item of data) {
            if (isRecord(item)) {
              const mapped = this.mapRecordToDTO(item)
              if (mapped) addons.push(mapped)
            }
          }
          return Either.success(addons)
        }

        if (isString(firstItem)) {
          const yamlFiles: string[] = []
          for (const item of data) {
            if (isString(item)) yamlFiles.push(item)
          }
          const addons: AddonManifestDTO[] = await Promise.all(
            yamlFiles.map(async (filename) => {
              const yamlUrl = `https://mistertick.github.io/addons-manifest/addonDatabase/dataSource/${filename}`
              const { data: rawYaml } = await axios.get<string>(yamlUrl)
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
            const addon: AddonManifestDTO = {
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

      installedAddons.sort((left, right) => {
        const leftVersion = parseSemVer(left.version)
        const rightVersion = parseSemVer(right.version)
        if (!leftVersion && !rightVersion) return 0
        if (!leftVersion) return 1
        if (!rightVersion) return -1
        return compareSemVer(rightVersion, leftVersion)
      })
      return Either.success(installedAddons)
    } catch {
      return Either.failure(
        AppError.NotFound('FAILED_TO_LIST_INSTALLED_ADDONS'),
      )
    }
  }

  public async getInstalledById(
    addonId: string,
    version?: string,
  ): Promise<Either<AppError, AddonManifestDTO>> {
    const result = await this.listInstalled()
    if (result.isFailure()) return result.forwardFailure()

    const matches = result.success.filter(
      (item) => item.id === addonId && (!version || item.version === version),
    )
    const addon = matches.reduce<AddonManifestDTO | undefined>(
      (latest, item) => {
        if (!latest) return item
        const candidateVersion = parseSemVer(item.version)
        const latestVersion = parseSemVer(latest.version)
        if (
          candidateVersion &&
          (!latestVersion || compareSemVer(candidateVersion, latestVersion) > 0)
        )
          return item
        return latest
      },
      undefined,
    )
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
              if (await this.isLinkedAddonFolder(targetFolder)) continue
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

  public async backupAddon(
    addonId: string,
    version?: string,
  ): Promise<Either<AppError, string>> {
    try {
      const installedResult = await this.listInstalled()
      if (installedResult.isFailure()) return installedResult.forwardFailure()

      const targetAddon = installedResult.success.find((item) => {
        const matchesId = item.id === addonId
        const matchesVersion = !version || item.version === version
        return matchesId && matchesVersion
      })

      if (!targetAddon || !targetAddon.path) {
        return Either.failure(
          AppError.NotFound('ADDON_INSTALADO_NAO_ENCONTRADO'),
        )
      }

      if (await this.isLinkedAddonFolder(targetAddon.path))
        return Either.failure(
          AppError.ValidationError(
            'Addon vinculado para desenvolvimento: instale uma cópia pelo catálogo para permitir atualizações.',
          ),
        )
      const backupPath = `${targetAddon.path}.backup`
      await fs.cp(targetAddon.path, backupPath, {
        recursive: true,
        force: true,
      })

      return Either.success(backupPath)
    } catch {
      return Either.failure(AppError.Internal('ERRO_AO_CRIAR_BACKUP_ADDON'))
    }
  }

  public async restoreAddonBackup(
    addonId: string,
    backupPath: string,
  ): Promise<Either<AppError, void>> {
    try {
      if (!addonId) {
        return Either.failure(AppError.ValidationError('ADDON_ID_OBRIGATORIO'))
      }
      try {
        await fs.access(backupPath)
      } catch {
        return Either.failure(AppError.NotFound('BACKUP_NAO_ENCONTRADO'))
      }

      let targetFolder = backupPath
      if (backupPath.endsWith('.backup')) {
        targetFolder = backupPath.slice(0, -7)
      }

      try {
        await fs.rm(targetFolder, { recursive: true, force: true })
      } catch {
        // Silencia caso diretório não exista
      }

      await fs.cp(backupPath, targetFolder, {
        recursive: true,
        force: true,
      })

      return Either.success()
    } catch {
      return Either.failure(AppError.Internal('ERRO_AO_RESTAURAR_BACKUP_ADDON'))
    }
  }

  public async removeAddonBackup(
    backupPath: string,
  ): Promise<Either<AppError, void>> {
    try {
      await fs.rm(backupPath, { recursive: true, force: true })
      return Either.success()
    } catch {
      return Either.failure(AppError.Internal('ERRO_AO_REMOVER_BACKUP_ADDON'))
    }
  }

  public async getInstaller(
    installerUrl: string,
  ): Promise<Either<AppError, AddonInstallerDTO>> {
    try {
      const { data: rawYaml } = await axios.get<string>(installerUrl)
      return this.parseInstaller(rawYaml)
    } catch {
      return Either.failure(AppError.NotFound('FAILED_TO_FETCH_INSTALLER'))
    }
  }

  public async parseManifest(
    fileContent: Buffer | string,
  ): Promise<Either<AppError, AddonManifestDTO>> {
    try {
      const rawDoc = yaml.load(fileContent.toString())
      if (!isRecord(rawDoc)) {
        return Either.failure(AppError.NotFound('ADDONID_NOT_FOUND'))
      }
      const dto = this.mapRecordToDTO(rawDoc)
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
      const rawDoc = yaml.load(fileContent.toString())
      if (!isRecord(rawDoc)) {
        return Either.failure(AppError.ValidationError('INSTALLER_INVALID'))
      }

      const id = pickOptionalString(rawDoc, ['id', 'AddonId'])
      if (!id) {
        return Either.failure(AppError.ValidationError('INSTALLER_INVALID'))
      }

      const packages = parsePackages(rawDoc)
      const installer: AddonInstallerDTO = {
        id,
        packages: packages.map((pkg) => {
          let requiredApiVersion = DEFAULT_MIN_API_VERSION
          if (pkg.requiredApiVersion) {
            requiredApiVersion = pkg.requiredApiVersion
          }
          let releaseDate = ''
          if (pkg.releaseDate) {
            releaseDate = pkg.releaseDate
          }
          let changelog: string[] = []
          if (pkg.changelog) {
            changelog = pkg.changelog
          }
          return {
            version: pkg.version,
            requiredApiVersion,
            releaseDate,
            downloadUrl: pkg.downloadUrl,
            changelog,
          }
        }),
      }

      return Either.success(installer)
    } catch {
      return Either.failure(AppError.NotFound('FAILED_TO_PARSE_INSTALLER'))
    }
  }

  private mapRecordToDTO(doc: object): AddonManifestDTO | null {
    const id = pickOptionalString(doc, ['id', 'AddonId'])
    if (!id) return null

    const category = pickOptionalString(doc, ['category', 'Category'])
    let categories = pickStringArray(doc, ['categories', 'Categories'])
    if (categories.length === 0 && category) {
      categories = [category]
    }

    let primaryCategory = ''
    if (category) {
      primaryCategory = category
    }
    if (!primaryCategory && categories[0]) {
      primaryCategory = categories[0]
    }

    const screenshots = parseScreenshots(doc)
    const packages = parsePackages(doc)
    const tier = parseAddonTier(doc)

    return {
      id,
      version: pickFirstString(
        doc,
        ['version', 'Version'],
        DEFAULT_MIN_API_VERSION,
      ),
      name: pickFirstString(doc, ['name', 'Name'], ''),
      creator: pickFirstString(
        doc,
        ['author', 'Author', 'creator', 'Creator'],
        '',
      ),
      description: pickFirstString(
        doc,
        ['shortDescription', 'ShortDescription', 'description', 'Description'],
        '',
      ),
      logo: pickFirstString(doc, ['iconUrl', 'IconUrl', 'logo'], ''),
      sourceUrl: pickFirstString(doc, ['sourceUrl', 'SourceUrl'], ''),
      homepage: pickFirstString(doc, ['homepage', 'Homepage'], ''),
      tags: pickStringArray(doc, ['tags', 'Tags']),
      category: primaryCategory,
      categories,
      screenshots,
      installed: false,
      tier,
      sha256: pickOptionalString(doc, ['sha256', 'Sha256']),
      size: pickOptionalNumber(doc, ['size', 'Size']),
      installerManifestUrl: pickOptionalString(doc, [
        'installerUrl',
        'InstallerUrl',
      ]),
      downloadUrl: pickFirstString(doc, ['downloadUrl', 'DownloadUrl'], ''),
      requiredApiVersion: pickFirstString(
        doc,
        ['requiredApiVersion', 'RequiredApiVersion'],
        DEFAULT_MIN_API_VERSION,
      ),
      releaseDate: pickFirstString(doc, ['releaseDate', 'ReleaseDate'], ''),
      changelog: pickStringArray(doc, ['changelog', 'Changelog']),
      packages,
      path: '',
      downloads: 0,
      stars: 1,
    }
  }

  public async downloadFile(
    downloadUrl: string,
    onProgress?: (event: IJobEvent) => void,
    expectedSha256?: string,
  ): Promise<Either<AppError, Uint8Array>> {
    try {
      if (!downloadUrl || !downloadUrl.trim()) {
        return Either.failure(AppError.ValidationError('URL_DOWNLOAD_INVALIDA'))
      }

      const plusParams = extractPlusDownloadRouteParams(downloadUrl)
      if (plusParams) {
        onProgress?.({
          status: 'data',
          data: 'Autenticando licença Plus e baixando pacote privado...',
        })
        onProgress?.({ status: 'progress', value: 25 })

        const plusDownload = await this.licensingFacade.downloadPlusPackage(
          plusParams.addonId,
          plusParams.version,
        )
        if (plusDownload.isFailure()) return plusDownload.forwardFailure()

        let shaToVerify = expectedSha256
        if (!shaToVerify && plusDownload.success.sha256) {
          shaToVerify = plusDownload.success.sha256
        }

        if (!verifyPackageSha256(plusDownload.success.bytes, shaToVerify)) {
          return Either.failure(
            AppError.ValidationError('INTEGRIDADE_SHA256_ADDON_INVALIDA'),
          )
        }

        onProgress?.({ status: 'progress', value: 100 })
        onProgress?.({
          status: 'data',
          data: 'Pacote Plus autenticado e verificado com sucesso!',
        })
        return Either.success(plusDownload.success.bytes)
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
          Accept: 'application/octet-stream, */*',
        },
        onDownloadProgress: (progressEvent) => {
          if (!onProgress) return

          let loaded = 0
          if (progressEvent.loaded) {
            loaded = progressEvent.loaded
          }
          let total = loaded
          if (progressEvent.total) {
            total = progressEvent.total
          }

          let percent = 100
          if (total > 0) {
            percent = Math.min(100, Math.floor((loaded / total) * 100))
          }
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

      const bytes = new Uint8Array(response.data)
      if (!verifyPackageSha256(bytes, expectedSha256)) {
        return Either.failure(
          AppError.ValidationError('INTEGRIDADE_SHA256_ADDON_INVALIDA'),
        )
      }

      onProgress?.({ status: 'data', data: 'Download concluído com sucesso!' })
      return Either.success(bytes)
    } catch (error) {
      let errorDetail = 'Falha ao baixar arquivo'
      if (isRecord(error)) {
        if (isRecord(error.response) && error.response.status === 404) {
          errorDetail =
            'Arquivo não encontrado no servidor de download (HTTP 404).'
        }
        if (
          errorDetail === 'Falha ao baixar arquivo' &&
          isNonEmptyString(error.message)
        ) {
          errorDetail = error.message
        }
      }

      console.error('[AddonsFacade.downloadFile Error]:', errorDetail, error)
      return Either.failure(AppError.NotFound(errorDetail))
    }
  }

  private async isLinkedAddonFolder(addonPath: string): Promise<boolean> {
    const actualPath = await fs.realpath(addonPath)
    const expectedPath = resolve(addonPath)
    if (process.platform === 'win32')
      return actualPath.toLowerCase() !== expectedPath.toLowerCase()
    return actualPath !== expectedPath
  }

  private async findManifestFiles(dir: string): Promise<string[]> {
    const manifestPaths: string[] = []

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.endsWith('.backup')) continue
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

  public checkUpdates(
    installed: AddonManifestDTO[],
    available: AddonManifestDTO[],
    hostSdkVersion?: string,
  ): AddonManifestDTO[] {
    const availableMap = new Map<string, AddonManifestDTO>()
    for (const item of available) {
      availableMap.set(item.id, item)
    }

    return installed.map((installedItem) => {
      const remote = availableMap.get(installedItem.id)
      if (!remote) return { ...installedItem, updateAvailable: false }

      const installedSemVer = parseSemVer(installedItem.version)
      const remoteSemVer = parseSemVer(remote.version)
      if (!installedSemVer || !remoteSemVer)
        return { ...installedItem, updateAvailable: false }

      if (compareSemVer(remoteSemVer, installedSemVer) <= 0)
        return { ...installedItem, updateAvailable: false }

      let activeHostVersion = DEFAULT_MIN_API_VERSION
      if (hostSdkVersion) {
        activeHostVersion = hostSdkVersion
      }

      const isCompatible = isApiVersionCompatible(
        remote.requiredApiVersion,
        activeHostVersion,
      )

      if (!isCompatible) {
        let requiredDisplay = 'mais recente'
        if (remote.requiredApiVersion) {
          requiredDisplay = remote.requiredApiVersion
        }
        return {
          ...installedItem,
          updateAvailable: false,
          incompatibleUpdate: true,
          incompatibleReason: `Requer Mr. Tick API ${requiredDisplay}`,
        }
      }

      return {
        ...installedItem,
        updateAvailable: true,
        latestVersion: remote.version,
        downloadUrl: remote.downloadUrl,
        latestSha256: remote.sha256,
        latestSize: remote.size,
        changelog: remote.changelog,
      }
    })
  }
}
