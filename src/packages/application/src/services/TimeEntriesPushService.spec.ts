import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  IDataSourceAdapter,
  IDataSourceResolver,
  IKeyedMutex,
  ITimeEntryProvider,
  IWorkspacesRepository,
} from '@/contracts'
import { PushTimeEntriesInput, SyncTimeEntryDTO } from '@/contracts/use-cases'
import { MemberDTO, TimeEntryDTO } from '@/dtos'

import { TimeEntriesPushService } from './TimeEntriesPushService'

const member: MemberDTO = {
  id: 1,
  firstname: 'Test',
  lastname: 'User',
  login: 'test',
  admin: false,
  createdOn: '2026-01-01',
  lastLoginOn: '2026-01-01',
  customFields: [],
}
const local: SyncTimeEntryDTO = {
  id: '12ab-local-uuid',
  correlationId: '12ab-local-uuid',
  _deleted: false,
  task: { id: '101' },
  activity: { id: '9' },
  user: { id: '1' },
  startDate: new Date(2026, 8, 24, 8),
  endDate: new Date(2026, 8, 24, 9, 20),
  timeSpent: 1.3333,
  comments: 'typed',
  createdAt: new Date('2026-09-24T11:00:00Z'),
  updatedAt: new Date('2026-09-24T11:00:00Z'),
}
const canonical: TimeEntryDTO = {
  ...local,
  id: '500',
  startDate: new Date(2026, 8, 24, 12),
  endDate: new Date(new Date(2026, 8, 24, 12).getTime() + 1.33 * 3600000),
  timeSpent: 1.33,
  updatedAt: new Date('2026-09-24T11:00:05Z'),
}
const input: Omit<PushTimeEntriesInput, 'entries'> = {
  workspaceId: 'ws',
  connectionInstanceId: 'conn',
  pluginId: 'redmine',
}

class TestMutex implements IKeyedMutex {
  readonly keys: string[] = []
  private readonly tails = new Map<string, Promise<void>>()
  runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    this.keys.push(key)
    const previous = this.tails.get(key)
    const result = previous ? previous.then(operation) : operation()
    this.tails.set(
      key,
      result.then(() => undefined),
    )
    return result
  }
}

describe('TimeEntriesPushService', () => {
  const lookup = vi.fn<NonNullable<ITimeEntryProvider['findByCorrelation']>>()
  const findById = vi.fn<ITimeEntryProvider['findById']>()
  const create = vi.fn<ITimeEntryProvider['create']>()
  const update = vi.fn<ITimeEntryProvider['update']>()
  const remove = vi.fn<ITimeEntryProvider['delete']>()
  const workspaceLookup = vi.fn<IWorkspacesRepository['findById']>()
  let provider: ITimeEntryProvider
  let sut: TimeEntriesPushService
  let mutex: TestMutex
  let adapter: IDataSourceAdapter

  beforeEach(() => {
    vi.resetAllMocks()
    lookup.mockResolvedValue(Either.success(null))
    findById.mockResolvedValue(Either.success(canonical))
    create.mockResolvedValue(
      Either.success({
        id: '500',
        updatedAt: canonical.updatedAt,
        entry: canonical,
      }),
    )
    update.mockResolvedValue(
      Either.success({
        id: '500',
        updatedAt: canonical.updatedAt,
        entry: canonical,
      }),
    )
    remove.mockResolvedValue(Either.success(undefined))
    provider = {
      timeEntryCreateIdempotency: 'reconcilable',
      findByCorrelation: lookup,
      findById,
      create,
      update,
      delete: remove,
      pull: vi.fn(),
      findAll: vi.fn(),
      findByMemberId: vi.fn(),
    }
    const workspace = Workspace.create({ name: 'Test workspace' })
    if (workspace.isSuccess())
      workspaceLookup.mockResolvedValue(workspace.success)
    const repository: IWorkspacesRepository = {
      findById: workspaceLookup,
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
    adapter = {
      id: 'redmine',
      timeEntriesProvider: provider,
      getAuthenticatedMemberData: () => Either.success(member),
      authenticationStrategy: { authenticate: vi.fn() },
      tasksProvider: {
        pull: vi.fn(),
        findAll: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      membersProvider: {
        getCurrentUser: vi.fn(),
        findById: vi.fn(),
        findByCredentials: vi.fn(),
        findAll: vi.fn(),
      },
      metadataProvider: { getMetadata: vi.fn() },
    }
    const resolver: IDataSourceResolver = {
      getDataSource: async () => ({
        ...adapter,
        timeEntriesProvider: provider,
      }),
      getDataSourcesForWorkspace: vi.fn(),
    }
    mutex = new TestMutex()
    sut = new TimeEntriesPushService(repository, resolver, mutex)
  })

  const push = (entry: SyncTimeEntryDTO) =>
    sut.execute({ ...input, entries: [entry] })

  it('rejects a missing workspace before reaching the provider', async () => {
    workspaceLookup.mockResolvedValue(undefined)
    const result = await push(local)
    expect(result.failure.messageKey).toBe('WORKSPACE_NAO_ENCONTRADO')
    expect(create).not.toHaveBeenCalled()
  })

  it('forwards authentication errors unchanged', async () => {
    adapter.getAuthenticatedMemberData = () =>
      Either.failure(AppError.Unauthorized('TOKEN_EXPIRED'))
    expect((await push(local)).failure.messageKey).toBe('TOKEN_EXPIRED')
  })

  it('does not look up a local UUID as a remote ID and returns the stored state', async () => {
    const result = await push(local)
    expect(findById).not.toHaveBeenCalled()
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(1)
    expect(result.success.at(0)).toMatchObject({
      id: '500',
      originalId: local.id,
      timeSpent: 1.33,
      startDate: canonical.startDate,
    })
  })

  it('serializes two concurrent stale requests and reconciles the second', async () => {
    lookup
      .mockResolvedValueOnce(Either.success(null))
      .mockResolvedValueOnce(Either.success(canonical))
    await Promise.all([push(local), push(local)])
    expect(create).toHaveBeenCalledTimes(1)
    expect(mutex.keys).toHaveLength(2)
    expect(new Set(mutex.keys).size).toBe(1)
  })

  it('isolates the queue by workspace and connection', async () => {
    await Promise.all([
      push(local),
      sut.execute({
        ...input,
        connectionInstanceId: 'conn2',
        entries: [local],
      }),
      sut.execute({ ...input, workspaceId: 'ws2', entries: [local] }),
    ])
    expect(new Set(mutex.keys).size).toBe(3)
  })

  it('recovers an accepted POST with a lost response immediately without posting again', async () => {
    create.mockResolvedValue(Either.failure(AppError.Internal('RESPONSE_LOST')))
    lookup
      .mockResolvedValueOnce(Either.success(null))
      .mockResolvedValueOnce(Either.success(canonical))
    const result = await push(local)
    expect(create).toHaveBeenCalledTimes(1)
    expect(result.success.at(0)?.timeSpent).toBe(1.33)
    expect(result.success.at(0)?.validationError).toBeUndefined()
  })

  it('reconciles a persisted attempt using its original date and task after local edits', async () => {
    lookup.mockResolvedValue(Either.success(canonical))
    const edited: SyncTimeEntryDTO = {
      ...local,
      task: { id: '202' },
      startDate: new Date(2026, 8, 28, 8),
      creationAttempted: true,
      creationState: local,
    }
    await push(edited)
    expect(lookup).toHaveBeenCalledWith(local.correlationId, local)
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps a transient lookup failure recoverable and preserves its message', async () => {
    lookup.mockResolvedValue(
      Either.failure(AppError.Internal('REDMINE_UNAVAILABLE')),
    )
    const result = await push({ ...local, creationAttempted: true })
    expect(result.success.at(0)).toMatchObject({
      creationPending: true,
      creationAmbiguous: false,
    })
    expect(result.success.at(0)?.validationError?.messageKey).toBe(
      'REDMINE_UNAVAILABLE',
    )
    expect(create).not.toHaveBeenCalled()
  })

  it('blocks an attempt when reconciliation finds no record', async () => {
    const result = await push({ ...local, creationAttempted: true })
    expect(result.success.at(0)?.creationAmbiguous).toBe(true)
    expect(create).not.toHaveBeenCalled()
  })

  it('blocks duplicate correlation results instead of selecting a record', async () => {
    lookup.mockResolvedValue(
      Either.failure(
        AppError.ValidationError('DUPLICATE_TIME_ENTRY_CORRELATION'),
      ),
    )
    expect(
      (await push({ ...local, creationAttempted: true })).success.at(0)
        ?.creationAmbiguous,
    ).toBe(true)
    expect(create).not.toHaveBeenCalled()
  })

  it('requires confirmation for providers without reconciliation', async () => {
    provider = { ...provider, timeEntryCreateIdempotency: 'none' }
    expect(
      (await push({ ...local, creationAttempted: true })).success.at(0)
        ?.creationAmbiguous,
    ).toBe(true)
    expect(lookup).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('replays native idempotency with the original payload', async () => {
    provider = { ...provider, timeEntryCreateIdempotency: 'native' }
    await push({
      ...local,
      comments: 'later edit',
      creationAttempted: true,
      creationState: local,
    })
    expect(create).toHaveBeenCalledWith(local)
  })

  it('does not delete an unattempted local draft on the remote provider', async () => {
    await push({ ...local, _deleted: true })
    expect(remove).not.toHaveBeenCalled()
  })

  it('reconciles before deleting a creation whose acknowledgement was lost', async () => {
    lookup.mockResolvedValue(Either.success(canonical))
    await push({
      ...local,
      _deleted: true,
      creationAttempted: true,
      creationState: local,
    })
    expect(remove).toHaveBeenCalledWith('500')
    expect(create).not.toHaveBeenCalled()
  })

  it('does not delete a local UUID when the remote creation cannot be found', async () => {
    expect(
      (
        await push({ ...local, _deleted: true, creationAttempted: true })
      ).success.at(0)?.creationAmbiguous,
    ).toBe(true)
    expect(remove).not.toHaveBeenCalled()
  })

  it('treats an already deleted remote record as a successful delete', async () => {
    remove.mockResolvedValue(Either.failure(AppError.NotFound('NOT_FOUND')))
    expect(
      (await push({ ...local, remoteId: '500', _deleted: true })).success.at(0)
        ?.validationError,
    ).toBeUndefined()
  })

  it('does not recreate a linked entry that disappeared remotely', async () => {
    findById.mockResolvedValue(Either.success(null))
    expect(
      (await push({ ...local, remoteId: '500' })).success.at(0)
        ?.creationAmbiguous,
    ).toBe(true)
    expect(create).not.toHaveBeenCalled()
  })

  it('uses the canonical baseline for an edit despite client clock skew and normalization', async () => {
    const edited: SyncTimeEntryDTO = {
      ...canonical,
      remoteId: '500',
      comments: 'edited',
      updatedAt: new Date('2030-01-01'),
      assumedMasterState: canonical,
    }
    const result = await push(edited)
    expect(result.success.at(0)?.conflicted).toBeUndefined()
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ comments: 'edited' }),
    )
    expect(result.success.at(0)?.timeSpent).toBe(1.33)
  })

  it('detects an external edit within the same timestamp second', async () => {
    findById.mockResolvedValue(
      Either.success({ ...canonical, comments: 'remote edit' }),
    )
    const result = await push({
      ...canonical,
      remoteId: '500',
      comments: 'local edit',
      assumedMasterState: canonical,
    })
    expect(result.success.at(0)?.conflicted).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('does not write again if a previous PUT was accepted but its response was lost', async () => {
    const result = await push({
      ...canonical,
      remoteId: '500',
      assumedMasterState: local,
    })
    expect(result.success.at(0)?.conflicted).toBeUndefined()
    expect(update).not.toHaveBeenCalled()
  })

  it('clears an existing comment rather than preserving it when the local value is absent', async () => {
    await push({
      ...canonical,
      remoteId: '500',
      comments: undefined,
      assumedMasterState: canonical,
    })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ comments: undefined }),
    )
  })

  it('reads canonical data for older addons that return only an ID', async () => {
    create.mockResolvedValue(Either.success({ id: '500' }))
    expect((await push(local)).success.at(0)?.timeSpent).toBe(1.33)
    expect(findById).toHaveBeenCalledWith('500')
  })

  it('preserves domain validation errors', async () => {
    const result = await push({ ...local, timeSpent: 20 })
    expect(result.success.at(0)?.validationError?.messageKey).toBe(
      'TEMPO_INCONSISTENTE',
    )
    expect(create).not.toHaveBeenCalled()
  })
  it('resolves the authenticated user in the frozen creation payload before recovery', async () => {
    lookup.mockResolvedValue(Either.success(canonical))
    await push({
      ...local,
      user: { id: 'local-user' },
      creationAttempted: true,
      creationState: { ...local, user: { id: 'local-user' } },
    })
    expect(lookup).toHaveBeenCalledWith(
      local.correlationId,
      expect.objectContaining({ user: { id: '1', name: 'Test User' } }),
    )
    expect(create).not.toHaveBeenCalled()
  })

  it.each([408, 429, 500, 503])(
    'preserves retryable update failure %i',
    async (statusCode) => {
      update.mockResolvedValue(
        Either.failure(AppError.Http(statusCode, 'UPDATE_UNAVAILABLE')),
      )
      const result = await push({
        ...canonical,
        correlationId: local.id,
        remoteId: canonical.id,
        comments: 'changed',
        assumedMasterState: canonical,
      })
      expect(result.success.at(0)).toMatchObject({
        syncRetryable: true,
        validationError: { statusCode, messageKey: 'UPDATE_UNAVAILABLE' },
      })
      expect(create).not.toHaveBeenCalled()
    },
  )

  it.each([408, 429, 500, 503])(
    'preserves retryable deletion failure %i',
    async (statusCode) => {
      remove.mockResolvedValue(
        Either.failure(AppError.Http(statusCode, 'DELETE_UNAVAILABLE')),
      )
      const result = await push({
        ...local,
        remoteId: canonical.id,
        _deleted: true,
      })
      expect(result.success.at(0)).toMatchObject({
        syncRetryable: true,
        remoteId: canonical.id,
        _deleted: true,
        validationError: { statusCode, messageKey: 'DELETE_UNAVAILABLE' },
      })
    },
  )

  it('does not automatically retry a permanent provider validation failure', async () => {
    update.mockResolvedValue(
      Either.failure(AppError.Http(422, 'INVALID_HOURS')),
    )
    const result = await push({
      ...canonical,
      remoteId: canonical.id,
      correlationId: local.id,
      comments: 'changed',
      assumedMasterState: canonical,
    })
    expect(result.success.at(0)?.syncRetryable).toBe(false)
    expect(result.success.at(0)?.validationError?.messageKey).toBe(
      'INVALID_HOURS',
    )
  })

  it.each(['none', 'native', 'reconcilable'])(
    'a POST timeout preserves creation recovery for %s providers',
    async (capability) => {
      if (capability === 'none')
        provider = { ...provider, timeEntryCreateIdempotency: 'none' }
      if (capability === 'native')
        provider = { ...provider, timeEntryCreateIdempotency: 'native' }
      create.mockResolvedValue(
        Either.failure(AppError.Http(408, 'CREATE_TIMEOUT')),
      )
      if (capability === 'reconcilable')
        lookup
          .mockResolvedValueOnce(Either.success(null))
          .mockResolvedValueOnce(Either.success(canonical))
      const result = await push(local)
      expect(result.success.at(0)?.syncRetryable).not.toBe(true)
      expect(create).toHaveBeenCalledTimes(1)
      if (capability === 'none')
        expect(result.success.at(0)?.creationAmbiguous).toBe(true)
      if (capability === 'native')
        expect(result.success.at(0)).toMatchObject({
          creationPending: true,
          creationAttempted: true,
        })
      if (capability === 'reconcilable')
        expect(result.success.at(0)?.remoteId).toBe(canonical.id)
    },
  )

  it('uses server-side conditional update when the provider supports it', async () => {
    const conditional =
      vi.fn<NonNullable<ITimeEntryProvider['updateConditional']>>()
    conditional.mockResolvedValue(
      Either.success({
        id: '500',
        entry: { ...canonical, comments: 'changed' },
      }),
    )
    provider = { ...provider, updateConditional: conditional }
    const result = await push({
      ...canonical,
      remoteId: '500',
      comments: 'changed',
      assumedMasterState: canonical,
    })
    expect(conditional).toHaveBeenCalledWith(
      expect.objectContaining({ id: '500', comments: 'changed' }),
      canonical,
    )
    expect(update).not.toHaveBeenCalled()
    expect(result.success.at(0)?.comments).toBe('changed')
  })

  it.each([409, 412])(
    'a conditional mismatch %i rereads the server and produces a conflict without overwriting it',
    async (statusCode) => {
      const conditional =
        vi.fn<NonNullable<ITimeEntryProvider['updateConditional']>>()
      conditional.mockResolvedValue(
        Either.failure(AppError.Http(statusCode, 'EXTERNAL_CONCURRENT_CHANGE')),
      )
      provider = { ...provider, updateConditional: conditional }
      const external = {
        ...canonical,
        comments: 'external',
        updatedAt: new Date('2026-10-03T12:00:00Z'),
      }
      findById
        .mockResolvedValueOnce(Either.success(canonical))
        .mockResolvedValueOnce(Either.success(external))
      const result = await push({
        ...canonical,
        remoteId: '500',
        comments: 'local',
        assumedMasterState: canonical,
      })
      expect(result.success.at(0)).toMatchObject({
        conflicted: true,
        conflictData: { server: external },
        validationError: {
          statusCode,
          messageKey: 'EXTERNAL_CONCURRENT_CHANGE',
        },
      })
      expect(update).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    },
  )
  it.each(['create', 'update'])(
    'retries only GET after a confirmed legacy %s and failed canonical read',
    async (operation) => {
      create.mockResolvedValue(
        Either.success({ id: '500', updatedAt: canonical.updatedAt }),
      )
      update.mockResolvedValue(
        Either.success({ id: '500', updatedAt: canonical.updatedAt }),
      )
      const entry: SyncTimeEntryDTO =
        operation === 'update'
          ? {
              ...local,
              remoteId: '500',
              assumedMasterState: { ...local, id: '500', comments: 'before' },
            }
          : local
      if (operation === 'update')
        findById.mockResolvedValueOnce(
          Either.success({ ...local, id: '500', comments: 'before' }),
        )
      findById.mockResolvedValueOnce(
        Either.failure(AppError.Http(503, 'CANONICAL_READ_UNAVAILABLE')),
      )
      const first = await sut.execute({ ...input, entries: [entry] })
      expect(first.isSuccess()).toBe(true)
      if (first.isFailure()) return
      const pending = first.success.find((result) => result.confirmationPending)
      expect(pending).toBeDefined()
      if (!pending) return
      expect(pending.remoteId).toBe('500')
      expect(pending.creationPending).toBe(false)
      expect(pending.syncRetryable).toBe(true)
      findById.mockResolvedValue(Either.success(canonical))
      const recovered = await sut.execute({ ...input, entries: [pending] })
      expect(recovered.isSuccess()).toBe(true)
      if (recovered.isFailure()) return
      expect(recovered.success).toEqual([
        expect.objectContaining({
          confirmationPending: false,
          remoteId: '500',
          startDate: canonical.startDate,
          timeSpent: canonical.timeSpent,
        }),
      ])
      expect(recovered.success.some((result) => result.conflicted)).toBe(false)
      expect(create).toHaveBeenCalledTimes(operation === 'create' ? 1 : 0)
      expect(update).toHaveBeenCalledTimes(operation === 'update' ? 1 : 0)
    },
  )
  it.each([200, 404, 503])(
    'distinguishes DELETE from canonical confirmation and clears its inherited flags: %s',
    async (statusCode) => {
      if (statusCode !== 200)
        remove.mockResolvedValueOnce(
          Either.failure(AppError.Http(statusCode, 'DELETE_RESULT')),
        )
      const result = await sut.execute({
        ...input,
        entries: [
          {
            ...local,
            remoteId: '500',
            _deleted: true,
            confirmationPending: true,
          },
        ],
      })
      expect(result.isSuccess()).toBe(true)
      if (result.isFailure()) return
      expect(result.success).toEqual([
        expect.objectContaining({
          confirmationPending: false,
          creationPending: false,
          syncRetryable: statusCode === 503,
        }),
      ])
      expect(remove).toHaveBeenCalledOnce()
      expect(findById).not.toHaveBeenCalled()
    },
  )
  it.each(['null', '404'])(
    'confirmed write with canonical absence (%s) leaves the read ledger without automatically creating',
    async (absence) => {
      if (absence === 'null')
        findById.mockResolvedValueOnce(Either.success(null))
      if (absence === '404')
        findById.mockResolvedValueOnce(
          Either.failure(
            AppError.Http(404, 'ORIGINAL_REMOTE_ABSENCE', {
              entry: ['not found'],
            }),
          ),
        )
      const result = await sut.execute({
        ...input,
        entries: [
          {
            ...local,
            remoteId: '500',
            confirmationPending: true,
            syncRetryable: true,
          },
        ],
      })
      expect(result.isSuccess()).toBe(true)
      if (result.isFailure()) return
      expect(result.success).toMatchObject([
        {
          creationAmbiguous: true,
          confirmationPending: false,
          creationPending: false,
          syncRetryable: false,
        },
      ])
      if (absence === '404')
        expect(result.success).toMatchObject([
          {
            validationError: {
              statusCode: 404,
              messageKey: 'ORIGINAL_REMOTE_ABSENCE',
              details: { entry: ['not found'] },
            },
          },
        ])
      expect(create).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
    },
  )
  it.each(['create', 'update'])(
    'the first canonical GET404 after ID-only %s exposes ambiguity and preserves original absence',
    async (operation) => {
      if (operation === 'create')
        create.mockResolvedValueOnce(
          Either.success({ id: '500', updatedAt: canonical.updatedAt }),
        )
      if (operation === 'update') {
        update.mockResolvedValueOnce(
          Either.success({ id: '500', updatedAt: canonical.updatedAt }),
        )
        findById.mockResolvedValueOnce(Either.success(canonical))
      }
      findById.mockResolvedValueOnce(
        Either.failure(
          AppError.Http(404, 'ORIGINAL_REMOTE_ABSENCE', {
            entry: ['not found'],
          }),
        ),
      )
      const entry =
        operation === 'create' ? local : { ...local, remoteId: '500' }
      const result = await sut.execute({ ...input, entries: [entry] })
      expect(result.isSuccess()).toBe(true)
      if (result.isFailure()) return
      expect(result.success).toMatchObject([
        {
          remoteId: '500',
          creationAmbiguous: true,
          confirmationPending: false,
          syncRetryable: false,
          validationError: {
            statusCode: 404,
            messageKey: 'ORIGINAL_REMOTE_ABSENCE',
            details: { entry: ['not found'] },
          },
        },
      ])
      expect(create).toHaveBeenCalledTimes(operation === 'create' ? 1 : 0)
      expect(update).toHaveBeenCalledTimes(operation === 'update' ? 1 : 0)
    },
  )
  it('updates hours and comments of an existing remote entry whose task is absent', async () => {
    const existing = { ...canonical, task: { id: '' } }
    findById.mockResolvedValueOnce(Either.success(existing))
    const edited = {
      ...existing,
      remoteId: '500',
      correlationId: local.correlationId,
      comments: 'project notes edited',
      timeSpent: 2,
      endDate: new Date(new Date(2026, 8, 24, 12).getTime() + 2 * 3600000),
      assumedMasterState: existing,
    }
    update.mockResolvedValueOnce(Either.success({ id: '500', entry: edited }))
    const result = await push(edited)
    expect(update).toHaveBeenCalledTimes(1)
    expect(result.success[0]?.validationError).toBeUndefined()
    expect(result.success[0]?.comments).toBe(edited.comments)
    expect(result.success[0]?.task.id).toBe('')
  })
})
