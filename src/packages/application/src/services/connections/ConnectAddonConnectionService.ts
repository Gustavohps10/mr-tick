import { AppError, Either, isNonEmptyString } from '@mr-tick/shared/helpers'

import type {
  ConnectAddonConnectionInput,
  ConnectAddonConnectionResult,
  IAddonAuthenticatorRegistry,
  IAddonConnectionProfilesResolver,
  IConnectAddonConnectionUseCase,
  IConnectionLifecycleCoordinator,
  IWorkspacesRepository,
} from '@/contracts'

export class ConnectAddonConnectionService implements IConnectAddonConnectionUseCase {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly connectionLifecycleCoordinator: IConnectionLifecycleCoordinator,
    private readonly profilesResolver: IAddonConnectionProfilesResolver,
    private readonly authenticatorRegistry: IAddonAuthenticatorRegistry,
  ) {}

  public async execute(
    input: ConnectAddonConnectionInput,
  ): Promise<Either<AppError, ConnectAddonConnectionResult>> {
    const workspaceResult = await this.workspacesRepository.getById(
      input.workspaceId,
    )
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (workspace === undefined)
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

    const connection = workspace.connections.find(
      (candidate) => candidate.id === input.connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))

    const targetAddonId = input.addonId ?? connection.addonId
    if (input.addonId !== undefined && connection.addonId !== input.addonId)
      return Either.failure(
        AppError.Http(409, 'CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
      )

    const profilesResult =
      await this.profilesResolver.getConnectionProfiles(targetAddonId)
    if (profilesResult.isFailure()) return profilesResult.forwardFailure()

    const profile = profilesResult.success.find(
      (candidate) =>
        candidate.connectionProfileId === connection.connectionProfileId &&
        candidate.cardinality === connection.cardinality,
    )
    if (profile === undefined)
      return Either.failure(
        AppError.ValidationError('CONNECTION_PROFILE_NOT_DECLARED'),
      )

    if (input.authenticationInput.method === 'none') {
      const result = await this.connectionLifecycleCoordinator.connect({
        workspaceId: input.workspaceId,
        connectionInstanceId: input.connectionInstanceId,
        addonId: targetAddonId,
        profile,
        method: 'none',
        configuration: input.authenticationInput.configuration,
      })
      if (result.isFailure()) return result.forwardFailure()
      return Either.success({})
    }

    const authInput = input.authenticationInput
    if (!isNonEmptyString(authInput.authorizationRole)) {
      return Either.failure(
        AppError.ValidationError('AUTHORIZATION_ROLE_REQUIRED'),
      )
    }

    if (profile.roles !== undefined && profile.roles.length > 0) {
      const roleDescriptor = profile.roles.find(
        (candidate) =>
          candidate.authorizationRole === authInput.authorizationRole,
      )
      if (roleDescriptor === undefined) {
        return Either.failure(
          AppError.ValidationError('AUTHORIZATION_ROLE_NOT_DECLARED'),
        )
      }
      if (
        !roleDescriptor.allowedAuthProfileIds.includes(authInput.authProfileId)
      ) {
        return Either.failure(
          AppError.ValidationError('AUTH_PROFILE_NOT_ALLOWED_FOR_ROLE'),
        )
      }
    }

    if (profile.roles === undefined || profile.roles.length === 0) {
      if (
        profile.allowedAuthProfileIds !== undefined &&
        profile.allowedAuthProfileIds.length > 0
      ) {
        if (!profile.allowedAuthProfileIds.includes(authInput.authProfileId)) {
          return Either.failure(
            AppError.ValidationError('AUTH_PROFILE_NOT_ALLOWED'),
          )
        }
      }
    }

    const authenticator = this.authenticatorRegistry.getAuthenticator(
      targetAddonId,
      authInput.authProfileId,
    )
    if (authenticator === undefined) {
      return Either.failure(AppError.ValidationError('AUTHENTICATOR_NOT_FOUND'))
    }

    if (authInput.method === 'oauth') {
      if (authenticator.method !== 'oauth') {
        return Either.failure(
          AppError.ValidationError('UNSUPPORTED_AUTHENTICATION_METHOD'),
        )
      }
      const configuration = authInput.configuration ?? {}
      const result = await this.connectionLifecycleCoordinator.connect({
        workspaceId: input.workspaceId,
        connectionInstanceId: input.connectionInstanceId,
        addonId: targetAddonId,
        profile,
        method: 'authorized',
        authorizationRole: authInput.authorizationRole,
        authProfileId: authInput.authProfileId,
        configuration,
        correlation: authInput.correlation,
        authenticate: async () => {
          return authenticator.completeAuthentication(
            {
              workspaceId: input.workspaceId,
              connectionInstanceId: input.connectionInstanceId,
            },
            authInput.response,
          )
        },
      })
      if (result.isFailure()) return result.forwardFailure()
      if (result.success.kind === 'none') {
        return Either.success({})
      }
      return Either.success({
        identity: result.success.identity,
      })
    }

    if (authenticator.method !== 'credentials') {
      return Either.failure(
        AppError.ValidationError('UNSUPPORTED_AUTHENTICATION_METHOD'),
      )
    }

    const result = await this.connectionLifecycleCoordinator.connect({
      workspaceId: input.workspaceId,
      connectionInstanceId: input.connectionInstanceId,
      addonId: targetAddonId,
      profile,
      method: 'authorized',
      authorizationRole: authInput.authorizationRole,
      authProfileId: authInput.authProfileId,
      configuration: authInput.configuration,
      authenticate: async () => {
        return authenticator.authenticate(
          authInput.credentials,
          authInput.configuration,
        )
      },
    })
    if (result.isFailure()) return result.forwardFailure()
    if (result.success.kind === 'none') {
      return Either.success({})
    }
    return Either.success({
      identity: result.success.identity,
    })
  }
}
