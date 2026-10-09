import { AppError, Either } from '@mr-tick/shared/helpers'
import { describe, expect, it, vi } from 'vitest'

import type {
  ILocalRuntimeEvents,
  ILocalWorkspaceExecutor,
  ILocalWorkspaceFactory,
  LocalRuntimeCommand,
  LocalRuntimeResult,
} from '../contracts/local-runtime'
import { LocalRuntime, validateLocalRuntimeRequest } from './LocalRuntime'

const emptyResult: LocalRuntimeResult = {
  entry: null,
  entries: [],
  timer: null,
  deleted: false,
}

class TestExecutor implements ILocalWorkspaceExecutor {
  readonly calls: string[] = []
  readonly closed = vi.fn(async () => Either.success())
  private releaseCommand: () => void = () => undefined
  readonly entered = new Promise<void>((resolve) => {
    this.releaseCommand = resolve
  })
  private releaseWait: () => void = () => undefined
  private readonly wait = new Promise<void>((resolve) => {
    this.releaseWait = resolve
  })

  constructor(private readonly shouldWait: boolean) {}

  async execute(
    input: LocalRuntimeCommand,
  ): Promise<Either<AppError, LocalRuntimeResult>> {
    this.calls.push(input.action)
    this.releaseCommand()
    if (this.shouldWait) await this.wait
    return Either.success(emptyResult)
  }
  async query(): Promise<Either<AppError, LocalRuntimeResult>> {
    this.calls.push('query')
    return Either.success(emptyResult)
  }
  close(): Promise<Either<AppError, void>> {
    return this.closed()
  }
  release(): void {
    this.releaseWait()
  }
}

function command(workspaceId: string): LocalRuntimeCommand {
  return {
    action: 'create',
    workspaceId,
    commandId: 'command',
    entryId: 'entry',
    payload: { taskId: '', timeSpentSeconds: 60 },
  }
}

describe('LocalRuntime ownership and ordering', () => {
  it('serializes one workspace while allowing another and opens each once', async () => {
    const first = new TestExecutor(true)
    const second = new TestExecutor(false)
    const open = vi.fn(async (workspaceId: string) => {
      if (workspaceId === 'first') return Either.success(first)
      return Either.success(second)
    })
    const events: ILocalRuntimeEvents = { committed: vi.fn() }
    const runtime = new LocalRuntime({ open }, events)
    const mutation = runtime.request(command('first'))
    await first.entered
    const read = runtime.request({
      action: 'get',
      workspaceId: 'first',
      entryId: 'entry',
    })
    const independent = await runtime.request({
      action: 'timerState',
      workspaceId: 'second',
    })
    expect(independent.ok).toBe(true)
    expect(first.calls).toEqual(['create'])
    expect(second.calls).toEqual(['query'])
    first.release()
    await mutation
    await read
    expect(first.calls).toEqual(['create', 'query'])
    expect(open).toHaveBeenCalledTimes(2)
    expect(events.committed).toHaveBeenCalledTimes(1)
  })

  it('propagates provider details without disguising failures and retries failed opening', async () => {
    const executor = new TestExecutor(false)
    let firstAttempt = true
    const factory: ILocalWorkspaceFactory = {
      open: async () => {
        if (firstAttempt) {
          firstAttempt = false
          return Either.failure(
            AppError.Http(403, 'ORIGINAL_PROVIDER_MESSAGE', {
              task: ['access denied'],
            }),
          )
        }
        return Either.success(executor)
      },
    }
    const runtime = new LocalRuntime(factory, { committed: vi.fn() })
    const failed = await runtime.request(command('workspace'))
    expect(failed).toEqual({
      ok: false,
      error: {
        statusCode: 403,
        messageKey: 'ORIGINAL_PROVIDER_MESSAGE',
        details: { task: ['access denied'] },
      },
    })
    const recovered = await runtime.request(command('workspace'))
    expect(recovered.ok).toBe(true)
  })

  it('waits in-flight work before close and refuses later requests', async () => {
    const executor = new TestExecutor(true)
    const runtime = new LocalRuntime(
      { open: async () => Either.success(executor) },
      { committed: vi.fn() },
    )
    const mutation = runtime.request(command('workspace'))
    await executor.entered
    const closing = runtime.close()
    expect(executor.closed).not.toHaveBeenCalled()
    const rejected = await runtime.request(command('workspace'))
    expect(rejected.ok).toBe(false)
    executor.release()
    await mutation
    expect((await closing).isSuccess()).toBe(true)
    expect(executor.closed).toHaveBeenCalledTimes(1)
  })

  it('closes every executor even if one returns a failure', async () => {
    const secondClose = vi.fn(async () => Either.success())
    const first: ILocalWorkspaceExecutor = {
      execute: async () => Either.success(emptyResult),
      query: async () => Either.success(emptyResult),
      close: async () =>
        Either.failure(AppError.Internal('FIRST_CLOSE_FAILED')),
    }
    const second: ILocalWorkspaceExecutor = {
      execute: async () => Either.success(emptyResult),
      query: async () => Either.success(emptyResult),
      close: secondClose,
    }
    const runtime = new LocalRuntime(
      {
        open: async (workspaceId) => {
          if (workspaceId === 'first') return Either.success(first)
          return Either.success(second)
        },
      },
      { committed: vi.fn() },
    )
    await runtime.request(command('first'))
    await runtime.request(command('second'))
    const closed = await runtime.close()
    expect(closed.isFailure()).toBe(true)
    expect(secondClose).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid durations and normalized impossible dates before opening persistence', async () => {
    const factory: ILocalWorkspaceFactory = { open: vi.fn() }
    const runtime = new LocalRuntime(factory, { committed: vi.fn() })
    const invalid = await runtime.request({
      ...command('workspace'),
      action: 'create',
      payload: { taskId: '', timeSpentSeconds: Number.NaN },
    })
    expect(invalid.ok).toBe(false)
    const dates = validateLocalRuntimeRequest({
      action: 'create',
      workspaceId: 'workspace',
      commandId: 'command',
      entryId: 'entry',
      payload: {
        taskId: '',
        timeSpentSeconds: 60,
        startDate: '2026-02-31T00:00:00.000Z',
      },
    })
    expect(dates.isFailure()).toBe(true)
    expect(factory.open).not.toHaveBeenCalled()
  })
})

describe('LocalRuntime workspace maintenance', () => {
  it('drains pending work, blocks new work and discards the cached executor', async () => {
    const first = new TestExecutor(true)
    const replacement = new TestExecutor(false)
    const open = vi.fn<ILocalWorkspaceFactory['open']>()
    open.mockResolvedValueOnce(Either.success(first))
    open.mockResolvedValue(Either.success(replacement))
    const runtime = new LocalRuntime({ open }, { committed: vi.fn() })
    const pending = runtime.request(command('workspace'))
    await first.entered
    const dispose = vi.fn(async () => Either.success())
    const maintenance = runtime.forgetWorkspace('workspace', dispose)
    const blocked = await runtime.request({
      action: 'list',
      workspaceId: 'workspace',
      filter: {},
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok)
      expect(blocked.error.messageKey).toBe('WORKSPACE_MAINTENANCE')
    expect(dispose).not.toHaveBeenCalled()
    first.release()
    expect((await pending).ok).toBe(true)
    expect((await maintenance).isSuccess()).toBe(true)
    expect(dispose).toHaveBeenCalledOnce()
    expect(
      (
        await runtime.request({
          action: 'list',
          workspaceId: 'workspace',
          filter: {},
        })
      ).ok,
    ).toBe(true)
    expect(open).toHaveBeenCalledTimes(2)
    expect(replacement.calls).toEqual(['query'])
    await runtime.close()
  })
})
