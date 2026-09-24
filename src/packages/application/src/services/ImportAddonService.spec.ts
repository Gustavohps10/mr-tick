import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FileData, IFileManager, IFileStorage } from '@/contracts'
import type { IAddonsFacade } from '@/contracts/facades'

import { ImportAddonService } from './ImportAddonService'

describe('ImportAddonService', () => {
  let sut: ImportAddonService

  let fileStorageMock: Mocked<IFileStorage>
  let fileManagerMock: Mocked<IFileManager>
  let addonsFacadeMock: Mocked<IAddonsFacade>

  const makeFakeFileData = (): FileData =>
    Buffer.from('fake-zip-content') as any

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
    } as Mocked<IFileStorage>

    fileManagerMock = {
      zip: vi.fn(),
      unzipInMemory: vi.fn(),
      getMimeType: vi.fn(),
    } as Mocked<IFileManager>

    addonsFacadeMock = {
      parseManifest: vi.fn(),
    } as Partial<IAddonsFacade> as Mocked<IAddonsFacade>

    sut = new ImportAddonService(
      fileStorageMock,
      fileManagerMock,
      addonsFacadeMock,
    )
  })

  it('should successfully unzip, parse manifest and save addon files', async () => {
    // Arrange
    const inputData = makeFakeFileData()
    const extractedFiles = makeExtractedFiles()
    const fakeAddonId = 'my-addon-123'

    fileManagerMock.unzipInMemory.mockResolvedValue(extractedFiles)
    addonsFacadeMock.parseManifest.mockResolvedValue(
      Either.success({ id: fakeAddonId } as any),
    )
    fileStorageMock.write.mockResolvedValue(undefined)

    // Act
    const result = await sut.execute(inputData)

    // Assert
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

  it('should return InternalServerError when unzip fails', async () => {
    // Arrange
    fileManagerMock.unzipInMemory.mockRejectedValue(new Error('Corrupted zip'))

    // Act
    const result = await sut.execute(makeFakeFileData())

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(fileStorageMock.write).not.toHaveBeenCalled()
  })

  it('should return NotFoundError when manifest.yaml is not present', async () => {
    // Arrange
    const filesWithoutManifest = [
      { name: 'random-file.txt', content: Buffer.from('...') },
    ]
    fileManagerMock.unzipInMemory.mockResolvedValue(filesWithoutManifest)

    // Act
    const result = await sut.execute(makeFakeFileData())

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('MANIFEST_NAO_ENCONTRADO')
  })

  it('should forward failure when parsing manifest fails', async () => {
    // Arrange
    const facadeError = AppError.ValidationError('SCHEMA_INVALIDO')
    fileManagerMock.unzipInMemory.mockResolvedValue(makeExtractedFiles())
    addonsFacadeMock.parseManifest.mockResolvedValue(
      Either.failure(facadeError),
    )

    // Act
    const result = await sut.execute(makeFakeFileData())

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBe(facadeError)
  })

  it('should return NotFoundError when manifest does not contain an id', async () => {
    // Arrange
    fileManagerMock.unzipInMemory.mockResolvedValue(makeExtractedFiles())
    addonsFacadeMock.parseManifest.mockResolvedValue(Either.success({} as any))

    // Act
    const result = await sut.execute(makeFakeFileData())

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('ADDONID_NAO_ENCONTRADO')
  })

  it('should return InternalServerError when file storage fails to write', async () => {
    // Arrange
    fileManagerMock.unzipInMemory.mockResolvedValue(makeExtractedFiles())
    addonsFacadeMock.parseManifest.mockResolvedValue(
      Either.success({ id: 'addon-123' } as any),
    )
    fileStorageMock.write.mockRejectedValue(
      new Error('No space left on device'),
    )

    // Act
    const result = await sut.execute(makeFakeFileData())

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
  })
})
