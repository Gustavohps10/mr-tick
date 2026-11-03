import {
  type CoreCacheQuery,
  type CoreConnection,
  type CoreConnectionScope,
  type CoreMetadata,
  type CoreTask,
  type CoreTaskListRequest,
  type CoreTaskPage,
  type CoreTaskReference,
  type IAddonConnectionProfilesRegistry,
  type ICoreCacheTransport,
  type IWorkspacesRepository,
  type LocalMetadataSnapshot,
  type SaveLocalMetadataRequest,
  type TaskReferenceLookupRequest,
} from '@mr-tick/application'
import {
  AppError,
  createResponseViewModel,
  Either,
  isNonEmptyString,
} from '@mr-tick/shared/helpers'
import { IRequest } from '@mr-tick/shared/transport'
import { ViewModel } from '@mr-tick/shared/view-models'

import { HandlerBase } from '@/main/handlers/HandlerBase'
import { AddonLoader } from '@/main/services/addons/loader/AddonLoader'

export class CoreHandler implements HandlerBase<CoreHandler> {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly profilesResolver: IAddonConnectionProfilesRegistry,
    private readonly localRuntime: ICoreCacheTransport,
    private readonly addonLoader: AddonLoader,
  ) {}

  public async listTaskReferences(
    event: Electron.IpcMainInvokeEvent,
    { body }: IRequest<TaskReferenceLookupRequest>,
  ): Promise<ViewModel<CoreTaskReference[]>> {
    const result = await this.localRuntime.queryCore({
      ...body,
      action: 'taskReferences',
    })
    if (!result.ok)
      return createResponseViewModel(
        Either.failure(
          AppError.Http(result.error.statusCode, result.error.messageKey),
        ),
      )
    if (result.value.kind !== 'taskReferences')
      return createResponseViewModel(
        Either.failure(AppError.Internal('INVALID_REFERENCE_RESPONSE')),
      )
    return createResponseViewModel(Either.success(result.value.references))
  }

  public getLocalMetadata(
    event: Electron.IpcMainInvokeEvent,
    { body }: IRequest<{ workspaceId: string }>,
  ): Promise<ViewModel<LocalMetadataSnapshot>> {
    return this.localMetadata({
      action: 'localMetadata',
      workspaceId: body.workspaceId,
      connectionInstanceId: '',
    })
  }

  public saveLocalMetadata(
    event: Electron.IpcMainInvokeEvent,
    { body }: IRequest<SaveLocalMetadataRequest>,
  ): Promise<ViewModel<LocalMetadataSnapshot>> {
    return this.localMetadata({
      action: 'saveLocalMetadata',
      workspaceId: body.workspaceId,
      connectionInstanceId: '',
      values: body.values,
      revision: body.revision,
    })
  }

  private async localMetadata(
    input: CoreCacheQuery,
  ): Promise<ViewModel<LocalMetadataSnapshot>> {
    const result = await this.localRuntime.queryCore(input)
    if (!result.ok)
      return createResponseViewModel(
        Either.failure(
          AppError.Http(result.error.statusCode, result.error.messageKey),
        ),
      )
    if (result.value.kind !== 'localMetadata')
      return createResponseViewModel(
        Either.failure(AppError.Internal('INVALID_METADATA_RESPONSE')),
      )
    return createResponseViewModel(
      Either.success({
        values: result.value.values,
        revision: result.value.revision,
      }),
    )
  }

  public async listConnections(
    event: Electron.IpcMainInvokeEvent,
    { body }: IRequest<{ workspaceId: string; capability?: string }>,
  ): Promise<ViewModel<CoreConnection[]>> {
    if (!event || !body || !isNonEmptyString(body.workspaceId)) {
      return createResponseViewModel(
        Either.failure(AppError.ValidationError('WORKSPACE_REQUIRED')),
      )
    }

    const wsResult = await this.workspacesRepository.getById(body.workspaceId)
    if (wsResult.isFailure()) {
      return createResponseViewModel(wsResult.forwardFailure())
    }
    const workspace = wsResult.success
    if (workspace === undefined) {
      return createResponseViewModel(
        Either.failure(AppError.NotFound('WORKSPACE_NOT_FOUND')),
      )
    }

    const connections: CoreConnection[] = []
    for (const conn of workspace.connections) {
      let capability: string | undefined = undefined
      const profilesResult = await this.profilesResolver.getConnectionProfiles(
        conn.addonId,
      )
      if (profilesResult.isSuccess()) {
        const matchingProfile = profilesResult.success.find(
          (p) => p.connectionProfileId === conn.connectionProfileId,
        )
        if (
          matchingProfile !== undefined &&
          matchingProfile.capability !== undefined
        ) {
          capability = matchingProfile.capability
        }
      }
      if (capability === undefined) {
        const isDataSource = this.addonLoader.dataSourceRegistry
          .getItems()
          .some((ds) => ds.id === conn.addonId)
        if (isDataSource) {
          capability = 'dataSource'
        }
      }

      if (body.capability !== undefined && capability !== body.capability) {
        continue
      }

      let avatarUrl: string | null = null
      if (
        conn.identity !== undefined &&
        conn.identity.kind !== 'installation' &&
        conn.identity.avatarUrl !== undefined
      ) {
        avatarUrl = conn.identity.avatarUrl
      }

      let identity: CoreConnection['identity'] = null
      if (conn.identity !== undefined) {
        identity = {
          kind: conn.identity.kind,
          displayName: conn.identity.displayName,
          avatarUrl,
        }
      }

      connections.push({
        workspaceId: workspace.id,
        connectionInstanceId: conn.id,
        addonId: conn.addonId,
        connectionProfileId: conn.connectionProfileId,
        cardinality: conn.cardinality,
        status: conn.status,
        capability,
        identity,
      })
    }

    return createResponseViewModel(Either.success(connections))
  }

  public async listTasks(
    event: Electron.IpcMainInvokeEvent,
    { body }: IRequest<CoreTaskListRequest>,
  ): Promise<ViewModel<CoreTaskPage>> {
    if (
      !event ||
      !body ||
      !isNonEmptyString(body.workspaceId) ||
      !isNonEmptyString(body.connectionInstanceId) ||
      !Number.isInteger(body.limit) ||
      body.limit < 1 ||
      body.limit > 100
    ) {
      return createResponseViewModel(
        Either.failure(AppError.ValidationError('INVALID_TASK_LIST_REQUEST')),
      )
    }

    const response = await this.localRuntime.queryCore({
      action: 'tasks',
      workspaceId: body.workspaceId,
      connectionInstanceId: body.connectionInstanceId,
      limit: body.limit,
      search: body.search,
      cursor: body.cursor,
      offset: body.offset,
      sortByUpdatedAt: body.sortByUpdatedAt,
      statusId: body.statusId,
      priorityId: body.priorityId,
      assignedMemberId: body.assignedMemberId,
    })

    if (!response.ok) {
      return createResponseViewModel(
        Either.failure(
          AppError.Http(response.error.statusCode, response.error.messageKey),
        ),
      )
    }

    if (response.value.kind !== 'tasks') {
      return createResponseViewModel(
        Either.failure(AppError.Internal('CORE_READ_FAILED')),
      )
    }

    return createResponseViewModel(
      Either.success({
        tasks: response.value.tasks,
        hasMore: response.value.hasMore,
        nextCursor: response.value.nextCursor,
      }),
    )
  }

  public async getTask(
    event: Electron.IpcMainInvokeEvent,
    { body }: IRequest<CoreTaskReference>,
  ): Promise<ViewModel<CoreTask>> {
    if (
      !event ||
      !body ||
      !isNonEmptyString(body.workspaceId) ||
      !isNonEmptyString(body.connectionInstanceId) ||
      !isNonEmptyString(body.taskId)
    ) {
      return createResponseViewModel(
        Either.failure(AppError.ValidationError('INVALID_TASK_REFERENCE')),
      )
    }

    const response = await this.localRuntime.queryCore({
      action: 'task',
      workspaceId: body.workspaceId,
      connectionInstanceId: body.connectionInstanceId,
      taskId: body.taskId,
    })

    if (!response.ok) {
      return createResponseViewModel(
        Either.failure(
          AppError.Http(response.error.statusCode, response.error.messageKey),
        ),
      )
    }

    if (response.value.kind !== 'task') {
      return createResponseViewModel(
        Either.failure(AppError.Internal('CORE_READ_FAILED')),
      )
    }

    return createResponseViewModel(Either.success(response.value.task))
  }

  public async getMetadata(
    event: Electron.IpcMainInvokeEvent,
    { body }: IRequest<CoreConnectionScope>,
  ): Promise<ViewModel<CoreMetadata>> {
    if (
      !event ||
      !body ||
      !isNonEmptyString(body.workspaceId) ||
      !isNonEmptyString(body.connectionInstanceId)
    ) {
      return createResponseViewModel(
        Either.failure(AppError.ValidationError('INVALID_METADATA_SCOPE')),
      )
    }

    const response = await this.localRuntime.queryCore({
      action: 'metadata',
      workspaceId: body.workspaceId,
      connectionInstanceId: body.connectionInstanceId,
    })

    if (!response.ok) {
      return createResponseViewModel(
        Either.failure(
          AppError.Http(response.error.statusCode, response.error.messageKey),
        ),
      )
    }

    if (response.value.kind !== 'metadata') {
      return createResponseViewModel(
        Either.failure(AppError.Internal('CORE_READ_FAILED')),
      )
    }

    return createResponseViewModel(Either.success(response.value.metadata))
  }
}
