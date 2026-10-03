import { TimeEntry } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  IDataSourceResolver,
  IKeyedMutex,
  ITimeEntryProvider,
  IWorkspacesRepository,
} from '@/contracts'
import {
  ITimeEntriesPushUseCase,
  PushTimeEntriesInput,
  SyncTimeEntryDTO,
} from '@/contracts/use-cases'
import { TimeEntryDTO } from '@/dtos'

export class TimeEntriesPushService implements ITimeEntriesPushUseCase {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly dataSourceResolver: IDataSourceResolver,
    private readonly keyedMutex: IKeyedMutex,
  ) {}

  public async execute(
    input: PushTimeEntriesInput,
  ): Promise<Either<AppError, SyncTimeEntryDTO[]>> {
    const workspace = await this.workspacesRepository.findById(
      input.workspaceId,
    )
    if (!workspace)
      return Either.failure(AppError.Unauthorized('WORKSPACE_NAO_ENCONTRADO'))

    const adapter = await this.dataSourceResolver.getDataSource(
      input.workspaceId,
      input.connectionInstanceId,
    )
    const auth = adapter.getAuthenticatedMemberData()
    if (auth.isFailure()) return auth.forwardFailure()

    const authenticatedUser = {
      id: String(auth.success.id),
      name: `${auth.success.firstname} ${auth.success.lastname}`.trim(),
    }
    const results: SyncTimeEntryDTO[] = []
    for (const entry of input.entries) {
      if (!entry.id) {
        results.push({
          ...entry,
          validationError: AppError.ValidationError('DOCUMENT_ID_MISSING'),
        })
        continue
      }
      if (!entry._deleted && !entry.updatedAt) {
        results.push({
          ...entry,
          validationError: AppError.ValidationError(
            'DOCUMENT_UPDATED_AT_MISSING',
          ),
        })
        continue
      }
      const user =
        entry.user.id === 'local-user' || !entry.user.id
          ? authenticatedUser
          : entry.user
      const creationState = entry.creationState
        ? {
            ...entry.creationState,
            user:
              entry.creationState.user.id === 'local-user' ||
              !entry.creationState.user.id
                ? authenticatedUser
                : entry.creationState.user,
          }
        : undefined
      const identity = entry.correlationId ? entry.correlationId : entry.id
      const key = JSON.stringify([
        input.workspaceId,
        input.connectionInstanceId,
        identity,
      ])
      results.push(
        await this.keyedMutex.runExclusive(key, () =>
          this.processEntry(
            { ...entry, user, creationState },
            adapter.timeEntriesProvider,
          ),
        ),
      )
    }
    return Either.success(results)
  }

  private async processEntry(
    entry: SyncTimeEntryDTO,
    provider: ITimeEntryProvider,
  ): Promise<SyncTimeEntryDTO> {
    if (entry._deleted)
      return this.handleDeleted(
        {
          ...entry,
          confirmationPending: false,
          creationPending: false,
          syncRetryable: false,
        },
        provider,
      )
    if (entry.confirmationPending && !entry.remoteId)
      return this.ambiguous(entry, 'REMOTE_TIME_ENTRY_ID_MISSING')
    if (entry.remoteId) {
      const result = await provider.findById(entry.remoteId)
      if (result.isFailure()) {
        if (entry.confirmationPending && result.failure.statusCode === 404)
          return {
            ...this.ambiguous(entry, result.failure.messageKey),
            validationError: result.failure,
          }
        return this.providerFailure(entry, result.failure)
      }
      if (!result.success)
        return this.ambiguous(entry, 'REMOTE_TIME_ENTRY_MISSING')
      if (entry.confirmationPending) return this.confirm(entry, result.success)
      return this.handleExisting(entry, result.success, provider)
    }
    if (entry.creationAttempted) return this.recoverCreation(entry, provider)
    if (entry.correlationId) return this.handleNew(entry, provider)
    // Compatibility with callers that already use the provider's own identity.
    if (!entry.id)
      return {
        ...entry,
        validationError: AppError.ValidationError('DOCUMENT_ID_MISSING'),
      }
    const result = await provider.findById(entry.id)
    if (result.isFailure()) return this.providerFailure(entry, result.failure)
    if (result.success)
      return this.handleExisting(entry, result.success, provider)
    return this.handleNew(entry, provider)
  }

  private providerFailure(
    entry: SyncTimeEntryDTO,
    failure: AppError,
  ): SyncTimeEntryDTO {
    const status = failure.statusCode
    return {
      ...entry,
      syncRetryable:
        status === 401 ||
        status === 403 ||
        status === 408 ||
        status === 429 ||
        status >= 500,
      validationError: failure,
    }
  }

  private ambiguous(
    entry: SyncTimeEntryDTO,
    messageKey: string,
  ): SyncTimeEntryDTO {
    return {
      ...entry,
      creationAmbiguous: true,
      confirmationPending: false,
      creationPending: false,
      syncRetryable: false,
      validationError: AppError.ValidationError(messageKey),
    }
  }

  private async recoverCreation(
    entry: SyncTimeEntryDTO,
    provider: ITimeEntryProvider,
  ): Promise<SyncTimeEntryDTO> {
    if (!entry.correlationId)
      return this.ambiguous(entry, 'CORRELATION_ID_MISSING')
    if (provider.timeEntryCreateIdempotency === 'native')
      return this.create(
        entry,
        entry.creationState ? entry.creationState : entry,
        provider,
      )
    if (provider.timeEntryCreateIdempotency !== 'reconcilable')
      return this.ambiguous(entry, 'CREATE_OUTCOME_AMBIGUOUS')
    if (!provider.findByCorrelation)
      return this.ambiguous(entry, 'PROVIDER_CORRELATION_LOOKUP_UNAVAILABLE')

    const lookupState = entry.creationState ? entry.creationState : entry
    const result = await provider.findByCorrelation(
      entry.correlationId,
      lookupState,
    )
    if (result.isFailure())
      return {
        ...entry,
        creationPending: result.failure.statusCode !== 422,
        creationAmbiguous: result.failure.statusCode === 422,
        validationError: result.failure,
      }
    if (!result.success)
      return this.ambiguous(
        entry,
        'REMOTE_CREATE_NOT_FOUND_AFTER_RECONCILIATION',
      )
    return this.confirm(entry, result.success)
  }

  private async handleDeleted(
    entry: SyncTimeEntryDTO,
    provider: ITimeEntryProvider,
  ): Promise<SyncTimeEntryDTO> {
    let remoteId = entry.remoteId
    if (!remoteId && entry.creationAttempted) {
      const recovered = await this.recoverCreation(entry, provider)
      if (recovered.validationError) return recovered
      remoteId = recovered.id
    }
    if (!remoteId && entry.correlationId)
      return { ...entry, syncedAt: new Date() }
    if (!remoteId) remoteId = entry.id
    if (!remoteId) return this.ambiguous(entry, 'REMOTE_TIME_ENTRY_ID_MISSING')

    const result = await provider.delete(remoteId)
    if (result.isFailure() && result.failure.statusCode !== 404)
      return this.providerFailure({ ...entry, remoteId }, result.failure)
    return {
      ...entry,
      id: remoteId,
      remoteId,
      originalId: entry.correlationId,
      syncedAt: new Date(),
    }
  }

  private async handleNew(
    entry: SyncTimeEntryDTO,
    provider: ITimeEntryProvider,
  ): Promise<SyncTimeEntryDTO> {
    const result = TimeEntry.create(entry)
    if (result.isFailure()) return this.providerFailure(entry, result.failure)
    const entity = result.success
    const payload: TimeEntryDTO = {
      ...entry,
      user: entity.user,
      task: entity.task,
      activity: entity.activity,
      startDate: entity.startDate,
      endDate: entity.endDate,
      timeSpent: entity.timeSpent,
      comments: entity.comments,
    }
    if (
      entry.correlationId &&
      provider.timeEntryCreateIdempotency === 'reconcilable'
    ) {
      if (!provider.findByCorrelation)
        return this.ambiguous(entry, 'PROVIDER_CORRELATION_LOOKUP_UNAVAILABLE')
      const existing = await provider.findByCorrelation(
        entry.correlationId,
        payload,
      )
      if (existing.isFailure())
        return {
          ...entry,
          creationAttempted: false,
          creationPending: existing.failure.statusCode !== 422,
          creationAmbiguous: existing.failure.statusCode === 422,
          validationError: existing.failure,
        }
      if (existing.success) return this.confirm(entry, existing.success)
    }
    return this.create(entry, payload, provider)
  }

  private async create(
    entry: SyncTimeEntryDTO,
    payload: TimeEntryDTO,
    provider: ITimeEntryProvider,
  ): Promise<SyncTimeEntryDTO> {
    const result = await provider.create(payload)
    if (result.isFailure()) {
      if (
        result.failure.statusCode >= 400 &&
        result.failure.statusCode < 500 &&
        result.failure.statusCode !== 408 &&
        result.failure.statusCode !== 429
      )
        return { ...entry, validationError: result.failure }
      if (provider.timeEntryCreateIdempotency === 'native')
        return {
          ...entry,
          creationAttempted: true,
          creationPending: true,
          validationError: result.failure,
        }
      return this.recoverCreation(
        { ...entry, creationAttempted: true, creationState: payload },
        provider,
      )
    }
    return this.readConfirmedState(
      entry,
      result.success.id,
      result.success.entry,
      provider,
    )
  }

  private async readConfirmedState(
    entry: SyncTimeEntryDTO,
    remoteId: string,
    canonical: TimeEntryDTO | undefined,
    provider: ITimeEntryProvider,
  ): Promise<SyncTimeEntryDTO> {
    if (canonical) return this.confirm(entry, canonical)
    // A confirmed write may return only its ID; read canonical state before acknowledging it.
    const confirmed: SyncTimeEntryDTO = {
      ...entry,
      id: remoteId,
      remoteId,
      originalId: entry.correlationId,
      confirmationPending: true,
      creationPending: false,
    }
    const result = await provider.findById(remoteId)
    if (result.isFailure()) {
      if (result.failure.statusCode === 404)
        return {
          ...this.ambiguous(confirmed, result.failure.messageKey),
          validationError: result.failure,
        }
      return this.providerFailure(confirmed, result.failure)
    }
    if (!result.success)
      return this.ambiguous(confirmed, 'REMOTE_TIME_ENTRY_MISSING')
    return this.confirm(entry, result.success)
  }

  private confirm(
    entry: SyncTimeEntryDTO,
    canonical: TimeEntryDTO,
  ): SyncTimeEntryDTO {
    if (!canonical.id)
      return this.ambiguous(entry, 'REMOTE_TIME_ENTRY_ID_MISSING')
    return {
      ...entry,
      ...canonical,
      originalId: entry.correlationId ? entry.correlationId : entry.id,
      correlationId: entry.correlationId,
      remoteId: canonical.id,
      creationPending: false,
      confirmationPending: false,
      syncRetryable: false,
      creationAmbiguous: false,
      validationError: undefined,
      syncedAt: new Date(),
    }
  }

  private async handleExisting(
    entry: SyncTimeEntryDTO,
    existing: TimeEntryDTO,
    provider: ITimeEntryProvider,
  ): Promise<SyncTimeEntryDTO> {
    if (!existing.id)
      return this.ambiguous(entry, 'REMOTE_TIME_ENTRY_ID_MISSING')
    if (this.isBusinessDataIdentical(entry, existing))
      return this.confirm(entry, existing)
    if (
      entry.assumedMasterState &&
      !this.isBusinessDataIdentical(existing, entry.assumedMasterState)
    )
      return {
        ...entry,
        conflicted: true,
        conflictData: { server: existing, local: entry },
      }

    const result = TimeEntry.create(existing)
    if (result.isFailure()) return this.providerFailure(entry, result.failure)
    const entity = result.success
    const hours = entity.updateHours(
      entry.startDate,
      entry.endDate,
      entry.timeSpent,
    )
    if (hours.isFailure()) return { ...entry, validationError: hours.failure }
    if (entry.task.id !== existing.task.id) {
      const task = entity.updateTask(entry.task)
      if (task.isFailure()) return { ...entry, validationError: task.failure }
    }
    const activity = entity.updateActivity(entry.activity)
    if (activity.isFailure())
      return { ...entry, validationError: activity.failure }
    const comments = entity.updateComments(entry.comments)
    if (comments.isFailure())
      return { ...entry, validationError: comments.failure }

    const payload: TimeEntryDTO = {
      ...existing,
      correlationId: existing.correlationId
        ? existing.correlationId
        : entry.correlationId,
      task: entity.task,
      activity: entity.activity,
      user: entity.user,
      startDate: entity.startDate,
      endDate: entity.endDate,
      timeSpent: entity.timeSpent,
      comments: entity.comments,
      updatedAt: entity.updatedAt,
    }
    const updated = provider.updateConditional
      ? await provider.updateConditional(payload, existing)
      : await provider.update(payload)
    if (
      updated.isFailure() &&
      provider.updateConditional &&
      (updated.failure.statusCode === 409 || updated.failure.statusCode === 412)
    ) {
      const latest = await provider.findById(existing.id)
      if (latest.isFailure()) return this.providerFailure(entry, latest.failure)
      if (!latest.success)
        return this.ambiguous(entry, 'REMOTE_TIME_ENTRY_MISSING')
      return {
        ...entry,
        conflicted: true,
        conflictData: { server: latest.success, local: entry },
        validationError: updated.failure,
      }
    }

    if (updated.isFailure()) return this.providerFailure(entry, updated.failure)
    return this.readConfirmedState(
      entry,
      updated.success.id,
      updated.success.entry,
      provider,
    )
  }

  private isBusinessDataIdentical(
    first: TimeEntryDTO,
    second: TimeEntryDTO,
  ): boolean {
    return (
      first.task.id === second.task.id &&
      first.activity.id === second.activity.id &&
      first.user.id === second.user.id &&
      first.timeSpent === second.timeSpent &&
      first.startDate?.getTime() === second.startDate?.getTime() &&
      first.endDate?.getTime() === second.endDate?.getTime() &&
      this.normalizedComments(first.comments) ===
        this.normalizedComments(second.comments)
    )
  }

  private normalizedComments(comments: string | undefined): string {
    if (comments === undefined) return ''
    return comments.trim()
  }
}
