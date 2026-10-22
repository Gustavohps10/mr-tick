import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FileData, IFileManager, IFileStorage } from '@/contracts'
import type { IAddonsFacade } from '@/contracts/facades'
import type { IAddonAccessService } from '@/contracts/use-cases/IAddonAccessService'
import type { AddonManifestDTO } from '@/dtos'

import { ImportAddonService } from './ImportAddonService'

function createBaseManifest(
  overrides: Partial<AddonManifestDTO> = {},
): AddonManifestDTO {
  return {
    id: 'my-addon-123',
    version: '0.1.0',
    name: 'My Addon',
    creator: 'Community',
    description: 'Desc',
    path: '',
    logo: '',
    downloads: 0,
    stars: 0,
    installed: false,
    capabilities: [],
    ...overrides,
  }
}

describe('ImportAddonService', () => {
  let sut: ImportAddonService

  let fileStorageMock: Mocked<IFileStorage>
  let fileManagerMock: Mocked<IFileManager>
  let addonsFacadeMock: Mocked<IAddonsFacade>
  let addonAccessServiceMock: Mocked<IAddonAccessService>

  const makeFakeFileData = (): FileData => Buffer.from('fake-tladdon-content')

  const makeExtractedFiles = () => [
    { name: 'manifest.yaml', content: Buffer.from('id: my-addon-123') },
    { name: 'index.js', content: Buffer.from('console.log("hello")') },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    fileStorageMock = {
      write: vi.fn(),
      read: vi.fn(),
      exists: vi.fn(),
      delete: vi.fn(),
      getPublicUrl: vi.fn(),
    }

    fileManagerMock = {
      zip: vi.fn(),
      unzipInMemory: vi.fn(),
      getMimeType: vi.fn(),
    }

    addonsFacadeMock = {
      listAvailable: vi.fn(),
      listInstalled: vi.fn(),
      getInstalledById: vi.fn(),
      getInstaller: vi.fn(),
      parseManifest: vi.fn(),
      parseInstaller: vi.fn(),
      downloadFile: vi.fn(),
      uninstallAddon: vi.fn(),
      checkUpdates: vi.fn(),
      backupAddon: vi.fn(),
      restoreAddonBackup: vi.fn(),
      removeAddonBackup: vi.fn(),
    }

    addonAccessServiceMock = {
      authorizeFiles: vi.fn().mockResolvedValue(
        Either.success({
          addonId: 'my-addon-123',
          version: '0.1.0',
          classification: 'free',
          fingerprint: 'a'.repeat(64),
        }),
      ),
      authorizeDirectory: vi.fn().mockResolvedValue(
        Either.success({
          addonId: 'my-addon-123',
          version: '0.1.0',
          classification: 'free',
          fingerprint: 'a'.repeat(64),
        }),
      ),
    }

    sut = new ImportAddonService(
      fileStorageMock,
      fileManagerMock,
      addonsFacadeMock,
      addonAccessServiceMock,
    )
  })

  it('should successfully unzip, parse manifest and save addon files', async () => {
    const inputData = makeFakeFileData()
    const extractedFiles = makeExtractedFiles()
    const fakeAddonId = 'my-addon-123'

    fileManagerMock.unzipInMemory.mockResolvedValue(extractedFiles)
    addonsFacadeMock.parseManifest.mockResolvedValue(
      Either.success(createBaseManifest({ id: fakeAddonId, version: '' })),
    )
    fileStorageMock.write.mockResolvedValue(undefined)

    const result = await sut.execute(inputData)

    expect(result.isSuccess()).toBe(true)

    expect(fileManagerMock.unzipInMemory).toHaveBeenCalledWith(inputData)

    expect(addonsFacadeMock.parseManifest).toHaveBeenCalledWith(
      extractedFiles[0].content,
    )

    expect(fileStorageMock.write).toHaveBeenCalledWith(
      `./addons/${fakeAddonId}/0.1.0/manifest.yaml`,
      extractedFiles[0].content,
    )
    expect(fileStorageMock.write).toHaveBeenCalledWith(
      `./addons/${fakeAddonId}/0.1.0/index.js`,
      extractedFiles[1].content,
    )
  })

  it('should block importing a Plus addon when the Plus license is inactive', async () => {
    const inputData = makeFakeFileData()
    fileManagerMock.unzipInMemory.mockResolvedValue(makeExtractedFiles())
    addonsFacadeMock.parseManifest.mockResolvedValue(
      Either.success(
        createBaseManifest({
          id: 'mistertick-discord',
          tier: 'plus',
        }),
      ),
    )
    addonAccessServiceMock.authorizeFiles.mockResolvedValue(
      Either.failure(
        AppError.Unauthorized('LICENCA_PLUS_NECESSARIA_PARA_ADDON'),
      ),
    )

    const result = await sut.execute(inputData)

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('LICENCA_PLUS_NECESSARIA_PARA_ADDON')
    expect(fileStorageMock.write).not.toHaveBeenCalled()
  })

  it('should return error when unzip fails', async () => {
    fileManagerMock.unzipInMemory.mockRejectedValue(
      new Error('Corrupted tladdon'),
    )

    const result = await sut.execute(makeFakeFileData())

    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(fileStorageMock.write).not.toHaveBeenCalled()
  })

  it('should return NotFoundError when manifest.yaml is not present', async () => {
    const filesWithoutManifest = [
      { name: 'random-file.txt', content: Buffer.from('...') },
    ]
    fileManagerMock.unzipInMemory.mockResolvedValue(filesWithoutManifest)

    const result = await sut.execute(makeFakeFileData())

    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('MANIFEST_NAO_ENCONTRADO')
  })

  it('should forward failure when parsing manifest fails', async () => {
    const facadeError = AppError.ValidationError('SCHEMA_INVALIDO')
    fileManagerMock.unzipInMemory.mockResolvedValue(makeExtractedFiles())
    addonsFacadeMock.parseManifest.mockResolvedValue(
      Either.failure(facadeError),
    )

    const result = await sut.execute(makeFakeFileData())

    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBe(facadeError)
  })

  it('should return NotFoundError when manifest does not contain an id', async () => {
    fileManagerMock.unzipInMemory.mockResolvedValue(makeExtractedFiles())
    addonsFacadeMock.parseManifest.mockResolvedValue(
      Either.success(createBaseManifest({ id: '' })),
    )

    const result = await sut.execute(makeFakeFileData())

    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('ADDONID_NAO_ENCONTRADO')
  })

  it('should return error when file storage fails to write', async () => {
    fileManagerMock.unzipInMemory.mockResolvedValue(makeExtractedFiles())
    addonsFacadeMock.parseManifest.mockResolvedValue(
      Either.success(createBaseManifest({ id: 'addon-123' })),
    )
    fileStorageMock.write.mockRejectedValue(
      new Error('No space left on device'),
    )

    const result = await sut.execute(makeFakeFileData())

    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
  })
})
