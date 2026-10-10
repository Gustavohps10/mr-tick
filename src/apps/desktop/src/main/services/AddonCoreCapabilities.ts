import type {
  CoreCacheQuery,
  CoreCacheValue,
  CoreConnection,
  CoreConnectionScope,
  CoreWorkspace,
  ICoreCacheTransport,
  ICoreReadAPI,
  IWorkspacesRepository,
} from '@mr-tick/application'
import { validateCoreCacheQuery, validateCoreScope } from '@mr-tick/application'
import type { Workspace } from '@mr-tick/domain'
import { AppError, Either, isNonEmptyString } from '@mr-tick/shared/helpers'

/** Exposes product capabilities, without repository entities or provider secrets. */
export class AddonCoreCapabilities implements ICoreReadAPI {
  readonly runtime: ICoreReadAPI['runtime']
  readonly workspaces: ICoreReadAPI['workspaces']
  readonly connections: ICoreReadAPI['connections']
  readonly tasks: ICoreReadAPI['tasks']
  readonly metadata: ICoreReadAPI['metadata']

  constructor(
    private readonly repository: IWorkspacesRepository,
    private readonly transport: ICoreCacheTransport,
  ) {
    this.runtime = {
      getState: () => transport.getState(),
      onStateChanged: (listener) => transport.onStateChanged(listener),
    }
    this.workspaces = {
      list: () => this.listWorkspaces(),
      get: async (workspaceId) => {
        const result = await this.findWorkspace(workspaceId)
        if (result.isFailure()) return result.forwardFailure()
        return Either.success(toWorkspace(result.success))
      },
    }
    this.connections = {
      list: (workspaceId) => this.listConnections(workspaceId),
      get: (scope) => this.getConnection(scope),
    }
    this.tasks = {
      list: async (request) => {
        const result = await this.query({ ...request, action: 'tasks' })
        if (result.isFailure()) return result.forwardFailure()
        if (result.success.kind !== 'tasks') return invalidReply()
        return Either.success({
          tasks: result.success.tasks,
          hasMore: result.success.hasMore,
        })
      },
      get: async (reference) => {
        const result = await this.query({ ...reference, action: 'task' })
        if (result.isFailure()) return result.forwardFailure()
        if (result.success.kind !== 'task') return invalidReply()
        return Either.success(result.success.task)
      },
    }
    this.metadata = {
      get: async (scope) => {
        const result = await this.query({ ...scope, action: 'metadata' })
        if (result.isFailure()) return result.forwardFailure()
        if (result.success.kind !== 'metadata') return invalidReply()
        return Either.success(result.success.metadata)
      },
    }
  }

  private async findWorkspace(
    id: string,
  ): Promise<Either<AppError, Workspace>> {
    if (!isNonEmptyString(id))
      return Either.failure(AppError.ValidationError('WORKSPACE_REQUIRED'))
    try {
      const workspace = await this.repository.findById(id)
      if (workspace === undefined)
        return Either.failure(AppError.NotFound('WORKSPACE_NOT_FOUND'))
      return Either.success(workspace)
    } catch (error) {
      if (error instanceof Error)
        return Either.failure(AppError.Internal(error.message))
      return Either.failure(AppError.Internal('CORE_READ_FAILED'))
    }
  }
  private async listWorkspaces(): Promise<Either<AppError, CoreWorkspace[]>> {
    try {
      const result = await this.repository.findAll()
      return Either.success(
        result.items.map(toWorkspace).sort((a, b) => compareIds(a.id, b.id)),
      )
    } catch (error) {
      if (error instanceof Error)
        return Either.failure(AppError.Internal(error.message))
      return Either.failure(AppError.Internal('CORE_READ_FAILED'))
    }
  }
  private async listConnections(
    workspaceId: string,
  ): Promise<Either<AppError, CoreConnection[]>> {
    const result = await this.findWorkspace(workspaceId)
    if (result.isFailure()) return result.forwardFailure()
    return Either.success(
      result.success.dataSourceConnections
        .map((connection) => ({
          workspaceId,
          connectionInstanceId: connection.id,
          dataSourceId: connection.dataSourceId,
          status: connection.status,
        }))
        .sort((a, b) =>
          compareIds(a.connectionInstanceId, b.connectionInstanceId),
        ),
    )
  }
  private async getConnection(
    scope: CoreConnectionScope,
  ): Promise<Either<AppError, CoreConnection>> {
    const valid = validateCoreScope(scope)
    if (valid.isFailure()) return valid.forwardFailure()
    const result = await this.listConnections(scope.workspaceId)
    if (result.isFailure()) return result.forwardFailure()
    const connection = result.success.find(
      (item) => item.connectionInstanceId === scope.connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(AppError.NotFound('CONNECTION_NOT_FOUND'))
    return Either.success(connection)
  }
  private async query(
    input: CoreCacheQuery,
  ): Promise<Either<AppError, CoreCacheValue>> {
    const valid = validateCoreCacheQuery(input)
    if (valid.isFailure()) return valid.forwardFailure()
    const connection = await this.getConnection(input)
    if (connection.isFailure()) return connection.forwardFailure()
    const response = await this.transport.queryCore(input)
    if (!response.ok)
      return Either.failure(
        AppError.Http(response.error.statusCode, response.error.messageKey),
      )
    return Either.success(response.value)
  }
}
function toWorkspace(workspace: Workspace): CoreWorkspace {
  return { id: workspace.id, name: workspace.name, status: workspace.status }
}
function compareIds(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
function invalidReply(): Either<AppError, never> {
  return Either.failure(AppError.Internal('CORE_REPLY_INVALID'))
}
