import { TimeEntry } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  IDataSourceAdapter,
  IDataSourceResolver,
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
  ) {}

  public async execute(
    input: PushTimeEntriesInput,
  ): Promise<Either<AppError, SyncTimeEntryDTO[]>> {
    try {
      const workspace = await this.workspacesRepository.findById(
        input.workspaceId,
      )
      if (!workspace) {
        return Either.failure(AppError.Unauthorized('WORKSPACE_NAO_ENCONTRADO'))
      }

      const adapter = await this.dataSourceResolver.getDataSource(
        input.workspaceId,

        input.connectionInstanceId,
      )

      const timeEntriesProvider = adapter.timeEntriesProvider
      const results: SyncTimeEntryDTO[] = []

      for (const entry of input.entries) {
        results.push(
          await this.processEntry(entry, timeEntriesProvider, adapter),
        )
      }

      return Either.success(results)
    } catch {
      return Either.failure(AppError.Internal('ERRO_INESPERADO'))
    }
  }

  private async processEntry(
    entry: SyncTimeEntryDTO,
    timeEntriesProvider: ITimeEntryProvider,
    adapter: IDataSourceAdapter,
  ): Promise<SyncTimeEntryDTO> {
    const { id, _deleted } = entry

    const validationError = this.validateDocument(entry)
    if (validationError) return { ...entry, validationError: validationError }

    try {
      if (_deleted) return this.handleDeleted(entry, timeEntriesProvider)

      const existing = await timeEntriesProvider.findById(id!)

      if (existing)
        return this.handleExisting(entry, existing, timeEntriesProvider)

      return this.handleNew(entry, timeEntriesProvider, adapter)
    } catch {
      return {
        ...entry,
        validationError: AppError.ValidationError(
          'ERRO_PROCESSAMENTO_DOCUMENTO',
        ),
      }
    }
  }

  private validateDocument(entry: SyncTimeEntryDTO): AppError | null {
    const { id, updatedAt, _deleted } = entry
    if (!id) return AppError.ValidationError('DOCUMENT_ID_MISSING')
    if (!_deleted && !updatedAt)
      return AppError.ValidationError('DOCUMENT_UPDATED_AT_MISSING')
    return null
  }

  private async handleDeleted(
    entry: SyncTimeEntryDTO,
    timeEntriesProvider: ITimeEntryProvider,
  ): Promise<SyncTimeEntryDTO> {
    await timeEntriesProvider.delete(entry.id!)
    return { ...entry, syncedAt: new Date() }
  }

  private async handleExisting(
    entry: SyncTimeEntryDTO,
    existing: TimeEntry,
    timeEntriesProvider: ITimeEntryProvider,
  ): Promise<SyncTimeEntryDTO> {
    const { assumedMasterState } = entry

    const hasAssumedUpdatedAt = Boolean(
      assumedMasterState && assumedMasterState.updatedAt,
    )
    const isTimestampDivergent =
      hasAssumedUpdatedAt &&
      assumedMasterState?.updatedAt !== undefined &&
      existing.updatedAt.getTime() - assumedMasterState.updatedAt.getTime() >
        1000

    if (isTimestampDivergent) {
      if (this.isBusinessDataIdentical(entry, existing)) {
        return {
          ...entry,
          task: { id: existing.task.id },
          activity: {
            id: existing.activity.id,
            name: existing.activity.name,
          },
          updatedAt: existing.updatedAt,
          syncedAt: new Date(),
        }
      }

      const hasAssumedBusinessData = Boolean(
        assumedMasterState &&
        (assumedMasterState.task ||
          assumedMasterState.activity ||
          assumedMasterState.timeSpent !== undefined),
      )

      const isServerUnchangedFromAssumed =
        hasAssumedBusinessData &&
        assumedMasterState !== undefined &&
        this.isBusinessDataIdentical(existing, assumedMasterState)

      if (!isServerUnchangedFromAssumed) {
        const serverSnapshot: TimeEntryDTO = {
          id: existing.id,
          task: { id: existing.task.id },
          activity: {
            id: existing.activity.id,
            name: existing.activity.name,
          },
          user: { id: existing.user.id, name: existing.user.name },
          startDate: existing.startDate,
          endDate: existing.endDate,
          timeSpent: existing.timeSpent,
          comments: existing.comments,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        }

        return {
          ...entry,
          conflicted: true,
          conflictData: { server: serverSnapshot, local: entry },
        }
      }
    }

    const resultUpdateHours = existing.updateHours(
      entry.startDate,
      entry.endDate,
      entry.timeSpent,
    )

    if (resultUpdateHours.isFailure()) {
      return {
        ...entry,
        validationError: resultUpdateHours.forwardFailure().failure,
      }
    }

    if (entry.task) {
      const resultUpdateTask = existing.updateTask(entry.task)
      if (resultUpdateTask.isFailure()) {
        return {
          ...entry,
          validationError: resultUpdateTask.forwardFailure().failure,
        }
      }
    }

    if (entry.activity) {
      const resultUpdateActivity = existing.updateActivity(entry.activity)
      if (resultUpdateActivity.isFailure()) {
        return {
          ...entry,
          validationError: resultUpdateActivity.forwardFailure().failure,
        }
      }
    }

    if (entry.comments !== undefined) {
      const resultUpdateComments = existing.updateComments(entry.comments)
      if (resultUpdateComments.isFailure()) {
        return {
          ...entry,
          validationError: resultUpdateComments.forwardFailure().failure,
        }
      }
    }

    const updateResult = await timeEntriesProvider.update(existing)
    let confirmedUpdatedAt = existing.updatedAt
    if (updateResult && updateResult.updatedAt) {
      confirmedUpdatedAt = updateResult.updatedAt
    }

    return {
      ...entry,
      task: { id: existing.task.id },
      activity: {
        id: existing.activity.id,
        name: existing.activity.name,
      },
      updatedAt: confirmedUpdatedAt,
      syncedAt: new Date(),
    }
  }

  private isBusinessDataIdentical(
    first: {
      startDate?: Date
      endDate?: Date
      timeSpent?: number
      task?: { id: string }
      activity?: { id: string; name?: string }
      comments?: string
    },
    second: {
      startDate?: Date
      endDate?: Date
      timeSpent?: number
      task?: { id: string }
      activity?: { id: string; name?: string }
      comments?: string
    },
  ): boolean {
    const firstTaskId = first.task?.id ? first.task.id : ''
    const secondTaskId = second.task?.id ? second.task.id : ''
    if (firstTaskId !== secondTaskId) return false

    const firstActivityId = first.activity?.id ? first.activity.id : ''
    const secondActivityId = second.activity?.id ? second.activity.id : ''
    if (firstActivityId !== secondActivityId) return false

    const firstTimeSpent = first.timeSpent !== undefined ? first.timeSpent : 0
    const secondTimeSpent =
      second.timeSpent !== undefined ? second.timeSpent : 0
    if (Math.abs(firstTimeSpent - secondTimeSpent) > 0.001) return false

    const firstStart = first.startDate ? first.startDate.getTime() : 0
    const secondStart = second.startDate ? second.startDate.getTime() : 0
    if (firstStart !== secondStart) return false

    const firstEnd = first.endDate ? first.endDate.getTime() : 0
    const secondEnd = second.endDate ? second.endDate.getTime() : 0
    if (firstEnd !== secondEnd) return false

    const firstComments = first.comments ? first.comments.trim() : ''
    const secondComments = second.comments ? second.comments.trim() : ''
    if (firstComments !== secondComments) return false

    return true
  }

  private async handleNew(
    entry: SyncTimeEntryDTO,
    timeEntriesProvider: ITimeEntryProvider,
    adapter: IDataSourceAdapter,
  ): Promise<SyncTimeEntryDTO> {
    let resolvedUserId = entry.user?.id ? entry.user.id : ''
    let resolvedUserName = entry.user?.name ? entry.user.name : undefined

    if (!resolvedUserId || resolvedUserId === 'local-user') {
      const memberResult = await adapter.getAuthenticatedMemberData()
      if (memberResult.isSuccess()) {
        const member = memberResult.success
        resolvedUserId = String(member.id)
        if (!resolvedUserName && member.firstname) {
          resolvedUserName = `${member.firstname} ${member.lastname}`.trim()
        }
      }
    }

    const result = TimeEntry.create({
      task: { id: entry.task.id },
      activity: {
        id: entry.activity.id,
        name: entry.activity.name,
      },
      user: { id: resolvedUserId, name: resolvedUserName },
      startDate: entry.startDate,
      endDate: entry.endDate,
      timeSpent: entry.timeSpent,
      comments: entry.comments,
    })

    if (result.isFailure())
      return {
        ...entry,
        validationError: AppError.ValidationError('TIME_ENTRY_INVALID'),
      }

    const createResult = await timeEntriesProvider.create(result.success)
    let assignedRemoteId = result.success.id
    if (createResult && createResult.id) {
      assignedRemoteId = createResult.id
    }

    let remoteUpdatedAt = result.success.updatedAt
    if (createResult && createResult.updatedAt) {
      remoteUpdatedAt = createResult.updatedAt
    }

    const output: SyncTimeEntryDTO = {
      ...entry,
      id: assignedRemoteId,
      originalId: entry.id,
      activity: {
        id: result.success.activity.id,
        name: result.success.activity.name,
      },
      user: {
        id: resolvedUserId,
        name: resolvedUserName,
      },
      updatedAt: remoteUpdatedAt,
      syncedAt: new Date(),
    }

    return output
  }
}
