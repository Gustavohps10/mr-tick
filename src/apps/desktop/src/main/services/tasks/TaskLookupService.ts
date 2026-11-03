import type {
  ICoreCacheTransport,
  IListTasksUseCase,
  ListTasksInput,
  PagedResultDTO,
  TaskDTO,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

type LookupResult = Either<AppError, PagedResultDTO<TaskDTO>>

interface PendingLookup {
  key: string
  input: ListTasksInput
  promise: Promise<LookupResult>
  resolve: (result: LookupResult) => void
}

interface LookupLane {
  running: PendingLookup | null
  pending: Map<string, PendingLookup>
  timer: ReturnType<typeof setTimeout> | null
  nextAllowedAt: number
}

/** One network budget for all windows and addons. Timers enforce rate, never consistency. */
export class TaskLookupService implements IListTasksUseCase {
  private readonly lanes = new Map<string, LookupLane>()
  private nextNetworkStartAt = 0
  private runningCount = 0

  constructor(
    private readonly listTasksService: IListTasksUseCase,
    private readonly localRuntime: ICoreCacheTransport,
  ) {}

  execute(input: ListTasksInput): Promise<LookupResult> {
    if (!input.workspaceId.trim() || !input.connectionInstanceId.trim())
      return Promise.resolve(
        Either.failure(AppError.ValidationError('TASK_ORIGIN_REQUIRED')),
      )

    const scope = JSON.stringify([
      input.workspaceId,
      input.connectionInstanceId,
    ])
    let lane = this.lanes.get(scope)

    if (lane === undefined) {
      lane = {
        running: null,
        pending: new Map(),
        timer: null,
        nextAllowedAt: 0,
      }
      this.lanes.set(scope, lane)
    }

    let consumerId = 'shared'
    if (input.consumerId !== undefined) consumerId = input.consumerId
    let page = 1
    let pageSize = 50
    if (input.page !== undefined) page = input.page
    if (input.pageSize !== undefined) pageSize = input.pageSize
    const key = JSON.stringify([
      input.workspaceId,
      input.connectionInstanceId,
      input.search,
      input.ids,
      page,
      pageSize,
    ])
    const ownPending = lane.pending.get(consumerId)
    if (ownPending?.key === key) return ownPending.promise
    this.removePending(lane, consumerId)
    if (lane.running?.key === key) return lane.running.promise
    const matching = Array.from(lane.pending.values()).find(
      (request) => request.key === key,
    )
    if (matching !== undefined) {
      lane.pending.set(consumerId, matching)
      return matching.promise
    }

    let complete: (result: LookupResult) => void = () => {}
    const promise = new Promise<LookupResult>((resolve) => {
      complete = resolve
    })
    lane.pending.set(consumerId, {
      key,
      input: { ...input, page, pageSize },
      promise,
      resolve: complete,
    })
    this.schedule(lane)
    return promise
  }

  cancel(
    workspaceId: string,
    connectionInstanceId: string,
    consumerId: string,
  ): void {
    const lane = this.lanes.get(
      JSON.stringify([workspaceId, connectionInstanceId]),
    )
    if (lane === undefined) return
    this.removePending(lane, consumerId)

    if (lane.pending.size === 0 && lane.timer !== null) {
      clearTimeout(lane.timer)
      lane.timer = null
    }
  }

  private removePending(lane: LookupLane, consumerId: string): void {
    const previous = lane.pending.get(consumerId)
    lane.pending.delete(consumerId)
    if (previous === undefined) return
    if (Array.from(lane.pending.values()).includes(previous)) return
    previous.resolve(
      Either.failure(AppError.Http(409, 'TASK_SEARCH_SUPERSEDED')),
    )
  }

  private schedule(lane: LookupLane): void {
    if (
      lane.running !== null ||
      lane.pending.size === 0 ||
      lane.timer !== null ||
      this.runningCount >= 3
    )
      return
    const remaining =
      Math.max(lane.nextAllowedAt, this.nextNetworkStartAt) - Date.now()

    if (remaining > 0) {
      lane.timer = setTimeout(() => {
        lane.timer = null
        this.schedule(lane)
      }, remaining)
      return
    }

    // FIFO across consumers; only the latest query of each consumer survives.
    const request = lane.pending.values().next().value
    if (request === undefined) return

    for (const [consumerId, pending] of lane.pending) {
      if (pending === request) lane.pending.delete(consumerId)
    }
    lane.running = request
    lane.nextAllowedAt = Date.now() + 400
    this.nextNetworkStartAt = lane.nextAllowedAt
    this.runningCount += 1
    void this.run(request).then((result) => {
      if (result.isFailure() && result.failure.statusCode === 429) {
        let blockedUntil = Date.now() + 5000
        const retryAfter = result.failure.details?.retryAfter?.find(
          (value) => value.trim().length > 0,
        )

        if (retryAfter !== undefined) {
          const seconds = Number(retryAfter)
          if (Number.isFinite(seconds) && seconds >= 0)
            blockedUntil = Date.now() + seconds * 1000
          const date = Date.parse(retryAfter)
          if (!Number.isFinite(seconds) && Number.isFinite(date))
            blockedUntil = Math.max(Date.now(), date)
        }

        lane.nextAllowedAt = Math.max(lane.nextAllowedAt, blockedUntil)
        this.nextNetworkStartAt = Math.max(
          this.nextNetworkStartAt,
          blockedUntil,
        )
      }

      lane.running = null
      this.runningCount -= 1
      request.resolve(result)
      for (const candidate of this.lanes.values()) this.schedule(candidate)
    })
  }

  private async run(request: PendingLookup): Promise<LookupResult> {
    const result = await this.listTasksService.execute({
      ...request.input,
      resolveExactId: request.input.search,
    })
    if (result.isFailure()) return result.forwardFailure()

    const persisted = await this.localRuntime.queryCore({
      action: 'cacheTasks',
      workspaceId: request.input.workspaceId,
      connectionInstanceId: request.input.connectionInstanceId,
      tasks: result.success.items,
    })
    if (!persisted.ok)
      return Either.failure(
        AppError.Http(persisted.error.statusCode, persisted.error.messageKey),
      )
    return result
  }
}
