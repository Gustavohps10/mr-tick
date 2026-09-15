import { TimeEntry } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  IDataSourceResolver,
  ITimeEntryProvider,
  IWorkspacesRepository,
} from '@/contracts'
import type { IDataSourceAdapter } from '@/contracts/resolvers/IDataSourceAdapter'
import type { SyncTimeEntryDTO } from '@/contracts/use-cases'

import { TimeEntriesPushService } from './TimeEntriesPushService'

describe('TimeEntriesPushService', () => {
  let sut: TimeEntriesPushService

  let workspacesRepositoryMock: Mocked<IWorkspacesRepository>
  let dataSourceResolverMock: Mocked<IDataSourceResolver>
  let adapterMock: Mocked<IDataSourceAdapter>
  let timeEntriesProviderMock: Mocked<ITimeEntryProvider>

  const fakeCurrentTime = new Date('2026-04-18T12:00:00.000Z')
  const fakeOldTime = new Date('2026-04-17T10:00:00.000Z')

  const fakeWorkspace = { id: 'workspace-123' }

  let fakeDomainTimeEntry: Mocked<TimeEntry>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(fakeCurrentTime)

    workspacesRepositoryMock = {
      findById: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<IWorkspacesRepository>

    timeEntriesProviderMock = {
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      pull: vi.fn(),
      findByMemberId: vi.fn(),
      findAll: vi.fn(),
    } as unknown as Mocked<ITimeEntryProvider>

    adapterMock = {
      timeEntriesProvider: timeEntriesProviderMock,
    } as unknown as Mocked<IDataSourceAdapter>

    dataSourceResolverMock = {
      getDataSource: vi.fn(),
    } as unknown as Mocked<IDataSourceResolver>

    fakeDomainTimeEntry = {
      id: 'existing-id',
      updatedAt: fakeCurrentTime,
      updateHours: vi.fn().mockReturnValue(Either.success()),
      updateComments: vi.fn().mockReturnValue(Either.success()),
    } as unknown as Mocked<TimeEntry>

    sut = new TimeEntriesPushService(
      workspacesRepositoryMock,
      dataSourceResolverMock,
    )

    workspacesRepositoryMock.findById.mockResolvedValue(fakeWorkspace as any)
    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Main Flow Authorization', () => {
    it('should return Unauthorized error if workspace is not found', async () => {
      workspacesRepositoryMock.findById.mockResolvedValue(null as any)

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [],
      })

      expect(result.isFailure()).toBe(true)
      expect(result.failure.statusCode).toBe(401)
      expect(result.failure.messageKey).toBe('WORKSPACE_NAO_ENCONTRADO')
    })

    it('should return Internal error if an unexpected error occurs in the setup', async () => {
      dataSourceResolverMock.getDataSource.mockRejectedValue(new Error('Crash'))

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [],
      })

      expect(result.isFailure()).toBe(true)
      expect(result.failure.statusCode).toBe(500)
      expect(result.failure.messageKey).toBe('ERRO_INESPERADO')
    })
  })

  describe('Document Validation', () => {
    it('should assign validation error if document id is missing', async () => {
      const entry = { _deleted: false } as SyncTimeEntryDTO

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      expect(result.success?.[0].validationError?.messageKey).toBe(
        'DOCUMENT_ID_MISSING',
      )
    })

    it('should assign validation error if updatedAt is missing on non-deleted entries', async () => {
      const entry = { id: '123', _deleted: false } as SyncTimeEntryDTO

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      expect(result.success?.[0].validationError?.messageKey).toBe(
        'DOCUMENT_UPDATED_AT_MISSING',
      )
    })
  })

  describe('Processing Logic', () => {
    it('should delete entry when _deleted is true', async () => {
      const entry = { id: 'del-1', _deleted: true } as SyncTimeEntryDTO

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      expect(timeEntriesProviderMock.delete).toHaveBeenCalledWith('del-1')
      expect(result.success?.[0].syncedAt).toEqual(fakeCurrentTime)
    })

    it('should update existing entry and handle conflict check', async () => {
      const entry = {
        id: 'existing-1',
        _deleted: false,
        updatedAt: fakeCurrentTime,
        assumedMasterState: { updatedAt: fakeCurrentTime }, // No conflict
        comments: 'New comment',
      } as SyncTimeEntryDTO

      timeEntriesProviderMock.findById.mockResolvedValue(fakeDomainTimeEntry)

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      expect(fakeDomainTimeEntry.updateHours).toHaveBeenCalled()
      expect(timeEntriesProviderMock.update).toHaveBeenCalledWith(
        fakeDomainTimeEntry,
      )
      expect(result.success?.[0].syncedAt).toBeDefined()
    })

    it('should detect conflict if assumedMasterState differs from server', async () => {
      const entry = {
        id: 'existing-1',
        _deleted: false,
        updatedAt: fakeCurrentTime,
        assumedMasterState: { updatedAt: fakeOldTime }, // Conflito!
      } as SyncTimeEntryDTO

      timeEntriesProviderMock.findById.mockResolvedValue(fakeDomainTimeEntry)

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      const processed = result.success?.[0]
      expect(processed?.conflicted).toBe(true)
      expect(processed?.conflictData?.server).toBe(fakeDomainTimeEntry)
      expect(timeEntriesProviderMock.update).not.toHaveBeenCalled()
    })

    it('should forward domain validation errors during update', async () => {
      const entry = {
        id: '123',
        _deleted: false,
        updatedAt: fakeCurrentTime,
      } as SyncTimeEntryDTO
      const domainError = AppError.ValidationError('INVALID_RANGE')

      fakeDomainTimeEntry.updateHours.mockReturnValue(
        Either.failure(domainError),
      )
      timeEntriesProviderMock.findById.mockResolvedValue(fakeDomainTimeEntry)

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      expect(result.success?.[0].validationError).toBe(domainError)
    })

    it('should create new entry successfully when not found in repository', async () => {
      const entry = {
        id: 'new-1',
        _deleted: false,
        updatedAt: fakeCurrentTime,
        task: { id: 't1' },
        activity: { id: 'a1' },
        user: { id: 'u1' },
      } as SyncTimeEntryDTO

      timeEntriesProviderMock.findById.mockResolvedValue(null as any)
      vi.spyOn(TimeEntry, 'create').mockReturnValue(
        Either.success(fakeDomainTimeEntry),
      )

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      expect(timeEntriesProviderMock.create).toHaveBeenCalled()
      expect(result.success?.[0].syncedAt).toEqual(fakeCurrentTime)
    })

    it('should assign processing error if any exception occurs during single entry processing', async () => {
      const entry = {
        id: '123',
        _deleted: false,
        updatedAt: fakeCurrentTime,
      } as SyncTimeEntryDTO
      timeEntriesProviderMock.findById.mockRejectedValue(new Error('DB Down'))

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      expect(result.success?.[0].validationError?.messageKey).toBe(
        'ERRO_PROCESSAMENTO_DOCUMENTO',
      )
    })
  })
})
