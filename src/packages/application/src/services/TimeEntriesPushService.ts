import { TimeEntry } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  IDataSourceResolver,
  ITimeEntryProvider,
  IWorkspacesRepository,
} from '@/contracts'
import {
  ITimeEntriesPushUseCase,
  PushTimeEntriesInput,
  SyncTimeEntryDTO,
} from '@/contracts/use-cases'

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
        results.push(await this.processEntry(entry, timeEntriesProvider))
      }

      return Either.success(results)
    } catch {
      return Either.failure(AppError.Internal('ERRO_INESPERADO'))
    }
  }

  private async processEntry(
    entry: SyncTimeEntryDTO,
    timeEntriesProvider: ITimeEntryProvider,
  ): Promise<SyncTimeEntryDTO> {
    const { id, _deleted } = entry

    const validationError = this.validateDocument(entry)
    if (validationError) return { ...entry, validationError: validationError }

    try {
      if (_deleted) return this.handleDeleted(entry, timeEntriesProvider)

      const existing = await timeEntriesProvider.findById(id!)

      if (existing)
        return this.handleExisting(entry, existing, timeEntriesProvider)

      return this.handleNew(entry, timeEntriesProvider)
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

    const isConflict =
      assumedMasterState &&
      existing.updatedAt.valueOf() !== assumedMasterState.updatedAt?.valueOf()

    if (isConflict)
      return {
        ...entry,
        conflicted: true,
        conflictData: { server: existing, local: entry },
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

    existing.updateComments(entry.comments)
    await timeEntriesProvider.update(existing)

    return { ...entry, syncedAt: new Date() }
  }

  private async handleNew(
    entry: SyncTimeEntryDTO,
    timeEntriesProvider: ITimeEntryProvider,
  ): Promise<SyncTimeEntryDTO> {
    const result = TimeEntry.create({
      task: { id: entry.task.id },
      activity: { id: entry.activity.id },
      user: { id: entry.user.id, name: entry.user.name },
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

    await timeEntriesProvider.create(result.success)
    return { ...entry, syncedAt: new Date() }
  }
}
