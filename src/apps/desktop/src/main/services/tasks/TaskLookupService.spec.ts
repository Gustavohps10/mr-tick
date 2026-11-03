import type {
  ICoreCacheTransport,
  IListTasksUseCase,
  ListTasksInput,
  PagedResultDTO,
  TaskDTO,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TaskLookupService } from './TaskLookupService'

const page: PagedResultDTO<TaskDTO> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
}
const scope: ListTasksInput = {
  workspaceId: 'workspace',
  connectionInstanceId: 'connection',
}

function fixture() {
  const execute = vi
    .fn<IListTasksUseCase['execute']>()
    .mockResolvedValue(Either.success(page))
  const queryCore = vi
    .fn<ICoreCacheTransport['queryCore']>()
    .mockResolvedValue({ ok: true, value: { kind: 'cachedTasks' } })
  const transport = { queryCore } as unknown as ICoreCacheTransport
  return {
    service: new TaskLookupService({ execute }, transport),
    execute,
    queryCore,
  }
}

describe('Shared task lookup network budget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-03T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('shares equal inflight requests and persists through the owner', async () => {
    const { service, execute, queryCore } = fixture()
    const first = service.execute({ ...scope, search: 'ISSUE-9' })
    const second = service.execute({ ...scope, search: 'ISSUE-9' })
    expect(second).toBe(first)
    expect((await first).isSuccess()).toBe(true)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith({
      ...scope,
      search: 'ISSUE-9',
      resolveExactId: 'ISSUE-9',
      page: 1,
      pageSize: 50,
    })
    expect(queryCore).toHaveBeenCalledWith({
      action: 'cacheTasks',
      ...scope,
      tasks: [],
    })
  })

  it('keeps only the latest pending query and enforces the 400ms start interval', async () => {
    const { service, execute } = fixture()
    await service.execute({ ...scope, search: 'a' })
    const replaced = service.execute({ ...scope, search: 'ab' })
    const latest = service.execute({ ...scope, search: 'abc' })
    expect((await replaced).failure.messageKey).toBe('TASK_SEARCH_SUPERSEDED')
    await vi.advanceTimersByTimeAsync(399)
    expect(execute).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect((await latest).isSuccess()).toBe(true)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute.mock.lastCall?.at(0)?.search).toBe('abc')
  })

  it('does not serialize different origins behind a slow network operation', async () => {
    const { service, execute } = fixture()
    let complete: (
      value: Either<AppError, PagedResultDTO<TaskDTO>>,
    ) => void = () => {}
    execute.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const slow = service.execute({ ...scope, search: 'slow' })
    const fast = service.execute({
      ...scope,
      connectionInstanceId: 'other',
      search: 'fast',
    })
    await vi.advanceTimersByTimeAsync(400)
    expect((await fast).isSuccess()).toBe(true)
    complete(Either.success(page))
    await slow
  })

  it('preserves 429 and honors Retry-After without retrying automatically', async () => {
    const { service, execute } = fixture()
    execute.mockResolvedValueOnce(
      Either.failure(
        AppError.Http(429, 'Limit reached', { retryAfter: ['2'] }),
      ),
    )
    const failed = await service.execute({ ...scope, search: 'a' })
    expect(failed.failure.statusCode).toBe(429)
    const retry = service.execute({ ...scope, search: 'a' })
    await vi.advanceTimersByTimeAsync(1999)
    expect(execute).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect((await retry).isSuccess()).toBe(true)
  })

  it('does not acknowledge a result that the owner could not persist', async () => {
    const { service, queryCore } = fixture()
    queryCore.mockResolvedValueOnce({
      ok: false,
      error: { statusCode: 503, messageKey: 'OWNER_UNAVAILABLE' },
    })
    expect((await service.execute(scope)).failure.messageKey).toBe(
      'OWNER_UNAVAILABLE',
    )
  })

  it('does not supersede another consumer and cancels a closed consumer before sending', async () => {
    const { service, execute } = fixture()
    await service.execute(scope)
    const windowQuery = service.execute({
      ...scope,
      consumerId: 'main',
      search: 'main',
    })
    const widgetQuery = service.execute({
      ...scope,
      consumerId: 'widget',
      search: 'widget',
    })
    service.cancel(scope.workspaceId, scope.connectionInstanceId, 'widget')
    expect((await widgetQuery).failure.statusCode).toBe(409)
    await vi.advanceTimersByTimeAsync(400)
    expect((await windowQuery).isSuccess()).toBe(true)
    expect(execute).toHaveBeenCalledTimes(2)
  })
})
