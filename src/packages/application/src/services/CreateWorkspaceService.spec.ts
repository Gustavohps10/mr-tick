import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CreateWorkspaceInput,
  IFileManager,
  IFileStorage,
  IWorkspacesRepository,
} from '@/contracts'

import { CreateWorkspaceService } from './CreateWorkspaceService'

describe('CreateWorkspaceService', () => {
  let sut: CreateWorkspaceService
  let workspacesRepositoryMock: Mocked<IWorkspacesRepository>
  let fileStorageMock: Mocked<IFileStorage>
  let fileManagerMock: Mocked<IFileManager>

  const makeInput = (
    overrides?: Partial<CreateWorkspaceInput>,
  ): CreateWorkspaceInput => ({
    name: 'New Workspace',
    description: 'Workspace description',
    ...overrides,
  })

  const makeInputWithAvatar = (): CreateWorkspaceInput => ({
    ...makeInput(),
    avatarFile: Buffer.from('fake-image'),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()

    workspacesRepositoryMock = {
      create: vi.fn().mockResolvedValue(Either.success(undefined)),
      findById: vi.fn(),
      findAll: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<IWorkspacesRepository>

    fileStorageMock = {
      write: vi.fn(),
      getPublicUrl: vi.fn(),
      delete: vi.fn(),
      read: vi.fn(),
    } as unknown as Mocked<IFileStorage>

    fileManagerMock = {
      zip: vi.fn(),
      unzipInMemory: vi.fn(),
      getMimeType: vi.fn(),
    } as unknown as Mocked<IFileManager>

    sut = new CreateWorkspaceService(
      workspacesRepositoryMock,
      fileStorageMock,
      fileManagerMock,
    )
  })

  it('should create a workspace without avatar successfully', async () => {
    const input = makeInput()

    const result = await sut.execute(input)

    expect(result.isSuccess()).toBe(true)
    expect(result.success.name).toBe(input.name)
    expect(result.success.avatarUrl).toBeUndefined()
    expect(fileStorageMock.write).not.toHaveBeenCalled()
    expect(fileManagerMock.getMimeType).not.toHaveBeenCalled()
    expect(workspacesRepositoryMock.create).toHaveBeenCalledOnce()
  })

  it('should create a workspace without description successfully', async () => {
    const input = makeInput({ description: undefined })

    const result = await sut.execute(input)

    expect(result.isSuccess()).toBe(true)
    expect(result.success.description).toBeUndefined()
  })

  it('should create a workspace with avatar successfully', async () => {
    const input = makeInputWithAvatar()
    const publicUrl = 'https://storage.com/avatar.png'
    const workspace = Workspace.create({ name: input.name }).success

    vi.spyOn(Workspace, 'create').mockReturnValue(Either.success(workspace))
    vi.spyOn(workspace, 'updateAvatarUrl').mockReturnValue(Either.success())
    fileManagerMock.getMimeType.mockResolvedValue(
      Either.success({ mime: 'image/png', ext: 'png' }),
    )
    fileStorageMock.getPublicUrl.mockReturnValue(publicUrl)

    const result = await sut.execute(input)

    expect(result.isSuccess()).toBe(true)
    expect(fileStorageMock.write).toHaveBeenCalledWith(
      `workspaces/avatars/${workspace.id}.png`,
      input.avatarFile,
    )
    expect(fileStorageMock.getPublicUrl).toHaveBeenCalledWith(
      `workspaces/avatars/${workspace.id}.png`,
    )
    expect(fileStorageMock.delete).not.toHaveBeenCalled()
    expect(workspacesRepositoryMock.create).toHaveBeenCalledOnce()
  })

  it('should use correct extension from getMimeType', async () => {
    const input = makeInputWithAvatar()
    const workspace = Workspace.create({ name: input.name }).success

    vi.spyOn(Workspace, 'create').mockReturnValue(Either.success(workspace))
    vi.spyOn(workspace, 'updateAvatarUrl').mockReturnValue(Either.success())
    fileManagerMock.getMimeType.mockResolvedValue(
      Either.success({ mime: 'image/webp', ext: 'webp' }),
    )
    fileStorageMock.getPublicUrl.mockReturnValue(
      'https://storage.com/avatar.webp',
    )

    await sut.execute(input)

    expect(fileStorageMock.write).toHaveBeenCalledWith(
      `workspaces/avatars/${workspace.id}.webp`,
      input.avatarFile,
    )
  })

  it('should return failure if Workspace.create fails', async () => {
    const input = makeInput()
    const domainError = AppError.ValidationError('NOME_INVALIDO')

    vi.spyOn(Workspace, 'create').mockReturnValue(Either.failure(domainError))

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBe(domainError)
    expect(workspacesRepositoryMock.create).not.toHaveBeenCalled()
    expect(fileStorageMock.write).not.toHaveBeenCalled()
  })

  it('should return failure if getMimeType fails', async () => {
    const input = makeInputWithAvatar()
    const workspace = Workspace.create({ name: input.name }).success

    vi.spyOn(Workspace, 'create').mockReturnValue(Either.success(workspace))
    fileManagerMock.getMimeType.mockResolvedValue(
      Either.failure(
        AppError.ValidationError('Formato de arquivo não suportado.'),
      ),
    )

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    expect(fileStorageMock.write).not.toHaveBeenCalled()
    expect(workspacesRepositoryMock.create).not.toHaveBeenCalled()
  })

  it('should delete uploaded image and return failure if updateAvatarUrl fails', async () => {
    const input = makeInputWithAvatar()
    const workspace = Workspace.create({ name: input.name }).success
    const domainError = AppError.ValidationError('URL_INVALIDA')

    vi.spyOn(Workspace, 'create').mockReturnValue(Either.success(workspace))
    fileManagerMock.getMimeType.mockResolvedValue(
      Either.success({ mime: 'image/png', ext: 'png' }),
    )
    vi.spyOn(workspace, 'updateAvatarUrl').mockReturnValue(
      Either.failure(domainError),
    )

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    expect(fileStorageMock.delete).toHaveBeenCalledWith(
      `workspaces/avatars/${workspace.id}.png`,
      true,
    )
    expect(workspacesRepositoryMock.create).not.toHaveBeenCalled()
  })

  it('should delete uploaded image and return failure if repository create throws', async () => {
    const input = makeInputWithAvatar()
    const workspace = Workspace.create({ name: input.name }).success

    vi.spyOn(Workspace, 'create').mockReturnValue(Either.success(workspace))
    vi.spyOn(workspace, 'updateAvatarUrl').mockReturnValue(Either.success())
    fileManagerMock.getMimeType.mockResolvedValue(
      Either.success({ mime: 'image/png', ext: 'png' }),
    )
    fileStorageMock.getPublicUrl.mockReturnValue(
      'https://storage.com/avatar.png',
    )
    workspacesRepositoryMock.create.mockRejectedValue(new Error('DB Error'))

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    expect(fileStorageMock.delete).toHaveBeenCalledWith(
      `workspaces/avatars/${workspace.id}.png`,
      true,
    )
  })

  it('should return internal failure if fileStorage.write throws', async () => {
    const input = makeInputWithAvatar()
    const workspace = Workspace.create({ name: input.name }).success

    vi.spyOn(Workspace, 'create').mockReturnValue(Either.success(workspace))
    fileManagerMock.getMimeType.mockResolvedValue(
      Either.success({ mime: 'image/png', ext: 'png' }),
    )
    fileStorageMock.write.mockRejectedValue(new Error('Storage Error'))

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    expect(result.failure.statusCode).toBe(500)
    expect(workspacesRepositoryMock.create).not.toHaveBeenCalled()
  })

  it('creates workspace calling workspacesRepository.create directly adhering to Rule 37', async () => {
    const input = makeInput()
    const result = await sut.execute(input)

    expect(result.isSuccess()).toBe(true)
    expect(workspacesRepositoryMock.create).toHaveBeenCalledOnce()
  })
})
