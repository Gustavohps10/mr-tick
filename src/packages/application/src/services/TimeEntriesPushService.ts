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
      if (!workspace)
        return Either.failure(AppError.Unauthorized('WORKSPACE_NAO_ENCONTRADO'))

      const adapter = await this.dataSourceResolver.getDataSource(
        input.workspaceId,
        input.connectionInstanceId,
      )

      const authResult = await adapter.getAuthenticatedMemberData()
      if (authResult.isFailure()) return authResult.forwardFailure()

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

      const existingResult = await timeEntriesProvider.findById(id!)
      if (existingResult.isFailure())
        return {
          ...entry,
          validationError: existingResult.failure,
        }

      const existing = existingResult.success
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
    if (!entry.id) return AppError.ValidationError('DOCUMENT_ID_MISSING')
    if (!entry._deleted && !entry.updatedAt)
      return AppError.ValidationError('DOCUMENT_UPDATED_AT_MISSING')
    return null
  }

  private async handleDeleted(
    entry: SyncTimeEntryDTO,
    timeEntriesProvider: ITimeEntryProvider,
  ): Promise<SyncTimeEntryDTO> {
    const deleteResult = await timeEntriesProvider.delete(entry.id!)
    if (deleteResult.isFailure())
      return {
        ...entry,
        validationError: deleteResult.failure,
      }

    return { ...entry, syncedAt: new Date() }
  }

  private async handleExisting(
    entry: SyncTimeEntryDTO,
    existing: TimeEntryDTO,
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

    const existingEntityResult = TimeEntry.create({
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
    })

    if (existingEntityResult.isFailure())
      return {
        ...entry,
        validationError: existingEntityResult.failure,
      }

    const existingEntity = existingEntityResult.success

    const resultUpdateHours = existingEntity.updateHours(
      entry.startDate !== undefined
        ? entry.startDate
        : existingEntity.startDate,
      entry.endDate !== undefined ? entry.endDate : existingEntity.endDate,
      entry.timeSpent !== undefined
        ? entry.timeSpent
        : existingEntity.timeSpent,
    )

    if (resultUpdateHours.isFailure())
      return {
        ...entry,
        validationError: resultUpdateHours.forwardFailure().failure,
      }

    if (entry.task) {
      const resultUpdateTask = existingEntity.updateTask(entry.task)
      if (resultUpdateTask.isFailure())
        return {
          ...entry,
          validationError: resultUpdateTask.forwardFailure().failure,
        }
    }

    if (entry.activity) {
      const resultUpdateActivity = existingEntity.updateActivity(entry.activity)
      if (resultUpdateActivity.isFailure())
        return {
          ...entry,
          validationError: resultUpdateActivity.forwardFailure().failure,
        }
    }

    if (entry.comments !== undefined) {
      const resultUpdateComments = existingEntity.updateComments(entry.comments)
      if (resultUpdateComments.isFailure())
        return {
          ...entry,
          validationError: resultUpdateComments.forwardFailure().failure,
        }
    }

    const updatedDto: TimeEntryDTO = {
      id: existingEntity.id,
      task: { id: existingEntity.task.id },
      activity: {
        id: existingEntity.activity.id,
        name: existingEntity.activity.name,
      },
      user: { id: existingEntity.user.id, name: existingEntity.user.name },
      startDate: existingEntity.startDate,
      endDate: existingEntity.endDate,
      timeSpent: existingEntity.timeSpent,
      comments: existingEntity.comments,
      createdAt: existing.createdAt,
      updatedAt: existingEntity.updatedAt,
    }

    const updateResult = await timeEntriesProvider.update(updatedDto)
    if (updateResult.isFailure())
      return {
        ...entry,
        validationError: updateResult.failure,
      }

    let confirmedUpdatedAt = existingEntity.updatedAt
    if (updateResult.success && updateResult.success.updatedAt) {
      confirmedUpdatedAt = updateResult.success.updatedAt
    }

    return {
      ...entry,
      task: { id: existingEntity.task.id },
      activity: {
        id: existingEntity.activity.id,
        name: existingEntity.activity.name,
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
      id: entry.id,
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

    const entity = result.success
    const entryDto: TimeEntryDTO = {
      id: entity.id,
      task: { id: entity.task.id },
      activity: {
        id: entity.activity.id,
        name: entity.activity.name,
      },
      user: { id: entity.user.id, name: entity.user.name },
      startDate: entity.startDate,
      endDate: entity.endDate,
      timeSpent: entity.timeSpent,
      comments: entity.comments,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    }

    const createResult = await timeEntriesProvider.create(entryDto)
    if (createResult.isFailure())
      return {
        ...entry,
        validationError: createResult.failure,
      }

    let assignedRemoteId = entity.id
    if (createResult.success && createResult.success.id) {
      assignedRemoteId = createResult.success.id
    }

    let remoteUpdatedAt = entity.updatedAt
    if (createResult.success && createResult.success.updatedAt) {
      remoteUpdatedAt = createResult.success.updatedAt
    }

    const output: SyncTimeEntryDTO = {
      ...entry,
      id: assignedRemoteId,
      originalId: entry.id,
      activity: {
        id: entity.activity.id,
        name: entity.activity.name,
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
