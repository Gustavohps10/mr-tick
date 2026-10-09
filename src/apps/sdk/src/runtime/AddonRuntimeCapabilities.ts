import type {
  ILocalRuntimeAPI,
  ILocalTimeEntriesCapability,
  ILocalTimerCapability,
  LocalEntryChanges,
  LocalEntryFilter,
  LocalEntryInput,
  LocalOperationIdentity,
  LocalRuntimeCommand,
  LocalRuntimeRequest,
  LocalRuntimeResult,
  LocalTimerInput,
  LocalTimerStateDTO,
  TimeEntryRecordDTO,
} from '@mr-tick/application/local-runtime'
import { AppError, Either } from '@mr-tick/shared/helpers'

export class AddonTimerControlLock {
  private owner: string | null = null

  acquire(addonId: string): boolean {
    if (this.owner !== null && this.owner !== addonId) return false
    this.owner = addonId
    return true
  }

  release(addonId: string): void {
    if (this.owner === addonId) this.owner = null
  }

  owns(addonId: string): boolean {
    return this.owner === addonId
  }

  allows(addonId: string): boolean {
    return this.owner === null || this.owner === addonId
  }
}

export interface RuntimeAddonIdentity {
  id: string
  name: string
  imageUrl?: string
}

export class AddonRuntimeCapabilities {
  readonly timeEntries: ILocalTimeEntriesCapability
  readonly timer: ILocalTimerCapability

  constructor(
    private readonly runtime: ILocalRuntimeAPI,
    private readonly addon: RuntimeAddonIdentity,
    private readonly controlLock: AddonTimerControlLock,
  ) {
    this.timeEntries = {
      list: (workspaceId, filter) => this.list(workspaceId, filter),
      getById: (workspaceId, entryId) => this.get(workspaceId, entryId),
      create: (workspaceId, payload, operation) =>
        this.create(workspaceId, payload, operation, 'create'),
      createSuggestion: (workspaceId, payload, operation) =>
        this.create(workspaceId, payload, operation, 'suggest'),
      acceptSuggestion: (workspaceId, operation) =>
        this.entryCommand(workspaceId, operation, 'acceptSuggestion'),
      dismissSuggestion: (workspaceId, operation) =>
        this.deleteCommand(workspaceId, operation, 'dismissSuggestion'),
      update: (workspaceId, payload, operation) =>
        this.update(workspaceId, payload, operation),
      delete: (workspaceId, operation) =>
        this.deleteCommand(workspaceId, operation, 'delete'),
    }
    this.timer = {
      getActiveEntry: (workspaceId) => this.getTimer(workspaceId),
      requestControlLock: async () =>
        Either.success(this.controlLock.acquire(this.addon.id)),
      releaseControlLock: async () => {
        this.controlLock.release(this.addon.id)
        return Either.success()
      },
      isControlLockHeld: async () =>
        Either.success(this.controlLock.owns(this.addon.id)),
      start: (workspaceId, payload, operation) =>
        this.startTimer(workspaceId, payload, operation),
      pause: (workspaceId, operation) =>
        this.timerCommand(workspaceId, operation, 'timerPause'),
      resume: (workspaceId, operation) =>
        this.timerCommand(workspaceId, operation, 'timerResume'),
      stop: (workspaceId, operation) =>
        this.timerCommand(workspaceId, operation, 'timerStop'),
      logTime: async (workspaceId, payload, operation) => {
        const result = await this.create(
          workspaceId,
          payload,
          operation,
          'create',
        )
        if (result.isFailure()) return result.forwardFailure()
        return Either.success()
      },
    }
  }

  private async call(
    request: LocalRuntimeRequest,
  ): Promise<Either<AppError, LocalRuntimeResult>> {
    const response = await this.runtime.request(request)
    if (!response.ok)
      return Either.failure(
        AppError.Http(
          response.error.statusCode,
          response.error.messageKey,
          response.error.details,
        ),
      )
    return Either.success(response.value)
  }

  private async list(
    workspaceId: string,
    filter: LocalEntryFilter | undefined,
  ): Promise<Either<AppError, TimeEntryRecordDTO[]>> {
    let resolvedFilter: LocalEntryFilter = {}
    if (filter !== undefined) resolvedFilter = filter
    const result = await this.call({
      action: 'list',
      workspaceId,
      filter: resolvedFilter,
    })
    if (result.isFailure()) return result.forwardFailure()
    return Either.success(result.success.entries)
  }

  private async get(
    workspaceId: string,
    entryId: string,
  ): Promise<Either<AppError, TimeEntryRecordDTO | null>> {
    const result = await this.call({ action: 'get', workspaceId, entryId })
    if (result.isFailure()) return result.forwardFailure()
    return Either.success(result.success.entry)
  }

  private async getTimer(
    workspaceId: string,
  ): Promise<Either<AppError, LocalTimerStateDTO | null>> {
    const result = await this.call({ action: 'timerState', workspaceId })
    if (result.isFailure()) return result.forwardFailure()
    const timer = result.success.timer
    const entry = result.success.entry
    if (timer === null) return Either.success(null)
    if (entry === null)
      return Either.failure(AppError.Internal('RUNTIME_ACTIVE_ENTRY_MISSING'))
    return Either.success({ ...timer, entryId: entry.id, workspaceId })
  }

  private async create(
    workspaceId: string,
    payload: LocalEntryInput,
    operation: LocalOperationIdentity,
    action: 'create' | 'suggest',
  ): Promise<Either<AppError, TimeEntryRecordDTO>> {
    return this.requiredEntry(
      await this.call({
        action,
        workspaceId,
        commandId: operation.commandId,
        entryId: operation.entryId,
        payload: { ...payload, source: 'addon', addonSource: this.addon },
      }),
    )
  }

  private async update(
    workspaceId: string,
    payload: LocalEntryChanges,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, TimeEntryRecordDTO>> {
    return this.requiredEntry(
      await this.call({
        action: 'update',
        workspaceId,
        commandId: operation.commandId,
        entryId: operation.entryId,
        payload,
      }),
    )
  }

  private async entryCommand(
    workspaceId: string,
    operation: LocalOperationIdentity,
    action: 'acceptSuggestion',
  ): Promise<Either<AppError, TimeEntryRecordDTO>> {
    return this.requiredEntry(
      await this.call({
        action,
        workspaceId,
        commandId: operation.commandId,
        entryId: operation.entryId,
      }),
    )
  }

  private async deleteCommand(
    workspaceId: string,
    operation: LocalOperationIdentity,
    action: 'delete' | 'dismissSuggestion',
  ): Promise<Either<AppError, boolean>> {
    const result = await this.call({
      action,
      workspaceId,
      commandId: operation.commandId,
      entryId: operation.entryId,
    })
    if (result.isFailure()) return result.forwardFailure()
    return Either.success(result.success.deleted)
  }

  private requiredEntry(
    result: Either<AppError, LocalRuntimeResult>,
  ): Either<AppError, TimeEntryRecordDTO> {
    if (result.isFailure()) return result.forwardFailure()
    const entry = result.success.entry
    if (entry === null)
      return Either.failure(AppError.Internal('RUNTIME_ENTRY_RESULT_MISSING'))
    return Either.success(entry)
  }

  private async startTimer(
    workspaceId: string,
    payload: LocalTimerInput,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, void>> {
    if (!this.controlLock.allows(this.addon.id))
      return Either.failure(AppError.Unauthorized('TIMER_CONTROL_LOCKED'))
    const result = await this.call({
      action: 'timerStart',
      workspaceId,
      commandId: operation.commandId,
      entryId: operation.entryId,
      payload: { ...payload, source: 'addon', addonSource: this.addon },
    })
    if (result.isFailure()) return result.forwardFailure()
    return Either.success()
  }

  private async timerCommand(
    workspaceId: string,
    operation: LocalOperationIdentity,
    action: 'timerPause' | 'timerResume' | 'timerStop',
  ): Promise<Either<AppError, void>> {
    if (!this.controlLock.allows(this.addon.id))
      return Either.failure(AppError.Unauthorized('TIMER_CONTROL_LOCKED'))
    const command: LocalRuntimeCommand = {
      action,
      workspaceId,
      entryId: operation.entryId,
      commandId: operation.commandId,
    }
    const result = await this.call(command)
    if (result.isFailure()) return result.forwardFailure()
    return Either.success()
  }
}
