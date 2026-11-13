import { createHash } from 'node:crypto'

import type {
  AnalyticsProviderContext,
  AnalyticsQueryAuthorization,
  IAnalyticsProvider,
  IAnalyticsResolver,
  IAnalyticsSource,
  ICredentialsVault,
  IHttpClientFactory,
  IWorkspacesRepository,
} from '@mr-tick/application'
import { CredentialReferenceFactory } from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

import { parseConnectionCredentialPayload } from '@/main/utils/credentialPayload'
import { selectPrimaryAuthorization } from '@/main/utils/selectPrimaryAuthorization'

export interface IAddonAnalyticsLoader {
  getAnalytics(addonId: string): IAnalyticsSource | undefined
}

interface CachedAnalytics {
  signature: string
  source: IAnalyticsSource
  provider: IAnalyticsProvider
}

function hashSignature(signature: string): string {
  return createHash('sha256').update(signature).digest('hex')
}

/** Resolves analytics directly from an authorized connection, without a datasource. */
export class AnalyticsResolver implements IAnalyticsResolver {
  private readonly cache = new Map<string, CachedAnalytics>()
  private readonly pending = new Map<
    string,
    Promise<
      Either<
        AppError,
        { provider: IAnalyticsProvider; authorizationKey: string }
      >
    >
  >()

  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly credentialsVault: ICredentialsVault,
    private readonly httpClientFactory: IHttpClientFactory,
    private readonly analyticsLoader: IAddonAnalyticsLoader,
  ) {}

  public resolve(
    workspaceId: string,
    connectionInstanceId: string,
  ): Promise<
    Either<AppError, { provider: IAnalyticsProvider; authorizationKey: string }>
  > {
    const key = JSON.stringify([workspaceId, connectionInstanceId])
    const existing = this.pending.get(key)
    if (existing !== undefined) return existing

    const resolution = this.resolveCurrent(
      workspaceId,
      connectionInstanceId,
    ).finally(() => this.pending.delete(key))
    this.pending.set(key, resolution)
    return resolution
  }

  public async resolveWorkspaceAuthorizations(
    workspaceId: string,
  ): Promise<Either<AppError, AnalyticsQueryAuthorization[]>> {
    if (!workspaceId.trim())
      return Either.failure(AppError.ValidationError('WORKSPACE_ID_REQUIRED'))

    const workspace = await this.workspacesRepository.getById(workspaceId)
    if (workspace.isFailure()) return workspace.forwardFailure()
    if (!workspace.success)
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

    const authorizations: AnalyticsQueryAuthorization[] = []
    const sources = new Map<string, IAnalyticsSource>()

    for (const connection of workspace.success.connections) {
      if (connection.status !== 'connected') continue

      const authorization = selectPrimaryAuthorization(connection)
      if (authorization.isFailure()) continue

      const selected = authorization.success
      const source = this.analyticsLoader.getAnalytics(connection.addonId)
      if (source === undefined) continue
      if (selected.credentialReferenceId === undefined) continue

      const reference = CredentialReferenceFactory.fromId(
        selected.credentialReferenceId,
      )
      if (reference === undefined) continue

      const signature = JSON.stringify([
        connection.generation,
        selected.authorizationId,
        selected.generation,
        selected.credentialReferenceId,
        selected.identity,
        connection.config,
      ])

      const credential = await this.credentialsVault.getToken(
        reference.service,
        reference.account,
      )

      if (credential.kind === 'unavailable')
        return Either.failure(
          AppError.Internal('CREDENTIALS_VAULT_UNAVAILABLE'),
        )

      if (credential.kind !== 'present') continue

      const payload = parseConnectionCredentialPayload(credential.token)
      if (payload.isFailure()) continue

      sources.set(connection.id, source)
      authorizations.push({
        connectionInstanceId: connection.id,
        authorizationKey: hashSignature(signature),
      })
    }

    const current = await this.workspacesRepository.getById(workspaceId)
    if (current.isFailure()) return current.forwardFailure()
    const stable: AnalyticsQueryAuthorization[] = []

    for (const candidate of authorizations) {
      const currentConnection = current.success?.connections.find(
        (item) => item.id === candidate.connectionInstanceId,
      )
      if (
        currentConnection === undefined ||
        currentConnection.status !== 'connected'
      )
        continue
      const currentAuthorization = selectPrimaryAuthorization(currentConnection)
      if (currentAuthorization.isFailure()) continue
      const currentSelected = currentAuthorization.success
      const currentSignature = JSON.stringify([
        currentConnection.generation,
        currentSelected.authorizationId,
        currentSelected.generation,
        currentSelected.credentialReferenceId,
        currentSelected.identity,
        currentConnection.config,
      ])
      if (
        hashSignature(currentSignature) !== candidate.authorizationKey ||
        this.analyticsLoader.getAnalytics(currentConnection.addonId) !==
          sources.get(candidate.connectionInstanceId)
      )
        continue
      stable.push(candidate)
    }

    return Either.success(stable)
  }

  private async resolveCurrent(
    workspaceId: string,
    connectionInstanceId: string,
  ): Promise<
    Either<AppError, { provider: IAnalyticsProvider; authorizationKey: string }>
  > {
    if (!workspaceId.trim())
      return Either.failure(AppError.ValidationError('WORKSPACE_ID_REQUIRED'))
    if (!connectionInstanceId.trim())
      return Either.failure(
        AppError.ValidationError('CONNECTION_INSTANCE_ID_REQUIRED'),
      )

    const workspace = await this.workspacesRepository.getById(workspaceId)
    if (workspace.isFailure()) return workspace.forwardFailure()
    if (!workspace.success)
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

    const connection = workspace.success.connections.find(
      (item) => item.id === connectionInstanceId,
    )
    if (!connection)
      return Either.failure(
        AppError.NotFound('CONEXAO_NAO_ENCONTRADA_OU_INVALIDA'),
      )

    const cacheKey = JSON.stringify([workspaceId, connectionInstanceId])

    if (connection.status !== 'connected') {
      this.cache.delete(cacheKey)
      return Either.failure(AppError.Unauthorized('CONNECTION_NOT_AUTHORIZED'))
    }

    const authorization = selectPrimaryAuthorization(connection)
    if (authorization.isFailure()) return authorization.forwardFailure()
    const selected = authorization.success
    const source = this.analyticsLoader.getAnalytics(connection.addonId)

    if (source === undefined) {
      this.cache.delete(cacheKey)
      return Either.failure(
        AppError.NotFound('ANALYTICS_PROVIDER_NOT_AVAILABLE'),
      )
    }

    const signature = JSON.stringify([
      connection.generation,
      selected.authorizationId,
      selected.generation,
      selected.credentialReferenceId,
      selected.identity,
      connection.config,
    ])
    const cached = this.cache.get(cacheKey)

    if (cached && cached.signature === signature && cached.source === source)
      return Either.success({
        provider: cached.provider,
        authorizationKey: hashSignature(signature),
      })

    if (selected.credentialReferenceId === undefined)
      return Either.failure(
        AppError.Unauthorized('CONNECTION_CREDENTIAL_REFERENCE_MISSING'),
      )

    const reference = CredentialReferenceFactory.fromId(
      selected.credentialReferenceId,
    )
    if (reference === undefined)
      return Either.failure(AppError.Internal('CORRUPTED_CREDENTIAL_REFERENCE'))

    const credential = await this.credentialsVault.getToken(
      reference.service,
      reference.account,
    )
    if (credential.kind === 'unavailable')
      return Either.failure(AppError.Internal('CREDENTIALS_VAULT_UNAVAILABLE'))
    if (credential.kind === 'absent')
      return Either.failure(
        AppError.Unauthorized('CONNECTION_CREDENTIAL_ABSENT'),
      )

    const payload = parseConnectionCredentialPayload(credential.token)
    if (payload.isFailure()) return payload.forwardFailure()

    const current = await this.workspacesRepository.getById(workspaceId)
    if (current.isFailure()) return current.forwardFailure()
    const currentConnection = current.success?.connections.find(
      (item) => item.id === connectionInstanceId,
    )

    if (
      !currentConnection ||
      currentConnection.status !== 'connected' ||
      currentConnection.generation !== connection.generation
    )
      return Either.failure(
        AppError.Unauthorized('CONNECTION_AUTHORIZATION_CHANGED'),
      )

    const currentAuthorization = selectPrimaryAuthorization(currentConnection)
    if (currentAuthorization.isFailure())
      return currentAuthorization.forwardFailure()

    if (
      currentAuthorization.success.authorizationId !==
        selected.authorizationId ||
      currentAuthorization.success.generation !== selected.generation ||
      this.analyticsLoader.getAnalytics(connection.addonId) !== source
    )
      return Either.failure(
        AppError.Unauthorized('CONNECTION_AUTHORIZATION_CHANGED'),
      )

    const context: AnalyticsProviderContext = {
      identity: selected.identity,
      config: connection.config,
      credentials: payload.success.credentials,
      httpClient: this.httpClientFactory.createClient({}),
      scope: { workspaceId, connectionInstanceId },
    }
    const provider = source.createInstance(context)
    this.cache.set(cacheKey, { signature, source, provider })

    return Either.success({
      provider,
      authorizationKey: hashSignature(signature),
    })
  }
}
