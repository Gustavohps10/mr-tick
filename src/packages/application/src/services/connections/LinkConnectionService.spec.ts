import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  IAddonConnectionProfilesResolver,
  IConnectionLifecycleCoordinator,
  IWorkspacesRepository,
} from '@/contracts'
import type { LinkConnectionInput } from '@/contracts/use-cases/ILinkConnectionUseCase'

import { LinkConnectionService } from './LinkConnectionService'

describe('LinkConnectionService', () => {
  let sut: LinkConnectionService

  let workspacesRepositoryMock: Mocked<IWorkspacesRepository>
  let profilesResolverMock: Mocked<IAddonConnectionProfilesResolver>
  let fakeWorkspace: Mocked<Workspace>
  let coordinatorMock: IConnectionLifecycleCoordinator

  const fakeDate = new Date('2026-04-18T00:00:00.000Z')

  const makeInput = (): LinkConnectionInput => ({
    workspaceId: 'workspace-123',
    connectionInstanceId: 'conn-abc',
    addonId: 'plugin-xyz',
    connectionProfileId: 'primary',
  })

  beforeEach(() => {
    vi.clearAllMocks()

    workspacesRepositoryMock = {
      getById: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    } as unknown as Mocked<IWorkspacesRepository>

    profilesResolverMock = {
      getConnectionSchema: vi.fn(async () => Either.success([])),
      getConnectionProfiles: vi.fn().mockResolvedValue(
        Either.success([
          {
            connectionProfileId: 'primary',
            cardinality: 'multi',
            default: true,
          },
        ]),
      ),
    }

    fakeWorkspace = {
      id: 'workspace-123',
      name: 'Mr-tick Workspace',
      connections: [],
      createdAt: fakeDate,
      updatedAt: fakeDate,
      createConnection: vi.fn(),
    } as Partial<Workspace> as Mocked<Workspace>
    coordinatorMock = {
      create: vi.fn().mockResolvedValue(Either.success(fakeWorkspace)),
      connect: vi.fn(),
      disconnect: vi.fn(),
      refresh: vi.fn().mockResolvedValue(Either.success(undefined)),
      archive: vi.fn(),
      restore: vi.fn(),
      withCredentials: vi.fn().mockResolvedValue(Either.success()),
    }

    sut = new LinkConnectionService(
      workspacesRepositoryMock,
      profilesResolverMock,
      coordinatorMock,
    )
  })

  it('should successfully link a connection using findById and return the WorkspaceDTO (Rule 34)', async () => {
    const input = makeInput()

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(fakeWorkspace),
    )

    const result = await sut.execute(input)

    expect(result.isSuccess()).toBe(true)
    expect(workspacesRepositoryMock.getById).toHaveBeenCalledWith(
      'workspace-123',
    )
    expect(coordinatorMock.create).toHaveBeenCalledWith({
      workspaceId: input.workspaceId,
      connectionInstanceId: input.connectionInstanceId,
      addonId: input.addonId,
      profile: {
        connectionProfileId: 'primary',
        cardinality: 'multi',
        default: true,
      },
    })

    expect(result.success).toEqual({
      id: fakeWorkspace.id,
      name: fakeWorkspace.name,
      connections: [],
      createdAt: fakeWorkspace.createdAt,
      updatedAt: fakeWorkspace.updatedAt,
    })
  })

  it('should return NotFoundError when the workspace does not exist', async () => {
    const input = makeInput()
    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(undefined),
    )

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('WORKSPACE_NAO_ENCONTRADO')

    expect(coordinatorMock.create).not.toHaveBeenCalled()
  })

  it('should forward failure when the domain entity rejects the link operation', async () => {
    const input = makeInput()
    const domainError = AppError.ValidationError('CONEXAO_JA_EXISTE')

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(fakeWorkspace),
    )
    vi.mocked(coordinatorMock.create).mockResolvedValue(
      Either.failure(domainError),
    )

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBe(domainError)
  })

  it('should forward an explicit repository failure', async () => {
    const input = makeInput()
    const error = AppError.Internal('DATABASE_UNAVAILABLE')
    workspacesRepositoryMock.getById.mockResolvedValue(Either.failure(error))

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure).toBe(error)
  })
})
