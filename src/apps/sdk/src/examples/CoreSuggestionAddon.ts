import {
  type AddonContext,
  AppError,
  type CoreTaskReference,
  Either,
  type IAddon,
  type LocalOperationIdentity,
  type TimeEntryRecordDTO,
} from '../index'

/** The caller explicitly chooses a task and activity; the addon never guesses. */
export class CoreSuggestionAddon implements IAddon {
  private context: AddonContext | null = null
  activate(context: AddonContext): void {
    this.context = context
    context.core.runtime.onStateChanged((state) => {
      console.log('Core availability:', state)
    })
    // Register providers and commands now. Do not await readiness here.
  }
  deactivate(): void {
    // Close your own sockets, abort background jobs and dispose external clients.
    this.context = null
  }
  async suggest(
    reference: CoreTaskReference,
    activityId: string,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, TimeEntryRecordDTO>> {
    const context = this.context
    if (context === null)
      return Either.failure(AppError.Http(503, 'ADDON_NOT_ACTIVE'))
    const task = await context.core.tasks.get(reference)
    if (task.isFailure()) return task.forwardFailure()
    const metadata = await context.core.metadata.get(reference)
    if (metadata.isFailure()) return metadata.forwardFailure()
    const activity = metadata.success.values.activities.find(
      (item) => item.id === activityId,
    )
    if (activity === undefined)
      return Either.failure(AppError.ValidationError('ACTIVITY_NOT_FOUND'))
    return context.core.timeEntries.createSuggestion(
      reference.workspaceId,
      {
        connectionInstanceId: reference.connectionInstanceId,
        dataSourceId: task.success.dataSourceId,
        taskId: task.success.taskId,
        activityId: activity.id,
        activityName: activity.name,
        timeSpentSeconds: 900,
        comments: `Documentação: ${task.success.title}`,
      },
      operation,
    )
  }
}
