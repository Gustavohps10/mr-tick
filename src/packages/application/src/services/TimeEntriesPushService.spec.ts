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
import type { TimeEntryDTO } from '@/dtos'

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

  let fakeServerTimeEntry: TimeEntryDTO

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
      findById: vi.fn().mockResolvedValue(Either.success(null)),
      create: vi
        .fn()
        .mockResolvedValue(
          Either.success({ id: 'created-id', updatedAt: fakeCurrentTime }),
        ),
      update: vi
        .fn()
        .mockResolvedValue(
          Either.success({ id: 'updated-id', updatedAt: fakeCurrentTime }),
        ),
      delete: vi.fn().mockResolvedValue(Either.success(undefined)),
      pull: vi.fn(),
      findByMemberId: vi.fn(),
      findAll: vi.fn(),
    } as unknown as Mocked<ITimeEntryProvider>

    adapterMock = {
      timeEntriesProvider: timeEntriesProviderMock,
      getAuthenticatedMemberData: vi.fn().mockReturnValue(
        Either.success({
          id: 'member-1',
          firstname: 'John',
          lastname: 'Doe',
        }),
      ),
    } as unknown as Mocked<IDataSourceAdapter>

    dataSourceResolverMock = {
      getDataSource: vi.fn(),
    } as unknown as Mocked<IDataSourceResolver>

    fakeServerTimeEntry = {
      id: 'existing-1',
      updatedAt: fakeCurrentTime,
      createdAt: fakeCurrentTime,
      task: { id: 'task-1' },
      activity: { id: 'act-1', name: 'QA' },
      user: { id: 'usr-1', name: 'User' },
      timeSpent: 3600,
    }

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

    it('should forward failure if getAuthenticatedMemberData fails', async () => {
      adapterMock.getAuthenticatedMemberData.mockReturnValue(
        Either.failure(AppError.Unauthorized('TOKEN_EXPIRED')),
      )

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [],
      })

      expect(result.isFailure()).toBe(true)
      expect(result.failure.statusCode).toBe(401)
      expect(result.failure.messageKey).toBe('TOKEN_EXPIRED')
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

      timeEntriesProviderMock.findById.mockResolvedValue(
        Either.success(fakeServerTimeEntry),
      )

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      expect(timeEntriesProviderMock.update).toHaveBeenCalled()
      expect(result.success?.[0].syncedAt).toBeDefined()
    })

    it('should update task and activity on existing entry', async () => {
      const entry = {
        id: 'existing-1',
        _deleted: false,
        updatedAt: fakeCurrentTime,
        task: { id: 'new-task-id' },
        activity: { id: 'new-act-id', name: 'Design' },
        comments: 'Updated comments',
      } as SyncTimeEntryDTO

      timeEntriesProviderMock.findById.mockResolvedValue(
        Either.success(fakeServerTimeEntry),
      )

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      expect(timeEntriesProviderMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'existing-1',
          task: { id: 'new-task-id' },
          activity: { id: 'new-act-id', name: 'Design' },
          comments: 'Updated comments',
        }),
      )
      expect(result.success?.[0].task?.id).toBe('new-task-id')
      expect(result.success?.[0].activity?.id).toBe('new-act-id')
    })

    it('should return validation error if updateTask fails', async () => {
      const entry = {
        id: 'existing-1',
        _deleted: false,
        updatedAt: fakeCurrentTime,
        task: { id: '' },
      } as SyncTimeEntryDTO

      timeEntriesProviderMock.findById.mockResolvedValue(
        Either.success(fakeServerTimeEntry),
      )

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      expect(result.success?.[0].validationError?.messageKey).toBe(
        'CAMPOS_INVALIDOS',
      )
      expect(timeEntriesProviderMock.update).not.toHaveBeenCalled()
    })

    it('should return validation error if updateActivity fails', async () => {
      const entry = {
        id: 'existing-1',
        _deleted: false,
        updatedAt: fakeCurrentTime,
        activity: { id: '' },
      } as SyncTimeEntryDTO

      timeEntriesProviderMock.findById.mockResolvedValue(
        Either.success(fakeServerTimeEntry),
      )

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      expect(result.success?.[0].validationError?.messageKey).toBe(
        'CAMPOS_INVALIDOS',
      )
      expect(timeEntriesProviderMock.update).not.toHaveBeenCalled()
    })

    it('should detect conflict if server data diverged from assumedMasterState', async () => {
      const entry = {
        id: 'existing-1',
        _deleted: false,
        updatedAt: fakeCurrentTime,
        task: { id: 'task-1' },
        activity: { id: 'act-1', name: 'QA' },
        timeSpent: 7200,
        assumedMasterState: {
          updatedAt: fakeOldTime,
          task: { id: 'task-different' }, // Servidor mudou concorrentemente!
          activity: { id: 'act-1', name: 'QA' },
          timeSpent: 3600,
        },
      } as SyncTimeEntryDTO

      timeEntriesProviderMock.findById.mockResolvedValue(
        Either.success(fakeServerTimeEntry),
      )

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      const processed = result.success?.[0]
      expect(processed?.conflicted).toBe(true)
      expect(processed?.conflictData?.server?.id).toBe(fakeServerTimeEntry.id)
      expect(processed?.conflictData?.server?.activity.name).toBe('QA')
      expect(timeEntriesProviderMock.update).not.toHaveBeenCalled()
    })

    it('should NOT detect conflict if server data matches assumedMasterState even if timestamps differ', async () => {
      const entry = {
        id: 'existing-1',
        _deleted: false,
        updatedAt: fakeCurrentTime,
        task: { id: 'task-1' },
        activity: { id: 'act-1', name: 'QA' },
        timeSpent: 7200,
        assumedMasterState: {
          updatedAt: fakeOldTime,
          task: { id: 'task-1' }, // Mesmo task que fakeServerTimeEntry
          activity: { id: 'act-1', name: 'QA' },
          timeSpent: 3600, // Mesmo timeSpent que fakeServerTimeEntry
        },
      } as SyncTimeEntryDTO

      timeEntriesProviderMock.findById.mockResolvedValue(
        Either.success(fakeServerTimeEntry),
      )

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      const processed = result.success?.[0]
      expect(processed?.conflicted).toBeUndefined()
      expect(processed?.activity.name).toBe('QA')
      expect(timeEntriesProviderMock.update).toHaveBeenCalled()
    })

    it('should NOT detect conflict if entry data is already identical to server data even if timestamps differ', async () => {
      const entry = {
        id: 'existing-1',
        _deleted: false,
        updatedAt: fakeCurrentTime,
        task: { id: 'task-1' },
        activity: { id: 'act-1', name: 'QA' },
        timeSpent: 3600,
        assumedMasterState: {
          updatedAt: fakeOldTime,
        },
      } as SyncTimeEntryDTO

      timeEntriesProviderMock.findById.mockResolvedValue(
        Either.success(fakeServerTimeEntry),
      )

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      const processed = result.success?.[0]
      expect(processed?.conflicted).toBeUndefined()
      expect(processed?.activity.name).toBe('QA')
      expect(timeEntriesProviderMock.update).not.toHaveBeenCalled()
    })

    it('should forward domain validation errors during update', async () => {
      const entry = {
        id: 'existing-1',
        _deleted: false,
        updatedAt: fakeCurrentTime,
        timeSpent: -5,
      } as SyncTimeEntryDTO
      const domainError = AppError.ValidationError('CAMPOS_INVALIDOS')
      vi.spyOn(TimeEntry.prototype, 'updateHours').mockReturnValue(
        Either.failure(domainError),
      )

      timeEntriesProviderMock.findById.mockResolvedValue(
        Either.success(fakeServerTimeEntry),
      )

      const result = await sut.execute({
        workspaceId: 'w-1',
        pluginId: 'p-1',
        connectionInstanceId: 'c-1',
        entries: [entry],
      })

      expect(result.success?.[0].validationError?.messageKey).toBe(
        'CAMPOS_INVALIDOS',
      )
    })

    it('should create new entry successfully when not found in repository', async () => {
      const entry = {
        id: 'new-1',
        _deleted: false,
        updatedAt: fakeCurrentTime,
        task: { id: 't1' },
        activity: { id: 'a1' },
        user: { id: 'u1' },
        timeSpent: 1200,
      } as SyncTimeEntryDTO

      timeEntriesProviderMock.findById.mockResolvedValue(Either.success(null))

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
