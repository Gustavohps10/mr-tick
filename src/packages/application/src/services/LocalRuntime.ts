import {
  AppError,
  Either,
  isNonEmptyString,
  isNumber,
  isRecord,
  isString,
} from '@mr-tick/shared/helpers'

import type {
  ILocalRuntimeAPI,
  ILocalRuntimeEvents,
  ILocalWorkspaceExecutor,
  ILocalWorkspaceFactory,
  LocalRuntimeCommand,
  LocalRuntimeRequest,
  LocalRuntimeResponse,
  LocalRuntimeResult,
} from '../contracts/local-runtime'

export class LocalRuntime implements ILocalRuntimeAPI {
  private readonly executors = new Map<string, ILocalWorkspaceExecutor>()
  private readonly tails = new Map<string, Promise<void>>()
  private stopping = false
  private readonly maintenance = new Set<string>()

  constructor(
    private readonly factory: ILocalWorkspaceFactory,
    private readonly events: ILocalRuntimeEvents,
  ) {}

  async request(input: LocalRuntimeRequest): Promise<LocalRuntimeResponse> {
    if (this.stopping)
      return this.failure(AppError.Http(503, 'RUNTIME_STOPPING'))
    const validation = validateLocalRuntimeRequest(input)
    if (validation.isFailure()) return this.failure(validation.failure)
    if (this.maintenance.has(input.workspaceId))
      return this.failure(AppError.Http(503, 'WORKSPACE_MAINTENANCE'))
    const previous = this.tails.get(input.workspaceId)
    let complete: () => void = () => undefined
    const current = new Promise<void>((resolve) => {
      complete = resolve
    })
    this.tails.set(input.workspaceId, current)
    if (previous) await previous
    try {
      const executorResult = await this.getExecutor(input.workspaceId)
      if (executorResult.isFailure())
        return this.failure(executorResult.failure)
      const executor = executorResult.success
      if (
        input.action === 'list' ||
        input.action === 'get' ||
        input.action === 'timerState'
      ) {
        return this.response(await executor.query(input))
      }
      const result = await executor.execute(input)
      if (result.isFailure()) return this.failure(result.failure)
      if (!result.success.replayed) this.events.committed(input, result.success)
      return { ok: true, value: result.success }
    } finally {
      complete()
      if (this.tails.get(input.workspaceId) === current)
        this.tails.delete(input.workspaceId)
    }
  }

  /** The composition disposes physical resources while public commands are gated. */
  async forgetWorkspace(
    workspaceId: string,
    dispose: () => Promise<Either<AppError, void>>,
  ): Promise<Either<AppError, void>> {
    if (this.stopping)
      return Either.failure(AppError.Http(503, 'RUNTIME_STOPPING'))
    if (typeof workspaceId !== 'string' || workspaceId.trim().length === 0)
      return Either.failure(AppError.ValidationError('WORKSPACE_REQUIRED'))
    if (this.maintenance.has(workspaceId))
      return Either.failure(AppError.Http(409, 'WORKSPACE_MAINTENANCE'))
    this.maintenance.add(workspaceId)
    try {
      const tail = this.tails.get(workspaceId)
      if (tail !== undefined) await tail
      this.executors.delete(workspaceId)
      return await dispose()
    } finally {
      this.maintenance.delete(workspaceId)
    }
  }
  async quiesce(): Promise<void> {
    this.stopping = true
    await Promise.all(this.tails.values())
  }

  async close(): Promise<Either<AppError, void>> {
    await this.quiesce()
    let firstFailure: AppError | null = null
    for (const executor of this.executors.values()) {
      const result = await executor.close()
      if (result.isFailure() && firstFailure === null)
        firstFailure = result.failure
    }
    this.executors.clear()
    if (firstFailure !== null) return Either.failure(firstFailure)
    return Either.success()
  }

  private async getExecutor(
    workspaceId: string,
  ): Promise<Either<AppError, ILocalWorkspaceExecutor>> {
    const executor = this.executors.get(workspaceId)
    if (executor) return Either.success(executor)
    const opened = await this.factory.open(workspaceId)
    if (opened.isFailure()) return opened.forwardFailure()
    this.executors.set(workspaceId, opened.success)
    return opened
  }

  private response(
    result: Either<AppError, LocalRuntimeResult>,
  ): LocalRuntimeResponse {
    if (result.isFailure()) return this.failure(result.failure)
    return { ok: true, value: result.success }
  }

  private failure(error: AppError): LocalRuntimeResponse {
    return {
      ok: false,
      error: {
        messageKey: error.messageKey,
        statusCode: error.statusCode,
        details: error.details,
      },
    }
  }
}

function isLocalCommand(req: LocalRuntimeRequest): req is LocalRuntimeCommand {
  const actions: ReadonlyArray<LocalRuntimeCommand['action']> = [
    'create',
    'suggest',
    'update',
    'delete',
    'acceptSuggestion',
    'dismissSuggestion',
    'timerStart',
    'timerPause',
    'timerResume',
    'timerStop',
  ]
  return actions.some((act) => act === req.action)
}

type LocalPayloadCommand = Extract<LocalRuntimeCommand, { payload: unknown }>

function hasPayload(cmd: LocalRuntimeCommand): cmd is LocalPayloadCommand {
  return (
    cmd.action === 'create' ||
    cmd.action === 'suggest' ||
    cmd.action === 'update' ||
    cmd.action === 'timerStart'
  )
}

export function validateLocalRuntimeRequest(
  input: LocalRuntimeRequest,
): Either<AppError, void> {
  const raw: unknown = input
  if (!isRecord(raw)) return invalid('REQUEST_INVALID')
  if (!isNonEmptyString(input.workspaceId)) return invalid('WORKSPACE_REQUIRED')

  if (input.action === 'list') {
    const rawFilter: unknown = input.filter
    if (!isRecord(rawFilter)) return invalid('FILTER_INVALID')
    if (
      input.filter.startDate !== undefined &&
      !validDate(input.filter.startDate)
    )
      return invalid('START_DATE_INVALID')
    if (input.filter.endDate !== undefined && !validDate(input.filter.endDate))
      return invalid('END_DATE_INVALID')
    return Either.success()
  }

  if (input.action === 'timerState') return Either.success()

  if (input.action === 'get') {
    if (!isNonEmptyString(input.entryId)) return invalid('ENTRY_ID_REQUIRED')
    return Either.success()
  }

  if (!isLocalCommand(input)) return invalid('ACTION_INVALID')

  if (!isNonEmptyString(input.entryId)) return invalid('ENTRY_ID_REQUIRED')
  if (!isNonEmptyString(input.commandId) || input.commandId.length > 200)
    return invalid('COMMAND_ID_REQUIRED')

  if (!hasPayload(input)) return Either.success()

  const rawPayload: unknown = input.payload
  if (!isRecord(rawPayload)) return invalid('PAYLOAD_INVALID')

  if (input.action !== 'update') {
    if (
      !isString(input.payload.taskId) ||
      !isNumber(input.payload.timeSpentSeconds)
    )
      return invalid('ENTRY_PAYLOAD_INVALID')
  }

  if (input.action === 'timerStart') {
    if (input.payload.mode !== 'countup' && input.payload.mode !== 'countdown')
      return invalid('TIMER_MODE_INVALID')
  }

  const payload = input.payload
  if (
    payload.timeSpentSeconds !== undefined &&
    !validSeconds(payload.timeSpentSeconds)
  )
    return invalid('DURATION_INVALID')
  if (payload.pauseSeconds !== undefined && !validSeconds(payload.pauseSeconds))
    return invalid('PAUSE_DURATION_INVALID')
  if (payload.pauseSeconds !== undefined && payload.pauseSeconds > 0)
    return invalid('PAUSE_DURATION_REQUIRES_TIMER_JOURNAL')
  if (payload.startDate !== undefined && !validDate(payload.startDate))
    return invalid('START_DATE_INVALID')
  if (payload.endDate !== undefined && !validDate(payload.endDate))
    return invalid('END_DATE_INVALID')
  if (
    payload.startDate !== undefined &&
    payload.endDate !== undefined &&
    Date.parse(payload.endDate) < Date.parse(payload.startDate)
  )
    return invalid('DATE_RANGE_INVALID')
  if (
    payload.comments !== undefined &&
    (!isString(payload.comments) || payload.comments.length > 255)
  )
    return invalid('COMMENTS_TOO_LONG')
  if (
    payload.connectionInstanceId !== undefined &&
    !isString(payload.connectionInstanceId)
  )
    return invalid('CONNECTION_ID_INVALID')
  if (payload.dataSourceId !== undefined && !isString(payload.dataSourceId))
    return invalid('DATASOURCE_ID_INVALID')
  if (payload.taskId !== undefined && !isString(payload.taskId))
    return invalid('TASK_ID_INVALID')
  if (payload.activityId !== undefined && !isString(payload.activityId))
    return invalid('ACTIVITY_ID_INVALID')
  if (payload.userId !== undefined && !isString(payload.userId))
    return invalid('USER_ID_INVALID')
  return Either.success()
}

function validSeconds(value: number): boolean {
  return isNumber(value) && Number.isFinite(value) && value >= 0
}

function validDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value))
    return false
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return false
  return new Date(parsed).toISOString() === value
}

function invalid(messageKey: string): Either<AppError, void> {
  return Either.failure(AppError.ValidationError(messageKey))
}
