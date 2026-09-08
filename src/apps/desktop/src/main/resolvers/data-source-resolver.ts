import {
  DataSourceContext,
  ICredentialsStorage,
  IDataSourceAdapter,
  IDataSourceResolver,
  IHttpClient,
  IWorkspacesRepository,
  ResolvedConnection,
} from '@mr-tick/application'
import {
  AddonSettingsGroup,
  AppError,
  Either,
  type IDataSource,
} from '@mr-tick/sdk'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

import { AddonLoader } from '@/main/services/AddonLoader'

export interface DataSourceResolverOptions {
  addonsBasePath: string
  isDevelopment?: boolean
  addonLoader?: AddonLoader
}

export class DataSourceResolver implements IDataSourceResolver {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly credentialsStorage: ICredentialsStorage,
    private readonly options: DataSourceResolverOptions,
    private readonly httpClient: IHttpClient,
  ) {}

  async getDataSource(
    workspaceId: string,
    connectionInstanceId: string,
    contextOverride?: Partial<DataSourceContext>,
  ): Promise<IDataSourceAdapter> {
    const workspace = await this.workspacesRepository.findById(workspaceId)
    if (!workspace) {
      throw new Error(`Workspace não encontrado: ${workspaceId}`)
    }

    const connection = workspace.dataSourceConnections?.find(
      (c) => c.id === connectionInstanceId,
    )

    const config = connection?.config ?? {}
    let context: DataSourceContext = {
      authenticatedMemberData: undefined,
      config,
      credentials: undefined,
      httpClient: this.httpClient,
    }

    if (contextOverride) {
      context = {
        authenticatedMemberData: contextOverride.authenticatedMemberData,
        config: contextOverride.config ?? config,
        credentials: contextOverride.credentials,
        httpClient: contextOverride.httpClient ?? this.httpClient,
      }
    }

    if (!contextOverride) {
      const storageKey = `workspace-connection-${workspaceId}-${connectionInstanceId}`
      const credentialsSerialized = await this.credentialsStorage.getToken(
        'mr-tick',
        storageKey,
      )

      const parsed = credentialsSerialized
        ? JSON.parse(credentialsSerialized)
        : undefined

      context = {
        authenticatedMemberData: parsed?.member,
        config,
        credentials: parsed?.credentials,
        httpClient: this.httpClient,
      }
    }

    if (!connection) throw new Error(`Conexao invalida`)

    const datasource = await this.loadModule(connection.dataSourceId)

    return {
      getAuthenticatedMemberData: () => {
        if (!context.authenticatedMemberData)
          return Either.failure(
            AppError.ValidationError(
              'NAO FOI POSSIVEL OBTER DADOS DO USUARIO AUTENTICADO',
            ),
          )

        return Either.success(context.authenticatedMemberData)
      },
      id: connectionInstanceId,
      authenticationStrategy: datasource.getAuthenticationStrategy(context),
      memberQuery: datasource.getMemberQuery(context),
      taskQuery: datasource.getTaskQuery(context),
      taskRepository: datasource.getTaskRepository(context),
      timeEntryQuery: datasource.getTimeEntryQuery(context),
      timeEntryRepository: datasource.getTimeEntryRepository(context),
      metadataQuery: datasource.getMetadataQuery(context),
    }
  }

  async getDataSourcesForWorkspace(
    workspaceId: string,
  ): Promise<ResolvedConnection[]> {
    const workspace = await this.workspacesRepository.findById(workspaceId)
    if (!workspace) return []

    return workspace.dataSourceConnections.map((c) => ({
      id: c.id,
      dataSourceId: c.dataSourceId,
      config: c.config,
    }))
  }

  async getConfigFields(pluginId: string): Promise<{
    credentials: AddonSettingsGroup[]
    configuration: AddonSettingsGroup[]
  }> {
    const mod = await this.loadModule(pluginId)
    return mod.configFields
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
  return (
    'getTaskQuery' in candidate &&
    'getMemberQuery' in candidate &&
    'getTimeEntryQuery' in candidate &&
    'getMetadataQuery' in candidate
  )
}
