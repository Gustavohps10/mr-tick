import {
  type AuthenticatedMember,
  CredentialReferenceFactory,
  DataSourceContext,
  DataSourceOverrideContext,
  ICredentialsVault,
  IDataSourceAdapter,
  IDataSourceOAuthAPI,
  IDataSourceResolver,
  IHttpClientFactory,
  IWorkspacesRepository,
  ResolvedConnection,
} from '@mr-tick/application'
import {
  type ConnectionAuthorizationRecord,
  type ConnectionIdentity,
  type DataSourceConnection,
} from '@mr-tick/domain'
import { AppError, Either, type IDataSource } from '@mr-tick/sdk'
import { isNonEmptyString } from '@mr-tick/shared/helpers'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

import {
  parseConnectionCredentialPayload,
  type StoredConnectionCredentialPayload,
} from '@/main/utils/credentialPayload'

export interface IAddonDataSourceLoader {
  getDataSource(dataSourceId: string): IDataSource | undefined
  createOAuthAPI?(dataSourceId: string): IDataSourceOAuthAPI | undefined
}

export interface DataSourceResolverOptions {
  addonsBasePath: string
  isDevelopment?: boolean
  addonLoader?: IAddonDataSourceLoader
}

export class DataSourceResolver implements IDataSourceResolver {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly credentialsVault: ICredentialsVault,
    private readonly options: DataSourceResolverOptions,
    private readonly httpClientFactory: IHttpClientFactory,
  ) {}

  async getDataSource(
    workspaceId: string,
    connectionInstanceId: string,
    contextOverride?: Partial<DataSourceOverrideContext>,
  ): Promise<Either<AppError, IDataSourceAdapter>> {
    if (!isNonEmptyString(workspaceId)) {
      return Either.failure(AppError.ValidationError('WORKSPACE_ID_REQUIRED'))
    }
    if (!isNonEmptyString(connectionInstanceId)) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_INSTANCE_ID_REQUIRED'),
      )
    }
    const workspaceResult = await this.workspacesRepository.getById(workspaceId)
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (!workspace)
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

    const connection = workspace.connections?.find(
      (c) => c.id === connectionInstanceId,
    )

    const connectionHttpClient = this.httpClientFactory.createClient({})

    let config: Record<string, string | number | boolean> = {}
    if (connection?.config) {
      config = connection.config
    }

    let context: DataSourceContext = {
      authenticatedMemberData: undefined,
      config,
      credentials: undefined,
      httpClient: connectionHttpClient,
      scope: {
        workspaceId,
        connectionInstanceId,
      },
    }
    let authorizedConnectionGeneration: number | undefined = undefined
    let authorizedAuthorizationGeneration: number | undefined = undefined
    let authorizedAuthorizationId: string | undefined = undefined

    if (contextOverride) {
      let overrideConfig = config
      if (contextOverride.config) {
        overrideConfig = contextOverride.config
      }
      let resolvedScope = {
        workspaceId,
        connectionInstanceId,
      }
      if (contextOverride.scope) {
        resolvedScope = contextOverride.scope
      }
      context = {
        authenticatedMemberData: contextOverride.authenticatedMemberData,
        config: overrideConfig,
        credentials: contextOverride.credentials,
        httpClient: connectionHttpClient,
        scope: resolvedScope,
      }
    }

    if (!contextOverride) {
      if (!connection)
        return Either.failure(
          AppError.NotFound('CONEXAO_NAO_ENCONTRADA_OU_INVALIDA'),
        )
      if (connection.status !== 'connected')
        return Either.failure(
          AppError.Unauthorized('CONNECTION_NOT_AUTHORIZED'),
        )
      const authorization = selectDataSourceAuthorization(connection)
      if (authorization.isFailure()) return authorization.forwardFailure()
      const selected = authorization.success
      if (selected.credentialReferenceId === undefined)
        return Either.failure(
          AppError.Unauthorized('CONNECTION_CREDENTIAL_REFERENCE_MISSING'),
        )
      const credentialReference = CredentialReferenceFactory.fromId(
        selected.credentialReferenceId,
      )
      if (credentialReference === undefined)
        return Either.failure(
          AppError.Internal('CORRUPTED_CREDENTIAL_REFERENCE'),
        )
      authorizedAuthorizationId = selected.authorizationId
      authorizedAuthorizationGeneration = selected.generation
      authorizedConnectionGeneration = connection.generation
      const credentialRead = await this.credentialsVault.getToken(
        credentialReference.service,
        credentialReference.account,
      )
      if (credentialRead.kind === 'unavailable')
        return Either.failure(
          AppError.Internal('CREDENTIALS_VAULT_UNAVAILABLE'),
        )
      if (credentialRead.kind === 'absent')
        return Either.failure(
          AppError.Unauthorized('CONNECTION_CREDENTIAL_ABSENT'),
        )
      let parsed: StoredConnectionCredentialPayload | undefined
      if (credentialRead.kind === 'present') {
        const payload = parseConnectionCredentialPayload(credentialRead.token)
        if (payload.isFailure()) return payload.forwardFailure()
        parsed = payload.success
      }

      const authenticatedMemberData = adaptIdentityToMember(selected.identity)

      context = {
        authenticatedMemberData,
        config,
        credentials: parsed?.credentials,
        httpClient: connectionHttpClient,
        scope: {
          workspaceId,
          connectionInstanceId,
        },
      }
    }

    if (!connection)
      return Either.failure(
        AppError.NotFound('CONEXAO_NAO_ENCONTRADA_OU_INVALIDA'),
      )

    let oauth: IDataSourceOAuthAPI | undefined = undefined
    if (this.options.addonLoader?.createOAuthAPI) {
      oauth = this.options.addonLoader.createOAuthAPI(connection.addonId)
    }
    if (oauth && !context.oauth) {
      context = {
        ...context,
        oauth,
      }
    }

    let datasource: IDataSource
    try {
      datasource = await this.loadModule(connection.addonId)
    } catch (err) {
      console.error(
        `[DataSourceResolver] Erro ao carregar módulo do datasource ${connection.addonId}:`,
        err,
      )
      return Either.failure(AppError.Internal('DATASOURCE_LOAD_FAILED'))
    }
    if (!contextOverride) {
      const currentWorkspaceResult =
        await this.workspacesRepository.getById(workspaceId)
      if (currentWorkspaceResult.isFailure())
        return currentWorkspaceResult.forwardFailure()
      const currentWorkspace = currentWorkspaceResult.success
      const currentConnection = currentWorkspace?.connections.find(
        (item) => item.id === connectionInstanceId,
      )
      if (
        !currentConnection ||
        currentConnection.status !== 'connected' ||
        currentConnection.generation !== authorizedConnectionGeneration
      )
        return Either.failure(
          AppError.Unauthorized('CONNECTION_AUTHORIZATION_CHANGED'),
        )
      const currentAuthorization =
        selectDataSourceAuthorization(currentConnection)
      if (
        currentAuthorization.isFailure() ||
        currentAuthorization.success.authorizationId !==
          authorizedAuthorizationId ||
        currentAuthorization.success.generation !==
          authorizedAuthorizationGeneration
      )
        return Either.failure(
          AppError.Unauthorized('CONNECTION_AUTHORIZATION_CHANGED'),
        )
    }
    const instance = datasource.createInstance(context)

    return Either.success({
      getAuthenticatedMemberData: () => {
        if (!context.authenticatedMemberData)
          return Either.failure(
            AppError.Unauthorized('CONNECTION_MEMBER_UNAVAILABLE'),
          )

        return Either.success(context.authenticatedMemberData)
      },
      id: connectionInstanceId,
      tasksProvider: instance.tasksProvider,
      timeEntriesProvider: instance.timeEntriesProvider,
      membersProvider: instance.membersProvider,
      metadataProvider: instance.metadataProvider,
    })
  }

  async getDataSourcesForWorkspace(
    workspaceId: string,
  ): Promise<Either<AppError, ResolvedConnection[]>> {
    const workspaceResult = await this.workspacesRepository.getById(workspaceId)
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (!workspace) return Either.success([])

    return Either.success(
      workspace.connections.map((c) => ({
        id: c.id,
        dataSourceId: c.addonId,
        config: c.config,
      })),
    )
  }

  private async loadModule(pluginId: string): Promise<IDataSource> {
    const registeredDs = this.options.addonLoader?.getDataSource(pluginId)
    if (registeredDs) {
      return registeredDs
    }

    const addonPath = resolve(this.options.addonsBasePath, pluginId, 'index.js')

    if (!existsSync(addonPath)) {
      throw new Error(`Datasource não encontrado: ${pluginId}.`)
    }

    const addonURL = pathToFileURL(addonPath).href
    const datasourceModule = await import(addonURL)
    const defaultExport = datasourceModule?.default

    if (
      !defaultExport ||
      typeof defaultExport !== 'object' ||
      !isDataSource(defaultExport)
    ) {
      throw new Error(`Datasource inválido ou corrompido em ${addonPath}`)
    }

    return defaultExport
  }
}

function isDataSource(candidate: object): candidate is IDataSource {
  return 'createInstance' in candidate
}

const DATA_SOURCE_AUTHORIZATION_ROLE = 'primary'

function selectDataSourceAuthorization(
  connection: DataSourceConnection,
): Either<AppError, ConnectionAuthorizationRecord> {
  const active = connection.authorizations.filter(
    (candidate) =>
      candidate.authorizationRole === DATA_SOURCE_AUTHORIZATION_ROLE &&
      candidate.status === 'active',
  )
  if (active.length > 1)
    return Either.failure(
      AppError.Unauthorized('CONNECTION_AUTHORIZATION_AMBIGUOUS'),
    )
  const [selected] = active
  if (selected === undefined)
    return Either.failure(
      AppError.Unauthorized('CONNECTION_AUTHORIZATION_MISSING'),
    )
  return Either.success(selected)
}

function adaptIdentityToMember(
  identity: ConnectionIdentity,
): AuthenticatedMember {
  return {
    id: identity.providerSubjectId,
    firstname: identity.displayName,
    lastname: '',
  }
}
