import { AppError, Either } from '@mr-tick/shared/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AuthenticatedMember,
  IDataSourceAdapter,
  IDataSourceResolver,
  ITimeEntryProvider,
  PullTimeEntriesInput,
} from '@/contracts'
import { MemberDTO, TimeEntryPullPageDTO } from '@/dtos'

import { TimeEntriesPullService } from './TimeEntriesPullService'

const date = new Date('2026-04-18T00:00:00.000Z')
const member: MemberDTO = {
  id: 123,
  firstname: 'John',
  lastname: 'Doe',
  login: 'john',
  admin: false,
  createdOn: '2026-01-01',
  lastLoginOn: '2026-01-01',
  customFields: [],
}
const input: PullTimeEntriesInput = {
  workspaceId: 'workspace-123',
  connectionInstanceId: 'conn-abc',
  checkpoint: { updatedAt: date, id: 'entry-1', cursor: 'opaque-input-cursor' },
  batch: 100,
}
const page: TimeEntryPullPageDTO = {
  items: [
    {
      id: 'entry-1',
      task: { id: 'task-1' },
      activity: { id: 'act-1' },
      user: { id: '123' },
      timeSpent: 1,
      comments: 'Worked on authentication',
      createdAt: date,
      updatedAt: date,
    },
  ],
  checkpoint: {
    id: 'entry-1',
    updatedAt: date,
    cursor: 'opaque-output-cursor',
  },
  hasMore: false,
  snapshotId: 'snapshot-1',
}

describe('TimeEntriesPullService', () => {
  const pull = vi.fn<ITimeEntryProvider['pull']>()
  const auth = vi.fn<IDataSourceAdapter['getAuthenticatedMemberData']>()
  const resolve = vi.fn<IDataSourceResolver['getDataSource']>()
  let service: TimeEntriesPullService
  beforeEach(() => {
    vi.resetAllMocks()
    const provider: ITimeEntryProvider = {
      pull,
      findByMemberId: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
    const adapter: IDataSourceAdapter = {
      id: 'provider',
      timeEntriesProvider: provider,
      getAuthenticatedMemberData: auth,
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
    const authMember: AuthenticatedMember = {
      id: '123',
      firstname: 'John',
      lastname: 'Doe',
    }
    auth.mockReturnValue(Either.success(authMember))
    resolve.mockResolvedValue(Either.success(adapter))
    pull.mockResolvedValue(Either.success(page))
    service = new TimeEntriesPullService({
      getDataSource: resolve,
      getDataSourcesForWorkspace: vi.fn(),
    })
  })
  it('passes the provider page and opaque cursor unchanged through the service', async () => {
    const result = await service.execute(input)
    expect(result.success).toEqual(page)
    expect(pull).toHaveBeenCalledWith('123', input.checkpoint, input.batch)
    expect(result.success.checkpoint.cursor).toBe('opaque-output-cursor')
  })
  it('forwards the original provider failure and status', async () => {
    const failure = AppError.Unauthorized('TOKEN_EXPIRED')
    pull.mockResolvedValueOnce(Either.failure(failure))
    const result = await service.execute(input)
    expect(result.failure).toBe(failure)
    expect(result.failure.statusCode).toBe(401)
  })
  it('does not call the provider when authentication fails', async () => {
    const failure = AppError.Unauthorized('FALHA_DE_AUTENTICACAO')
    auth.mockReturnValueOnce(Either.failure(failure))
    expect((await service.execute(input)).failure).toBe(failure)
    expect(pull).not.toHaveBeenCalled()
  })
  it('reports an unexpected resolver exception', async () => {
    resolve.mockRejectedValueOnce(new Error('Fail'))
    const result = await service.execute(input)
    expect(result.failure.messageKey).toBe('ERRO_INESPERADO')
    expect(result.failure.statusCode).toBe(404)
  })
  it('reports an unexpected provider exception', async () => {
    pull.mockRejectedValueOnce(new Error('Timeout'))
    expect((await service.execute(input)).failure.messageKey).toBe(
      'ERRO_INESPERADO',
    )
  })

  it('preserves an alphanumeric providerSubjectId intact when calling pull', async () => {
    auth.mockReturnValueOnce(
      Either.success({
        id: 'usr_abc-123',
        firstname: 'Alpha',
        lastname: 'Numeric',
      }),
    )
    const result = await service.execute(input)
    expect(result.isSuccess()).toBe(true)
    expect(pull).toHaveBeenCalledWith(
      'usr_abc-123',
      input.checkpoint,
      input.batch,
    )
  })

  it('preserves a providerSubjectId with leading zeros intact when calling pull', async () => {
    auth.mockReturnValueOnce(
      Either.success({
        id: '00123',
        firstname: 'Zero',
        lastname: 'Leading',
      }),
    )
    const result = await service.execute(input)
    expect(result.isSuccess()).toBe(true)
    expect(pull).toHaveBeenCalledWith('00123', input.checkpoint, input.batch)
  })

  it('preserves a providerSubjectId exceeding MAX_SAFE_INTEGER intact when calling pull', async () => {
    auth.mockReturnValueOnce(
      Either.success({
        id: '9007199254740993',
        firstname: 'Large',
        lastname: 'Integer',
      }),
    )
    const result = await service.execute(input)
    expect(result.isSuccess()).toBe(true)
    expect(pull).toHaveBeenCalledWith(
      '9007199254740993',
      input.checkpoint,
      input.batch,
    )
  })
})
