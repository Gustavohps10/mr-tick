import { Workspace } from '@mr-tick/domain'
import { Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  DisconnectAddonConnectionInput,
  IConnectionLifecycleCoordinator,
  IWorkspacesRepository,
} from '@/contracts'

import { DisconnectAddonConnectionService } from './DisconnectAddonConnectionService'

describe('DisconnectAddonConnectionService', () => {
  let sut: DisconnectAddonConnectionService
  let workspacesRepositoryMock: Mocked<IWorkspacesRepository>
  let coordinatorMock: Mocked<IConnectionLifecycleCoordinator>
  let fakeWorkspace: Workspace

  beforeEach(() => {
    vi.clearAllMocks()

    const workspaceResult = Workspace.create({ name: 'Test Workspace' })
    fakeWorkspace = workspaceResult.success
    fakeWorkspace.createConnection('conn-1', 'discord-addon', {
      connectionProfileId: 'primary',
      cardinality: 'multi',
      default: true,
    })

    workspacesRepositoryMock = {
      getById: vi.fn().mockResolvedValue(Either.success(fakeWorkspace)),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    }

    coordinatorMock = {
      create: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn().mockResolvedValue(Either.success(undefined)),
      refresh: vi.fn().mockResolvedValue(Either.success(undefined)),
      archive: vi.fn(),
      restore: vi.fn(),
      withCredentials: vi.fn(),
    }

    sut = new DisconnectAddonConnectionService(
      workspacesRepositoryMock,
      coordinatorMock,
    )
  })

  it('disconnects an addon connection successfully', async () => {
    const input: DisconnectAddonConnectionInput = {
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'conn-1',
    }

    const result = await sut.execute(input)
    expect(result.isSuccess()).toBe(true)

    expect(coordinatorMock.disconnect).toHaveBeenCalledWith({
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'conn-1',
      addonId: 'discord-addon',
    })
  })

  it('returns NotFound when workspace is missing', async () => {
    workspacesRepositoryMock.getById.mockResolvedValueOnce(
      Either.success(undefined),
    )

    const input: DisconnectAddonConnectionInput = {
      workspaceId: 'missing-ws',
      connectionInstanceId: 'conn-1',
    }

    const result = await sut.execute(input)
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('WORKSPACE_NAO_ENCONTRADO')
  })

  it('returns NotFound when connection is missing', async () => {
    const input: DisconnectAddonConnectionInput = {
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'missing-conn',
    }

    const result = await sut.execute(input)
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('CONEXAO_NAO_ENCONTRADA')
  })
})
