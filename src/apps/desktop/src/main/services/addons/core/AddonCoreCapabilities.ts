import type {
  AddonConnectionAuthenticator,
  CoreCacheQuery,
  CoreCacheValue,
  CoreConnection,
  CoreConnectionAuthenticationInput,
  CoreConnectionAuthorizationRequest,
  CoreConnectionAuthorizationResponse,
  CoreConnectionCreateInput,
  CoreConnectionScope,
  CoreWorkspace,
  IAddonAuthenticatorRegistry,
  IAddonConnectionProfilesResolver,
  IConnectAddonConnectionUseCase,
  IConnectionLifecycleCoordinator,
  ICoreAddonCapabilities,
  ICoreCacheTransport,
  ICoreConnectionsAPI,
  ICoreMembersAPI,
  ICoreReadAPI,
  IDisconnectAddonConnectionUseCase,
  IGetCurrentUserUseCase,
  ILinkConnectionUseCase,
  IOAuthAttemptCoordinator,
  IUnlinkConnectionUseCase,
  IWorkspacesRepository,
  WorkspaceConnectionDTO,
} from '@mr-tick/application'
import { validateCoreCacheQuery, validateCoreScope } from '@mr-tick/application'
import {
  type ConnectionProfileDescriptor,
  isValidConnectionProfileDescriptors,
  type Workspace,
} from '@mr-tick/domain'
import { AppError, Either, isNonEmptyString } from '@mr-tick/shared/helpers'
import type { ISystemEventEmitter } from '@mr-tick/shared/transport'

/** Exposes product capabilities, without repository entities or provider secrets. */
export class AddonCoreCapabilities implements ICoreAddonCapabilities {
  readonly runtime: ICoreReadAPI['runtime']
  readonly workspaces: ICoreReadAPI['workspaces']
  readonly connections: ICoreConnectionsAPI
  readonly tasks: ICoreReadAPI['tasks']
  readonly metadata: ICoreReadAPI['metadata']
  readonly members: ICoreMembersAPI

  constructor(
    private readonly repository: IWorkspacesRepository,
    private readonly transport: ICoreCacheTransport,
    private readonly addonId: string,
    private readonly connectionLifecycleCoordinator: IConnectionLifecycleCoordinator,
    private readonly linkConnectionService: ILinkConnectionUseCase,
    private readonly connectConnectionService: IConnectAddonConnectionUseCase,
    private readonly disconnectConnectionService: IDisconnectAddonConnectionUseCase,
    private readonly unlinkConnectionService: IUnlinkConnectionUseCase,
    private readonly authenticatorRegistry: IAddonAuthenticatorRegistry,
    private readonly profilesResolver: IAddonConnectionProfilesResolver,
    private readonly oauthAttemptCoordinator: IOAuthAttemptCoordinator,
    private readonly systemEventEmitter: ISystemEventEmitter,
    private readonly getCurrentUserService: IGetCurrentUserUseCase,
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
      create: (input) => this.createConnection(input),
      createAuthorizationRequest: (scope) =>
        this.createAuthorizationRequest(scope),
      completeAuthentication: (scope, response) =>
        this.completeAuthentication(scope, response),
      submitCredentials: (scope, input) => this.submitCredentials(scope, input),
      withCredentials: (scope, operation) =>
        this.withCredentials(scope, operation),
      refresh: (scope) => this.refreshConnection(scope),
      disconnect: (scope) => this.disconnectConnection(scope),
      archive: (scope) => this.archiveConnection(scope),
      restore: (scope) => this.restoreConnection(scope),
      remove: (scope) => this.removeConnection(scope),
    }
    this.tasks = {
      list: async (request) => {
        const result = await this.query({ ...request, action: 'tasks' })
        if (result.isFailure()) return result.forwardFailure()
        if (result.success.kind !== 'tasks') return invalidReply()
        return Either.success({
          tasks: result.success.tasks,
          hasMore: result.success.hasMore,
          nextCursor: result.success.nextCursor,
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
    this.members = {
      getCurrentUser: async (scope) => {
        const scopeValidation = validateCoreScope(scope)
        if (scopeValidation.isFailure()) return scopeValidation.forwardFailure()
        const userResult = await this.getCurrentUserService.execute({
          workspaceId: scope.workspaceId,
          connectionInstanceId: scope.connectionInstanceId,
        })
        if (userResult.isFailure()) return userResult.forwardFailure()
        return Either.success({
          id: String(userResult.success.id),
          name: `${userResult.success.firstname} ${userResult.success.lastname}`.trim(),
          avatarUrl: userResult.success.avatarUrl,
        })
      },
    }
  }

  private async findWorkspace(
    id: string,
  ): Promise<Either<AppError, Workspace>> {
    if (!isNonEmptyString(id))
      return Either.failure(AppError.ValidationError('WORKSPACE_REQUIRED'))
    try {
      const workspaceResult = await this.repository.getById(id)
      if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
      const workspace = workspaceResult.success
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
      const allItems: Workspace[] = []
      let page = 1
      const pageSize = 50
      let total = 0
      do {
        const result = await this.repository.list(undefined, { page, pageSize })
        if (result.isFailure()) return result.forwardFailure()
        allItems.push(...result.success.items)
        total = result.success.total
        if (result.success.items.length === 0) break
        page += 1
      } while (allItems.length < total)

      return Either.success(
        allItems.map(toWorkspace).sort((a, b) => compareIds(a.id, b.id)),
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
      result.success.connections
        .filter((connection) => connection.addonId === this.addonId)
        .map((connection) => toCoreConnection(workspaceId, connection))
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
  private async createConnection(
    input: CoreConnectionCreateInput,
  ): Promise<Either<AppError, CoreConnection>> {
    if (
      !isNonEmptyString(input.workspaceId) ||
      !isNonEmptyString(input.connectionProfileId)
    )
      return Either.failure(
        AppError.ValidationError('CONNECTION_CREATE_INVALID'),
      )
    const connectionInstanceId = crypto.randomUUID()
    const result = await this.linkConnectionService.execute({
      workspaceId: input.workspaceId,
      connectionInstanceId,
      addonId: this.addonId,
      connectionProfileId: input.connectionProfileId,
    })
    if (result.isFailure()) return result.forwardFailure()
    const connection = result.success.connections.find(
      (candidate) => candidate.id === connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(
        AppError.Internal('CONNECTION_CREATE_NOT_COMMITTED'),
      )
    return Either.success(toCoreConnection(input.workspaceId, connection))
  }
  private async createAuthorizationRequest(
    scope: CoreConnectionScope,
  ): Promise<Either<AppError, CoreConnectionAuthorizationRequest>> {
    const valid = validateCoreScope(scope)
    if (valid.isFailure()) return valid.forwardFailure()

    const workspaceResult = await this.findWorkspace(scope.workspaceId)
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const connection = workspaceResult.success.connections.find(
      (item) => item.id === scope.connectionInstanceId,
    )
    if (connection === undefined) {
      return Either.failure(AppError.NotFound('CONNECTION_NOT_FOUND'))
    }

    const context = await this.connectionAuthenticationContext(scope)
    if (context.isFailure()) return context.forwardFailure()
    const authenticator = context.success.authenticator
    if (authenticator.method !== 'oauth') {
      return Either.failure(
        AppError.ValidationError('UNSUPPORTED_AUTHENTICATION_METHOD'),
      )
    }

    const role = context.success.authorizationRole

    const existingAuth = connection.authorizations.find(
      (candidate) => candidate.authorizationRole === role,
    )
    const authorizationGeneration =
      existingAuth !== undefined ? existingAuth.generation : 0
    const authorizationId = existingAuth?.authorizationId

    let redirectUri = authenticator.redirectUri
    if (redirectUri === undefined || redirectUri.trim().length === 0) {
      const envRedirect = process.env.MR_TICK_OAUTH_REDIRECT_URI
      if (envRedirect !== undefined && envRedirect.trim().length > 0) {
        redirectUri = envRedirect.trim()
      }
    }
    if (redirectUri === undefined || redirectUri.trim().length === 0) {
      redirectUri = 'mr-tick-app://oauth/callback'
    }

    const attemptResult = await this.oauthAttemptCoordinator.startAttempt({
      addonId: this.addonId,
      workspaceId: scope.workspaceId,
      connectionInstanceId: scope.connectionInstanceId,
      authProfileId: authenticator.authProfileId,
      authorizationRole: role,
      generation: connection.generation,
      authorizationGeneration,
      authorizationId,
      redirectUri,
    })
    if (attemptResult.isFailure()) return attemptResult.forwardFailure()

    const requestResult = await authenticator.createAuthorizationRequest(
      {
        workspaceId: scope.workspaceId,
        connectionInstanceId: scope.connectionInstanceId,
        authorizationRole: role,
      },
      attemptResult.success,
    )
    if (requestResult.isFailure()) {
      this.oauthAttemptCoordinator.cancelAttempt(attemptResult.success.state)
      return requestResult.forwardFailure()
    }

    try {
      const parsedUrl = new URL(requestResult.success.authUrl)
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        this.oauthAttemptCoordinator.cancelAttempt(attemptResult.success.state)
        return Either.failure(
          AppError.ValidationError('OAUTH_ENDPOINT_PROTOCOL_INVALID'),
        )
      }
      const urlState = parsedUrl.searchParams.get('state')
      if (urlState === null || urlState !== attemptResult.success.state) {
        this.oauthAttemptCoordinator.cancelAttempt(attemptResult.success.state)
        return Either.failure(
          AppError.ValidationError('OAUTH_STATE_MISMATCH_IN_AUTH_URL'),
        )
      }
      const urlRedirectUri = parsedUrl.searchParams.get('redirect_uri')
      if (urlRedirectUri === null || urlRedirectUri !== redirectUri) {
        this.oauthAttemptCoordinator.cancelAttempt(attemptResult.success.state)
        return Either.failure(
          AppError.ValidationError('OAUTH_REDIRECT_URI_MISMATCH_IN_AUTH_URL'),
        )
      }
      const urlCodeChallenge = parsedUrl.searchParams.get('code_challenge')
      if (
        urlCodeChallenge === null ||
        urlCodeChallenge !== attemptResult.success.codeChallenge
      ) {
        this.oauthAttemptCoordinator.cancelAttempt(attemptResult.success.state)
        return Either.failure(
          AppError.ValidationError('OAUTH_CODE_CHALLENGE_MISMATCH_IN_AUTH_URL'),
        )
      }
      const urlChallengeMethod = parsedUrl.searchParams.get(
        'code_challenge_method',
      )
      if (urlChallengeMethod !== 'S256') {
        this.oauthAttemptCoordinator.cancelAttempt(attemptResult.success.state)
        return Either.failure(
          AppError.ValidationError(
            'OAUTH_CODE_CHALLENGE_METHOD_INVALID_IN_AUTH_URL',
          ),
        )
      }
    } catch {
      this.oauthAttemptCoordinator.cancelAttempt(attemptResult.success.state)
      return Either.failure(AppError.ValidationError('INVALID_OAUTH_AUTH_URL'))
    }

    return requestResult
  }

  private async completeAuthentication(
    scope: CoreConnectionScope,
    response: CoreConnectionAuthorizationResponse,
  ): Promise<Either<AppError, CoreConnection>> {
    const valid = validateCoreScope(scope)
    if (valid.isFailure()) return valid.forwardFailure()
    if (!isNonEmptyString(scope.authorizationRole))
      return Either.failure(
        AppError.ValidationError('AUTHORIZATION_ROLE_REQUIRED'),
      )

    const workspaceResult = await this.findWorkspace(scope.workspaceId)
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const connection = workspaceResult.success.connections.find(
      (item) => item.id === scope.connectionInstanceId,
    )
    if (connection === undefined) {
      return Either.failure(AppError.NotFound('CONNECTION_NOT_FOUND'))
    }

    const existingAuth = connection.authorizations.find(
      (candidate) => candidate.authorizationRole === scope.authorizationRole,
    )
    const currentAuthGeneration =
      existingAuth !== undefined ? existingAuth.generation : 0
    const authorizationId = existingAuth?.authorizationId
    const expectedAuthProfileId = existingAuth?.authProfileId

    const consumedResult = await this.oauthAttemptCoordinator.consumeAttempt({
      state: response.state,
      addonId: this.addonId,
      workspaceId: scope.workspaceId,
      connectionInstanceId: scope.connectionInstanceId,
      authProfileId: expectedAuthProfileId,
      authorizationRole: scope.authorizationRole,
      generation: connection.generation,
      authorizationGeneration: currentAuthGeneration,
      authorizationId,
    })
    if (consumedResult.isFailure()) return consumedResult.forwardFailure()
    const consumed = consumedResult.success

    const targetAuthenticator = this.authenticatorRegistry.getAuthenticator(
      this.addonId,
      consumed.authProfileId,
    )
    if (
      targetAuthenticator === undefined ||
      targetAuthenticator.method !== 'oauth'
    ) {
      return Either.failure(AppError.ValidationError('AUTHENTICATOR_NOT_FOUND'))
    }

    let configuration: Readonly<Record<string, string | number | boolean>> = {}
    if (connection.config !== undefined) configuration = connection.config
    if (response.configuration !== undefined)
      configuration = response.configuration
    const connected = await this.connectConnectionService.execute({
      workspaceId: scope.workspaceId,
      connectionInstanceId: scope.connectionInstanceId,
      addonId: this.addonId,
      authenticationInput: {
        method: 'oauth',
        authorizationRole: scope.authorizationRole,
        authProfileId: consumed.authProfileId,
        response: {
          code: response.code,
          state: response.state,
          codeVerifier: consumed.codeVerifier,
          redirectUri: consumed.redirectUri,
        },
        configuration,
        correlation: {
          connectionGeneration: consumed.generation,
          authorizationGeneration: consumed.authorizationGeneration,
          authorizationId: consumed.authorizationId,
        },
      },
    })
    if (connected.isFailure()) return connected.forwardFailure()
    return this.getConnection(scope)
  }

  private async refreshConnection(
    scope: CoreConnectionScope & { authorizationRole?: string },
  ): Promise<Either<AppError, void>> {
    const valid = validateCoreScope(scope)
    if (valid.isFailure()) return valid.forwardFailure()
    return this.connectionLifecycleCoordinator.refresh({
      addonId: this.addonId,
      scope,
    })
  }
  private async submitCredentials(
    scope: CoreConnectionScope,
    input: CoreConnectionAuthenticationInput,
  ): Promise<Either<AppError, CoreConnection>> {
    const valid = validateCoreScope(scope)
    if (valid.isFailure()) return valid.forwardFailure()
    if (!isNonEmptyString(input.authProfileId) || input.kind !== 'credentials')
      return Either.failure(
        AppError.ValidationError('AUTHENTICATION_INPUT_INVALID'),
      )
    const authorizationRole = input.authorizationRole ?? scope.authorizationRole
    if (!isNonEmptyString(authorizationRole))
      return Either.failure(
        AppError.ValidationError('AUTHORIZATION_ROLE_REQUIRED'),
      )
    const connected = await this.connectConnectionService.execute({
      workspaceId: scope.workspaceId,
      connectionInstanceId: scope.connectionInstanceId,
      addonId: this.addonId,
      authenticationInput: {
        method: 'credentials',
        authorizationRole,
        authProfileId: input.authProfileId,
        credentials: input.credentials,
        configuration: input.configuration,
      },
    })
    if (connected.isFailure()) return connected.forwardFailure()
    return this.getConnection(scope)
  }
  private async disconnectConnection(
    scope: CoreConnectionScope,
  ): Promise<Either<AppError, void>> {
    const connectionResult = await this.getConnection(scope)
    if (connectionResult.isFailure()) return connectionResult.forwardFailure()
    this.oauthAttemptCoordinator.invalidateForConnection(
      scope.workspaceId,
      scope.connectionInstanceId,
    )
    const result = await this.disconnectConnectionService.execute({
      workspaceId: scope.workspaceId,
      connectionInstanceId: scope.connectionInstanceId,
      addonId: this.addonId,
    })
    if (result.isSuccess()) {
      this.systemEventEmitter.emit('connection:disconnected', {
        workspaceId: scope.workspaceId,
        connectionInstanceId: scope.connectionInstanceId,
      })
    }
    return result
  }

  private async withCredentials(
    scope: CoreConnectionScope & { authorizationRole?: string },
    operation: Parameters<ICoreConnectionsAPI['withCredentials']>[1],
  ): Promise<Either<AppError, void>> {
    const connectionResult = await this.getConnection(scope)
    if (connectionResult.isFailure()) return connectionResult.forwardFailure()
    if (connectionResult.success.status !== 'connected')
      return Either.failure(AppError.Http(409, 'CONNECTION_NOT_CONNECTED'))
    const workspaceResult = await this.findWorkspace(scope.workspaceId)
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const connection = workspaceResult.success.connections.find(
      (candidate) => candidate.id === scope.connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(AppError.NotFound('CONNECTION_NOT_FOUND'))

    let authorizationRole = scope.authorizationRole
    if (authorizationRole === undefined) {
      if (connection.authorizations.length === 1) {
        authorizationRole = connection.authorizations[0].authorizationRole
      }
    }
    if (authorizationRole === undefined) {
      return Either.failure(
        AppError.ValidationError('AUTHORIZATION_ROLE_REQUIRED'),
      )
    }

    return this.connectionLifecycleCoordinator.withCredentials({
      addonId: this.addonId,
      scope: {
        workspaceId: scope.workspaceId,
        connectionInstanceId: scope.connectionInstanceId,
        authorizationRole,
      },
      operation,
    })
  }

  private async removeConnection(
    scope: CoreConnectionScope,
  ): Promise<Either<AppError, void>> {
    const connectionResult = await this.getConnection(scope)
    if (connectionResult.isFailure()) return connectionResult.forwardFailure()
    this.oauthAttemptCoordinator.invalidateForConnection(
      scope.workspaceId,
      scope.connectionInstanceId,
    )
    const removed = await this.unlinkConnectionService.execute({
      workspaceId: scope.workspaceId,
      connectionInstanceId: scope.connectionInstanceId,
      addonId: this.addonId,
    })
    if (removed.isFailure()) return removed.forwardFailure()
    this.systemEventEmitter.emit('connection:removed', {
      workspaceId: scope.workspaceId,
      connectionInstanceId: scope.connectionInstanceId,
    })
    return Either.success()
  }

  private async archiveConnection(
    scope: CoreConnectionScope,
  ): Promise<Either<AppError, void>> {
    const connectionResult = await this.getConnection(scope)
    if (connectionResult.isFailure()) return connectionResult.forwardFailure()
    this.oauthAttemptCoordinator.invalidateForConnection(
      scope.workspaceId,
      scope.connectionInstanceId,
    )
    const result = await this.connectionLifecycleCoordinator.archive({
      workspaceId: scope.workspaceId,
      connectionInstanceId: scope.connectionInstanceId,
      addonId: this.addonId,
    })
    if (result.isSuccess()) {
      this.systemEventEmitter.emit('connection:archived', {
        workspaceId: scope.workspaceId,
        connectionInstanceId: scope.connectionInstanceId,
      })
    }
    return result
  }

  private async restoreConnection(
    scope: CoreConnectionScope,
  ): Promise<Either<AppError, CoreConnection>> {
    const connectionResult = await this.getConnection(scope)
    if (connectionResult.isFailure()) return connectionResult.forwardFailure()
    const restored = await this.connectionLifecycleCoordinator.restore({
      workspaceId: scope.workspaceId,
      connectionInstanceId: scope.connectionInstanceId,
      addonId: this.addonId,
    })
    if (restored.isFailure()) return restored.forwardFailure()
    const connection = restored.success.connections.find(
      (candidate) => candidate.id === scope.connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(
        AppError.Internal('CONNECTION_RESTORE_NOT_COMMITTED'),
      )
    return Either.success(toCoreConnection(scope.workspaceId, connection))
  }
  private async connectionAuthenticationContext(
    scope: CoreConnectionScope,
  ): Promise<
    Either<
      AppError,
      {
        authenticator: Extract<
          AddonConnectionAuthenticator,
          { method: 'oauth' }
        >
        authorizationRole: string
      }
    >
  > {
    const valid = validateCoreScope(scope)
    if (valid.isFailure()) return valid.forwardFailure()
    const workspaceResult = await this.findWorkspace(scope.workspaceId)
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const connection = workspaceResult.success.connections.find(
      (candidate) => candidate.id === scope.connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(AppError.NotFound('CONNECTION_NOT_FOUND'))
    if (connection.addonId !== this.addonId)
      return Either.failure(
        AppError.Http(409, 'CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
      )
    const profiles = await this.connectionProfiles()
    if (profiles.isFailure()) return profiles.forwardFailure()
    const profile = profiles.success.find(
      (candidate) =>
        candidate.connectionProfileId === connection.connectionProfileId &&
        candidate.cardinality === connection.cardinality,
    )
    if (profile === undefined)
      return Either.failure(
        AppError.ValidationError('CONNECTION_PROFILE_INVALID'),
      )

    let authorizationRole = scope.authorizationRole?.trim()

    if (!authorizationRole && profile.roles?.length === 1)
      for (const role of profile.roles)
        authorizationRole = role.authorizationRole

    if (!authorizationRole)
      return Either.failure(
        AppError.ValidationError('AUTHORIZATION_ROLE_REQUIRED'),
      )

    let authProfileId = profile.defaultAuthProfileId

    if (profile.roles && profile.roles.length > 0) {
      const role = profile.roles.find(
        (item) => item.authorizationRole === authorizationRole,
      )

      if (!role)
        return Either.failure(
          AppError.ValidationError('AUTHORIZATION_ROLE_NOT_ALLOWED'),
        )

      authProfileId = role.defaultAuthProfileId

      if (authProfileId && !role.allowedAuthProfileIds.includes(authProfileId))
        return Either.failure(
          AppError.ValidationError('AUTH_PROFILE_NOT_ALLOWED_FOR_ROLE'),
        )
    }

    if (!authProfileId)
      return Either.failure(
        AppError.ValidationError('AUTH_PROFILE_SELECTION_REQUIRED'),
      )

    if (
      (profile.roles === undefined || profile.roles.length === 0) &&
      profile.allowedAuthProfileIds &&
      !profile.allowedAuthProfileIds.includes(authProfileId)
    )
      return Either.failure(
        AppError.ValidationError('AUTH_PROFILE_NOT_ALLOWED'),
      )

    const authenticator = this.authenticatorRegistry.getAuthenticator(
      this.addonId,
      authProfileId,
    )

    if (!authenticator)
      return Either.failure(
        AppError.NotFound('CONNECTION_AUTHENTICATOR_NOT_FOUND'),
      )

    if (authenticator.method !== 'oauth')
      return Either.failure(
        AppError.ValidationError('UNSUPPORTED_AUTHENTICATION_METHOD'),
      )

    return Either.success({ authenticator, authorizationRole })
  }

  private async connectionProfiles(): Promise<
    Either<AppError, ConnectionProfileDescriptor[]>
  > {
    const profiles = await this.profilesResolver.getConnectionProfiles(
      this.addonId,
    )

    if (profiles.isFailure()) return profiles.forwardFailure()

    const descriptors = [...profiles.success]

    if (!isValidConnectionProfileDescriptors(descriptors))
      return Either.failure(
        AppError.ValidationError('CONNECTION_PROFILES_INVALID'),
      )

    return Either.success(descriptors)
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
function toCoreConnection(
  workspaceId: string,
  connection: Workspace['connections'][number] | WorkspaceConnectionDTO,
): CoreConnection {
  let identity: CoreConnection['identity'] = null
  let avatarUrl: string | null = null
  if (connection.identity !== undefined) {
    if (
      connection.identity.kind !== 'installation' &&
      connection.identity.avatarUrl !== undefined
    ) {
      avatarUrl = connection.identity.avatarUrl
    }
    identity = {
      kind: connection.identity.kind,
      displayName: connection.identity.displayName,
      avatarUrl,
    }
  }
  return {
    workspaceId,
    connectionInstanceId: connection.id,
    addonId: connection.addonId,
    connectionProfileId: connection.connectionProfileId,
    cardinality: connection.cardinality,
    status: connection.status,
    identity,
  }
}
function compareIds(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
function invalidReply(): Either<AppError, never> {
  return Either.failure(AppError.Internal('CORE_REPLY_INVALID'))
}
