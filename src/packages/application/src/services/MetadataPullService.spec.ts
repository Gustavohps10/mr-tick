import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IMetadataProvider } from '@/contracts/data/providers'
import type { IDataSourceResolver } from '@/contracts/resolvers'
import type { IDataSourceAdapter } from '@/contracts/resolvers/IDataSourceAdapter'
import type { PullMetadataInput } from '@/contracts/use-cases/IMetadataPullUseCase'
import type { MetadataDTO } from '@/dtos'

import { MetadataPullService } from './MetadataPullService'

describe('MetadataPullService', () => {
  let sut: MetadataPullService

  let dataSourceResolverMock: Mocked<IDataSourceResolver>
  let adapterMock: Mocked<IDataSourceAdapter>
  let metadataProviderMock: Mocked<IMetadataProvider>

  const fakeDate = new Date('2026-04-18T00:00:00.000Z')

  const makeInput = (): PullMetadataInput =>
    ({
      workspaceId: 'workspace-123',
      pluginId: 'plugin-xyz',
      connectionInstanceId: 'conn-abc',
      // memberId removido, agora vem do adapter
      checkpoint: {
        updatedAt: fakeDate,
        id: 'last-sync-123',
      },
      batch: 100,
    }) as PullMetadataInput

  const fakeMember = {
    id: 'member-789',
    firstname: 'John',
    lastname: 'Doe',
  }

  const fakeMetadata: MetadataDTO = {
    taskStatuses: [
      {
        id: 'status-1',
        name: 'To Do',
        icon: 'circle',
        colors: {
          badge: '#cccccc',
          background: '#ffffff',
          text: '#333333',
        },
      },
    ],
    taskPriorities: [],
    activities: [],
    trackStatuses: [],
    participantRoles: [],
    estimationTypes: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()

    metadataProviderMock = {
      getMetadata: vi.fn(),
    } as unknown as Mocked<IMetadataProvider>

    adapterMock = {
      metadataProvider: metadataProviderMock,
      getAuthenticatedMemberData: vi.fn(),
    } as unknown as Mocked<IDataSourceAdapter>

    dataSourceResolverMock = {
      getDataSource: vi.fn(),
    } as unknown as Mocked<IDataSourceResolver>

    sut = new MetadataPullService(dataSourceResolverMock)
  })

  it('should successfully resolve the data source, pull metadata using the authenticated member, and return it', async () => {
    // Arrange
    const input = makeInput()

    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.success(fakeMember as any),
    )
    metadataProviderMock.getMetadata.mockResolvedValue(
      Either.success(fakeMetadata),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isSuccess()).toBe(true)
    expect(result.success).toEqual(fakeMetadata)

    expect(dataSourceResolverMock.getDataSource).toHaveBeenCalledWith(
      input.workspaceId,
      input.connectionInstanceId,
    )
    expect(adapterMock.getAuthenticatedMemberData).toHaveBeenCalled()
    expect(metadataProviderMock.getMetadata).toHaveBeenCalledWith(
      fakeMember.id,
      input.checkpoint,
      input.batch,
    )
  })

  it('should forward the failure if getAuthenticatedMemberData returns a failure', async () => {
    // Arrange
    const input = makeInput()
    const authError = AppError.Unauthorized('FALHA_DE_AUTENTICACAO')

    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.failure(authError),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBe(authError)

    expect(metadataProviderMock.getMetadata).not.toHaveBeenCalled()
  })

  it('should return unexpected error when the data source resolver throws an exception', async () => {
    // Arrange
    const input = makeInput()
    dataSourceResolverMock.getDataSource.mockRejectedValue(new Error('Fail'))

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('Failed to pull metadata')
    expect(result.failure.statusCode).toBe(404) // Validação do AppError.NotFound
  })

  it('should return unexpected error when the adapter fails to pull metadata (throws)', async () => {
    // Arrange
    const input = makeInput()
    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.success(fakeMember as any),
    )
    metadataProviderMock.getMetadata.mockRejectedValue(new Error('API Error'))

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('Failed to pull metadata')
    expect(result.failure.statusCode).toBe(404)
  })
})
