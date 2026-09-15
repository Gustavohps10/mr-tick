import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ITimeEntryProvider } from '@/contracts/data/providers'
import type { IDataSourceResolver } from '@/contracts/resolvers'
import type { IDataSourceAdapter } from '@/contracts/resolvers/IDataSourceAdapter'
import type { ListTimeEntriesInput } from '@/contracts/use-cases/IListTimeEntriesUseCase'
import type { PagedResultDTO, TimeEntryDTO } from '@/dtos'

import { ListTimeEntriesService } from './ListTimeEntriesService'

describe('ListTimeEntriesService', () => {
  let sut: ListTimeEntriesService

  let dataSourceResolverMock: Mocked<IDataSourceResolver>
  let adapterMock: Mocked<IDataSourceAdapter>
  let timeEntriesProviderMock: Mocked<ITimeEntryProvider>

  const makeInput = (): ListTimeEntriesInput =>
    ({
      workspaceId: 'workspace-1',
      pluginId: 'plugin-1',
      connectionInstanceId: 'conn-1',
      // memberId removido, pois a responsabilidade de identificação agora é do adapter
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    }) as ListTimeEntriesInput

  const fakeMember = {
    id: 'member-123',
    firstname: 'John',
    lastname: 'Doe',
  }

  const makePagedResult = (): PagedResultDTO<TimeEntryDTO> => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  })

  beforeEach(() => {
    vi.clearAllMocks()

    timeEntriesProviderMock = {
      findByMemberId: vi.fn(),
      pull: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<ITimeEntryProvider>

    adapterMock = {
      timeEntriesProvider: timeEntriesProviderMock,
      getAuthenticatedMemberData: vi.fn(),
    } as unknown as Mocked<IDataSourceAdapter>

    dataSourceResolverMock = {
      getDataSource: vi.fn(),
    } as unknown as Mocked<IDataSourceResolver>

    sut = new ListTimeEntriesService(dataSourceResolverMock)
  })

  it('should resolve data source, authenticate member, and return time entries successfully', async () => {
    // Arrange
    const input = makeInput()
    const fakeResult = makePagedResult()

    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.success(fakeMember as any),
    )
    timeEntriesProviderMock.findByMemberId.mockResolvedValue(fakeResult)

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isSuccess()).toBe(true)
    expect(result.success).toEqual(fakeResult)

    expect(dataSourceResolverMock.getDataSource).toHaveBeenCalledWith(
      input.workspaceId,
      input.connectionInstanceId,
    )
    expect(adapterMock.getAuthenticatedMemberData).toHaveBeenCalled()
    expect(timeEntriesProviderMock.findByMemberId).toHaveBeenCalledWith(
      fakeMember.id,
      input.startDate,
      input.endDate,
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

    expect(timeEntriesProviderMock.findByMemberId).not.toHaveBeenCalled()
  })

  it('should return unexpected error when the data source resolver throws an exception', async () => {
    // Arrange
    const input = makeInput()
    dataSourceResolverMock.getDataSource.mockRejectedValue(
      new Error('resolver error'),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('ERRO_INESPERADO')
    expect(result.failure.statusCode).toBe(404)

    expect(timeEntriesProviderMock.findByMemberId).not.toHaveBeenCalled()
  })

  it('should return unexpected error when the adapter query throws an exception', async () => {
    // Arrange
    const input = makeInput()

    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.success(fakeMember as any),
    )
    timeEntriesProviderMock.findByMemberId.mockRejectedValue(
      new Error('query error'),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('ERRO_INESPERADO')
    expect(result.failure.statusCode).toBe(404)

    expect(dataSourceResolverMock.getDataSource).toHaveBeenCalledOnce()
    expect(timeEntriesProviderMock.findByMemberId).toHaveBeenCalledOnce()
  })
})
