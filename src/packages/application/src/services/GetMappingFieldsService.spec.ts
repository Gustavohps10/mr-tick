import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  IDataSourceAdapter,
  IDataSourceResolver,
  IMemberProvider,
  IMetadataProvider,
  ITaskProvider,
  ITimeEntryProvider,
  MappingFieldDefinition,
} from '@/contracts'

import { GetMappingFieldsService } from './GetMappingFieldsService'

describe('GetMappingFieldsService', () => {
  let sut: GetMappingFieldsService
  let dataSourceResolverMock: Mocked<IDataSourceResolver>

  const fakeFields: MappingFieldDefinition[] = [
    {
      id: 'field-1',
      name: 'Issue Key',
      category: 'identifier',
    },
    {
      id: 'field-2',
      name: 'Summary',
      category: 'content',
    },
  ]

  const dummyTaskProvider: ITaskProvider = {
    pull: async () => Either.success([]),
    findAll: async () =>
      Either.success({ items: [], total: 0, page: 1, pageSize: 10 }),
    findById: async () => Either.success(null),
    create: async () => Either.success({ id: 'dummy' }),
    update: async () => Either.success({ id: 'dummy' }),
    delete: async () => Either.success(undefined),
  }

  const dummyTimeEntryProvider: ITimeEntryProvider = {
    pull: async () =>
      Either.success({
        items: [],
        snapshotId: '1',
        checkpoint: { updatedAt: new Date(), id: '1' },
        hasMore: false,
      }),
    findByMemberId: async () =>
      Either.success({ items: [], total: 0, page: 1, pageSize: 10 }),
    create: async () => Either.success({ id: 'dummy' }),
    update: async () => Either.success({ id: 'dummy' }),
    delete: async () => Either.success(undefined),
    findById: async () => Either.success(null),
    findAll: async () =>
      Either.success({ items: [], total: 0, page: 1, pageSize: 10 }),
  }

  const dummyMemberProvider: IMemberProvider = {
    getCurrentUser: async () => Either.success(null),
    findById: async () => Either.success(null),
    findByCredentials: async () =>
      Either.failure(AppError.NotFound('MEMBER_NOT_FOUND')),
    findAll: async () =>
      Either.success({ items: [], total: 0, page: 1, pageSize: 10 }),
  }

  function createMockAdapter(
    metadataProvider?: IMetadataProvider,
  ): IDataSourceAdapter {
    const fallbackMetadataProvider: IMetadataProvider = {
      getMetadata: vi.fn(),
    }
    const resolvedMetadataProvider = metadataProvider
      ? metadataProvider
      : fallbackMetadataProvider

    return {
      id: 'test-adapter',
      getAuthenticatedMemberData: () =>
        Either.failure(AppError.NotFound('MEMBER_NOT_FOUND')),
      tasksProvider: dummyTaskProvider,
      timeEntriesProvider: dummyTimeEntryProvider,
      membersProvider: dummyMemberProvider,
      metadataProvider: resolvedMetadataProvider,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()

    const metadataProvider: IMetadataProvider = {
      getMetadata: vi.fn(),
      getMappingFields: vi.fn().mockResolvedValue(Either.success(fakeFields)),
    }

    const adapter = createMockAdapter(metadataProvider)

    dataSourceResolverMock = {
      getDataSource: vi.fn().mockResolvedValue(Either.success(adapter)),
      getConnectionProfiles: vi.fn(),
      getDataSourcesForWorkspace: vi.fn(),
    }

    sut = new GetMappingFieldsService(dataSourceResolverMock)
  })

  it('returns mapping fields successfully from the provider', async () => {
    const result = await sut.execute({
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
    })

    expect(result.isSuccess()).toBe(true)
    expect(result.success).toEqual(fakeFields)
    expect(dataSourceResolverMock.getDataSource).toHaveBeenCalledWith(
      'ws-1',
      'conn-1',
    )
  })

  it('fails when workspaceId is missing or empty', async () => {
    const result = await sut.execute({
      workspaceId: '',
      connectionInstanceId: 'conn-1',
    })

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('WORKSPACE_ID_REQUIRED')
  })

  it('fails when connectionInstanceId is missing or empty', async () => {
    const result = await sut.execute({
      workspaceId: 'ws-1',
      connectionInstanceId: '   ',
    })

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('CONNECTION_INSTANCE_ID_REQUIRED')
  })

  it('forwards error when data source resolver fails', async () => {
    dataSourceResolverMock.getDataSource.mockResolvedValueOnce(
      Either.failure(AppError.NotFound('DATA_SOURCE_NOT_FOUND')),
    )

    const result = await sut.execute({
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
    })

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('DATA_SOURCE_NOT_FOUND')
  })

  it('fails when metadata provider is not available', async () => {
    const adapterWithoutProvider = createMockAdapter()
    Reflect.deleteProperty(adapterWithoutProvider, 'metadataProvider')
    dataSourceResolverMock.getDataSource.mockResolvedValueOnce(
      Either.success(adapterWithoutProvider),
    )

    const result = await sut.execute({
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
    })

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('METADATA_PROVIDER_NOT_AVAILABLE')
  })

  it('fails when getMappingFields is not supported by metadata provider', async () => {
    const providerWithoutMapping: IMetadataProvider = {
      getMetadata: vi.fn(),
    }
    const adapter = createMockAdapter(providerWithoutMapping)
    dataSourceResolverMock.getDataSource.mockResolvedValueOnce(
      Either.success(adapter),
    )

    const result = await sut.execute({
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
    })

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('MAPPING_FIELDS_NOT_SUPPORTED')
  })
})
