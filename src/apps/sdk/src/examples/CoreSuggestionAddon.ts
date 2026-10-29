import {
  type AddonContext,
  AppError,
  type CoreConnectionScope,
  type CoreTaskReference,
  Either,
  type IAddon,
  type LocalOperationIdentity,
  type TimeEntryRecordDTO,
} from '../index'

export interface CoreSuggestionRequest {
  readonly originWorkspaceId: string
  readonly destination: CoreTaskReference
  readonly activityId: string
  readonly operation: LocalOperationIdentity
  readonly durationSeconds: number
  readonly startDate: string
  readonly endDate: string
  readonly comments?: string
  readonly metadata?: Readonly<Record<string, string | number | boolean>>
}

/**
 * Exemplo documental de criação canônica de sugestões com autoria e escopo explícitos.
 * O chamador escolhe explicitamente o destino, o workspace de origem e a identidade da operação;
 * o addon nunca faz adivinhações nem utiliza IDs vazios.
 */
export class CoreSuggestionAddon implements IAddon {
  private context: AddonContext | null = null
  private unsubscribeRuntimeState: (() => void) | null = null

  activate(context: AddonContext): void {
    this.context = context
    this.unsubscribeRuntimeState = context.core.runtime.onStateChanged(
      (state) => {
        console.log('Core availability:', state)
      },
    )
    // Registre provedores, menus e comandos agora. Não aguarde prontidão aqui.
  }

  deactivate(): void {
    if (this.unsubscribeRuntimeState) {
      this.unsubscribeRuntimeState()
      this.unsubscribeRuntimeState = null
    }
    this.context = null
  }

  async suggest(
    request: CoreSuggestionRequest,
  ): Promise<Either<AppError, TimeEntryRecordDTO>> {
    const context = this.context
    if (context === null) {
      return Either.failure(AppError.Http(503, 'ADDON_NOT_ACTIVE'))
    }

    const {
      originWorkspaceId,
      destination,
      activityId,
      operation,
      durationSeconds,
      startDate,
      endDate,
    } = request

    // 1. Validação estrita de escopo: origem e destino devem pertencer ao mesmo workspace
    if (destination.workspaceId !== originWorkspaceId) {
      return Either.failure(
        AppError.ValidationError(
          'CROSS_WORKSPACE_SUGGESTION_FORBIDDEN: destination workspace must match observer origin workspace',
        ),
      )
    }

    // 2. Resolução da tarefa de destino no workspace e conexão especificados
    const taskResult = await context.core.tasks.get(destination)
    if (taskResult.isFailure()) {
      return taskResult.forwardFailure()
    }

    // 3. Resolução de metadados de atividades da conexão de destino
    const metadataResult = await context.core.metadata.get(destination)
    if (metadataResult.isFailure()) {
      return metadataResult.forwardFailure()
    }

    const activity = metadataResult.success.values.activities.find(
      (item) => item.id === activityId,
    )
    if (activity === undefined) {
      return Either.failure(AppError.ValidationError('ACTIVITY_NOT_FOUND'))
    }

    // 4. Resolução OBRIGATÓRIA de autoria via membersProvider da conexão de destino
    const destinationScope: CoreConnectionScope = {
      workspaceId: destination.workspaceId,
      connectionInstanceId: destination.connectionInstanceId,
    }
    const memberResult =
      await context.core.members.getCurrentUser(destinationScope)
    if (memberResult.isFailure()) {
      // Propaga a falha de autoria sem mascarar; nunca emitir sugestão sem autor identificado
      return memberResult.forwardFailure()
    }

    let comments = `Apontamento sugerido: ${taskResult.success.title}`
    if (request.comments !== undefined && request.comments.length > 0) {
      comments = request.comments
    }

    const addonSource: {
      id: string
      name: string
      metadata?: Readonly<Record<string, string | number | boolean>>
    } = {
      id: 'core-suggestion-example-addon',
      name: 'Core Suggestion Example Addon',
    }
    if (request.metadata !== undefined) {
      addonSource.metadata = request.metadata
    }

    // 5. Criação da sugestão com identidade estável de operação, intervalo congelado e autoria resolvida
    // Não utiliza Date.now() para garantir idempotência em retries com a mesma operação
    return context.core.timeEntries.createSuggestion(
      destination.workspaceId,
      {
        connectionInstanceId: destination.connectionInstanceId,
        dataSourceId: taskResult.success.dataSourceId,
        taskId: taskResult.success.taskId,
        userId: memberResult.success.id,
        userName: memberResult.success.name,
        activityId: activity.id,
        activityName: activity.name,
        timeSpentSeconds: durationSeconds,
        startDate,
        endDate,
        comments,
        source: 'addon',
        addonSource,
      },
      operation,
    )
  }
}
