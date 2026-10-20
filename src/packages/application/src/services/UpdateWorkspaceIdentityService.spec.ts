import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  IFileManager,
  IFileStorage,
  IWorkspacesRepository,
  UpdateWorkspaceIdentityInput,
} from '@/contracts'

import { UpdateWorkspaceIdentityService } from './UpdateWorkspaceIdentityService'

describe('UpdateWorkspaceIdentityService', () => {
  let sut: UpdateWorkspaceIdentityService
  let workspacesRepositoryMock: Mocked<IWorkspacesRepository>
  let fileStorageMock: Mocked<IFileStorage>
  let fileManagerMock: Mocked<IFileManager>
  let fakeWorkspace: Mocked<Workspace>

  const makeInput = (
    overrides?: Partial<UpdateWorkspaceIdentityInput>,
  ): UpdateWorkspaceIdentityInput => ({
    workspaceId: 'ws-123',
    name: 'Updated Name',
    description: 'Updated Description',
    avatarFile: Buffer.from('fake-avatar'),
    removeAvatar: false,
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()

    fakeWorkspace = {
      id: 'ws-123',
      name: 'Old Name',
      description: 'Old Description',
      avatarUrl: 'https://storage.com/old.png',
      status: 'configured',
      connections: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      updateIdentity: vi.fn().mockReturnValue(Either.success()),
    } as unknown as Mocked<Workspace>

    workspacesRepositoryMock = {
      getById: vi.fn().mockResolvedValue(Either.success(fakeWorkspace)),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(Either.success(undefined)),
      remove: vi.fn(),
    } as unknown as Mocked<IWorkspacesRepository>

    fileStorageMock = {
      write: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      getPublicUrl: vi.fn().mockReturnValue('https://storage.com/new.png'),
      read: vi.fn(),
    } as unknown as Mocked<IFileStorage>

    fileManagerMock = {
      getMimeType: vi
        .fn()
        .mockResolvedValue(Either.success({ mime: 'image/png', ext: 'png' })),
      zip: vi.fn(),
      unzipInMemory: vi.fn(),
    } as unknown as Mocked<IFileManager>

    sut = new UpdateWorkspaceIdentityService(
      workspacesRepositoryMock,
      fileStorageMock,
      fileManagerMock,
    )
  })

  it('should return NotFound when workspace does not exist', async () => {
    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(undefined),
    )

    const result = await sut.execute(makeInput())

    expect(result.isFailure()).toBe(true)
    expect(result.failure.statusCode).toBe(404)
    expect(result.failure.messageKey).toBe('WORKSPACE_NAO_ENCONTRADO')
    expect(fileStorageMock.write).not.toHaveBeenCalled()
  })

  it('should update identity without changing avatar when no file and no removeAvatar', async () => {
    const input = makeInput({ avatarFile: undefined })

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(fakeWorkspace),
    )
    fakeWorkspace.updateIdentity.mockReturnValue(Either.success())

    const result = await sut.execute(input)

    expect(result.isSuccess()).toBe(true)
    expect(fileStorageMock.write).not.toHaveBeenCalled()
    expect(fileManagerMock.getMimeType).not.toHaveBeenCalled()
    expect(fakeWorkspace.updateIdentity).toHaveBeenCalledWith({
      name: input.name,
      description: input.description,
      avatarUrl: fakeWorkspace.avatarUrl,
    })
    expect(workspacesRepositoryMock.update).toHaveBeenCalledWith(fakeWorkspace)
  })

  it('should delete old avatar and set avatarUrl to undefined when removeAvatar is true', async () => {
    const input = makeInput({ avatarFile: undefined, removeAvatar: true })

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(fakeWorkspace),
    )
    fakeWorkspace.updateIdentity.mockReturnValue(Either.success())

    const result = await sut.execute(input)

    expect(result.isSuccess()).toBe(true)
    expect(fileStorageMock.delete).toHaveBeenCalledWith(
      `workspaces/avatars/${fakeWorkspace.id}.any`,
      true,
    )
    expect(fakeWorkspace.updateIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl: undefined }),
    )
    expect(workspacesRepositoryMock.update).toHaveBeenCalledWith(fakeWorkspace)
  })

  it('should not call fileStorage.delete if workspace has no avatar when removeAvatar is true', async () => {
    const input = makeInput({ avatarFile: undefined, removeAvatar: true })

    fakeWorkspace = {
      ...fakeWorkspace,
      avatarUrl: undefined,
      updateIdentity: vi.fn().mockReturnValue(Either.success()),
    } as unknown as Mocked<Workspace>

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(fakeWorkspace),
    )

    await sut.execute(input)

    expect(fileStorageMock.delete).not.toHaveBeenCalled()
    expect(workspacesRepositoryMock.update).toHaveBeenCalledWith(fakeWorkspace)
  })

  it('should upload new avatar and update identity successfully', async () => {
    const input = makeInput()
    const newPublicUrl = 'https://storage.com/new-avatar.png'

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(fakeWorkspace),
    )
    fileManagerMock.getMimeType.mockResolvedValue(
      Either.success({ mime: 'image/png', ext: 'png' }),
    )
    fileStorageMock.getPublicUrl.mockReturnValue(newPublicUrl)
    fakeWorkspace.updateIdentity.mockReturnValue(Either.success())

    const result = await sut.execute(input)

    expect(result.isSuccess()).toBe(true)
    expect(fileStorageMock.write).toHaveBeenCalledWith(
      `workspaces/avatars/${fakeWorkspace.id}.png`,
      input.avatarFile,
    )
    expect(fakeWorkspace.updateIdentity).toHaveBeenCalledWith({
      name: input.name,
      description: input.description,
      avatarUrl: newPublicUrl,
    })
    expect(workspacesRepositoryMock.update).toHaveBeenCalledWith(fakeWorkspace)
  })

  it('should use correct extension from getMimeType', async () => {
    const input = makeInput()

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(fakeWorkspace),
    )
    fileManagerMock.getMimeType.mockResolvedValue(
      Either.success({ mime: 'image/webp', ext: 'webp' }),
    )
    fileStorageMock.getPublicUrl.mockReturnValue(
      'https://storage.com/avatar.webp',
    )
    fakeWorkspace.updateIdentity.mockReturnValue(Either.success())

    await sut.execute(input)

    expect(fileStorageMock.write).toHaveBeenCalledWith(
      `workspaces/avatars/${fakeWorkspace.id}.webp`,
      input.avatarFile,
    )
  })

  it('should return failure if getMimeType fails', async () => {
    const input = makeInput()

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(fakeWorkspace),
    )
    fileManagerMock.getMimeType.mockResolvedValue(
      Either.failure(
        AppError.ValidationError('Formato de arquivo não suportado.'),
      ),
    )

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    expect(fileStorageMock.write).not.toHaveBeenCalled()
    expect(workspacesRepositoryMock.update).not.toHaveBeenCalled()
  })

  it('should delete uploaded avatar and return failure if updateIdentity fails', async () => {
    const input = makeInput()
    const domainError = AppError.ValidationError('CAMPOS_INVALIDOS')

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(fakeWorkspace),
    )
    fileManagerMock.getMimeType.mockResolvedValue(
      Either.success({ mime: 'image/png', ext: 'png' }),
    )
    fileStorageMock.getPublicUrl.mockReturnValue(
      'https://storage.com/avatar.png',
    )
    fakeWorkspace.updateIdentity.mockReturnValue(Either.failure(domainError))

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBe(domainError)
    expect(fileStorageMock.delete).toHaveBeenCalledWith(
      `workspaces/avatars/${fakeWorkspace.id}.png`,
      true,
    )
    expect(workspacesRepositoryMock.update).not.toHaveBeenCalled()
  })

  it('should not delete avatar if updateIdentity fails and no new file was uploaded', async () => {
    const input = makeInput({ avatarFile: undefined })
    const domainError = AppError.ValidationError('CAMPOS_INVALIDOS')

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(fakeWorkspace),
    )
    fakeWorkspace.updateIdentity.mockReturnValue(Either.failure(domainError))

    await sut.execute(input)

    expect(fileStorageMock.delete).not.toHaveBeenCalled()
  })

  it('should delete uploaded avatar and return failure if repository update throws', async () => {
    const input = makeInput()

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(fakeWorkspace),
    )
    fileManagerMock.getMimeType.mockResolvedValue(
      Either.success({ mime: 'image/png', ext: 'png' }),
    )
    fileStorageMock.getPublicUrl.mockReturnValue(
      'https://storage.com/avatar.png',
    )
    fakeWorkspace.updateIdentity.mockReturnValue(Either.success())
    workspacesRepositoryMock.update.mockRejectedValue(new Error('DB Error'))

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    expect(fileStorageMock.delete).toHaveBeenCalledWith(
      `workspaces/avatars/${fakeWorkspace.id}.png`,
      true,
    )
  })

  it('should return Internal error when findById throws', async () => {
    workspacesRepositoryMock.getById.mockRejectedValue(new Error('Fatal'))

    const result = await sut.execute(makeInput())

    expect(result.isFailure()).toBe(true)
    expect(result.failure.statusCode).toBe(500)
    expect(result.failure.messageKey).toBe(
      'ERRO_AO_ATUALIZAR_IDENTIDADE_DO_WORKSPACE',
    )
  })

  it('should return Internal error when fileStorage.write throws', async () => {
    const input = makeInput()

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(fakeWorkspace),
    )
    fileManagerMock.getMimeType.mockResolvedValue(
      Either.success({ mime: 'image/png', ext: 'png' }),
    )
    fileStorageMock.write.mockRejectedValue(new Error('Storage Error'))

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    expect(result.failure.statusCode).toBe(500)
    expect(workspacesRepositoryMock.update).not.toHaveBeenCalled()
  })

  it('updates workspace identity using targeted findById and update adhering to Rule 37', async () => {
    const input = makeInput({ avatarFile: undefined })
    const result = await sut.execute(input)

    expect(result.isSuccess()).toBe(true)
    expect(workspacesRepositoryMock.getById).toHaveBeenCalledWith('ws-123')
    expect(workspacesRepositoryMock.update).toHaveBeenCalledWith(fakeWorkspace)
  })
})
