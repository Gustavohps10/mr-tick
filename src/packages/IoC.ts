import {
  IAddonPackageVerificationConfiguration,
  OfflineAuthorizationVerificationConfiguration,
  SignedAddonPackageVerifier,
} from '@mr-tick/adapters/auth'
import {
  Ed25519OfflineAuthorizationVerifier,
  JwtService,
} from '@mr-tick/adapters/auth'
import { IHttpClient, IHttpClientFactory } from '@mr-tick/adapters/contracts'
import {
  VaultAddonConsentRepository,
  VaultLicensingStateRepository,
} from '@mr-tick/adapters/data'
import { AddonsFacade } from '@mr-tick/adapters/facades'
import { LicensingApiConfiguration } from '@mr-tick/adapters/http'
import { LicensingHttpClient } from '@mr-tick/adapters/http'
import { FileManager, KeyedMutex } from '@mr-tick/adapters/tools'
import { AddonAccessService } from '@mr-tick/application'
import {
  AddonAuthenticatorRegistry,
  AddonConnectionProfilesResolver,
  ConnectAddonConnectionService,
  ConnectionLifecycleCoordinator,
  CreateWorkspaceService,
  DeleteWorkspaceService,
  DisconnectAddonConnectionService,
  GetCurrentUserService,
  GetMappingFieldsService,
  GetWorkspaceService,
  IAddonReloader,
  IConnectionLifecycleRepository,
  IConnectionLifecycleTransactionBoundary,
  IConnectionReservationRepository,
  ICredentialsVault,
  IDataSourceResolver,
  IFileStorage,
  ImportAddonService,
  IServiceProvider,
  IWorkspaceCredentialReferenceRegistry,
  IWorkspacesRepository,
  LicensingService,
  LinkConnectionService,
  ListTaskService,
  ListTimeEntriesService,
  ListWorkspacesService,
  MarkWorkspaceAsConfiguredService,
  MetadataPullService,
  OAuthAttemptCoordinator,
  TaskPullService,
  TimeEntriesPullService,
  TimeEntriesPushService,
  UnlinkConnectionService,
  UpdateAddonService,
  UpdateWorkspaceIdentityService,
} from '@mr-tick/application'
import { isRecord } from '@mr-tick/shared/helpers'
import {
  IEventEmitter,
  IJobEvents,
  ISystemEventEmitter,
} from '@mr-tick/shared/transport'
import {
  asClass,
  asValue,
  AwilixContainer,
  Constructor,
  createContainer,
  Lifetime,
  NameAndRegistrationPair,
} from 'awilix'

export class ServiceProvider implements IServiceProvider {
  private scopeCache = new Map<string, IServiceProvider>()

  constructor(private readonly container: AwilixContainer) {}

  resolve<T>(token: string): T {
    return this.container.resolve<T>(token)
  }

  createScope(scopeKey?: string): IServiceProvider {
    if (scopeKey && this.scopeCache.has(scopeKey)) {
      const cached = this.scopeCache.get(scopeKey)
      if (cached) return cached
    }

    const scoped = this.container.createScope()
    const scopedProvider = new ServiceProvider(scoped)

    if (scopeKey) {
      this.scopeCache.set(scopeKey, scopedProvider)
    }

    return scopedProvider
  }

  include<T>(deps: T): void {
    if (!isRecord(deps)) return
    for (const [key, value] of Object.entries(deps)) {
      this.container.register(key, asValue(value))
    }
  }
}

/**
 * Interface para as dependências de plataforma que são fornecidas externamente.
 * Ela define as implementações concretas que são fixas para a plataforma em execução.
 */
export interface PlatformDependencies {
  jobEmitter: IEventEmitter<IJobEvents>
  credentialsVault: ICredentialsVault
  workspacesRepository: IWorkspacesRepository
  lifecycleRepository: IConnectionLifecycleRepository
  reservationRepository: IConnectionReservationRepository
  credentialRegistry: IWorkspaceCredentialReferenceRegistry
  dataSourceResolver: IDataSourceResolver
  fileStorage: IFileStorage
  httpClient: IHttpClient
  httpClientFactory: IHttpClientFactory
  addonReloader: IAddonReloader
  transactionBoundary: IConnectionLifecycleTransactionBoundary
  systemEventEmitter: ISystemEventEmitter
}

/**
 * Implementação do Builder Pattern para configurar o contêiner Awilix de forma organizada.
 */
export interface PlatformSecurityDependencies {
  credentialsVault: ICredentialsVault
  fileStorage: IFileStorage
  licensingApiConfiguration: LicensingApiConfiguration
  offlineAuthorizationVerificationConfiguration: OfflineAuthorizationVerificationConfiguration
  addonPackageVerificationConfiguration: IAddonPackageVerificationConfiguration
}

export class ContainerBuilder {
  private readonly container: AwilixContainer

  constructor() {
    this.container = createContainer({
      injectionMode: 'CLASSIC',
    })
  }

  /**
   * Registra as dependências de plataforma (globais e singletons).
   * @param deps As instâncias das dependências de plataforma.
   * @returns A própria instância do builder para encadeamento.
   */
  public addSecurityDependencies(deps: PlatformSecurityDependencies): this {
    this.container.register({
      credentialsVault: asValue(deps.credentialsVault),
      fileStorage: asValue(deps.fileStorage),
      licensingApiConfiguration: asValue(deps.licensingApiConfiguration),
      offlineAuthorizationVerificationConfiguration: asValue(
        deps.offlineAuthorizationVerificationConfiguration,
      ),
      addonPackageVerificationConfiguration: asValue(
        deps.addonPackageVerificationConfiguration,
      ),
    })
    return this
  }

  public addPlatformDependencies(deps: PlatformDependencies): this {
    this.container.register({
      jobEmitter: asValue(deps.jobEmitter),
      credentialsVault: asValue(deps.credentialsVault),
      workspacesRepository: asValue(deps.workspacesRepository),
      lifecycleRepository: asValue(deps.lifecycleRepository),
      reservationRepository: asValue(deps.reservationRepository),
      credentialRegistry: asValue(deps.credentialRegistry),
      dataSourceResolver: asValue(deps.dataSourceResolver),
      fileStorage: asValue(deps.fileStorage),
      httpClient: asValue(deps.httpClient),
      httpClientFactory: asValue(deps.httpClientFactory),
      addonReloader: asValue(deps.addonReloader),
      transactionBoundary: asValue(deps.transactionBoundary),
      systemEventEmitter: asValue(deps.systemEventEmitter),
    })
    return this
  }

  /**
   * Registra os serviços da camada de aplicação.
   */
  public addApplicationServices(): this {
    this.container.register({
      listTasksService: asClass(ListTaskService).scoped(),
      taskPullService: asClass(TaskPullService).scoped(),
      listTimeEntriesService: asClass(ListTimeEntriesService).scoped(),
      getCurrentUserService: asClass(GetCurrentUserService).scoped(),
      createWorkspaceService: asClass(CreateWorkspaceService).scoped(),
      listWorkspacesService: asClass(ListWorkspacesService).scoped(),
      linkConnectionService: asClass(LinkConnectionService).scoped(),
      connectionLifecycleCoordinator: asClass(
        ConnectionLifecycleCoordinator,
      ).scoped(),
      unlinkConnectionService: asClass(UnlinkConnectionService).scoped(),
      authenticatorRegistry: asClass(AddonAuthenticatorRegistry).singleton(),
      profilesResolver: asClass(AddonConnectionProfilesResolver).singleton(),
      oauthAttemptCoordinator: asClass(OAuthAttemptCoordinator).singleton(),
      connectAddonConnectionService: asClass(
        ConnectAddonConnectionService,
      ).scoped(),
      markWorkspaceAsConfiguredService: asClass(
        MarkWorkspaceAsConfiguredService,
      ).scoped(),
      disconnectAddonConnectionService: asClass(
        DisconnectAddonConnectionService,
      ).scoped(),
      getMappingFieldsService: asClass(GetMappingFieldsService).scoped(),
      getWorkspaceService: asClass(GetWorkspaceService).scoped(),
      updateWorkspaceIdentityService: asClass(
        UpdateWorkspaceIdentityService,
      ).scoped(),
      deleteWorkspaceService: asClass(DeleteWorkspaceService).scoped(),
      licensingFacade: asClass(LicensingService).singleton(),
      addonAccessService: asClass(AddonAccessService).singleton(),
      importAddonService: asClass(ImportAddonService).scoped(),
      updateAddonService: asClass(UpdateAddonService).scoped(),
      timeEntriesPullService: asClass(TimeEntriesPullService).scoped(),
      timeEntriesPushService: asClass(TimeEntriesPushService).scoped(),
      metadataPullService: asClass(MetadataPullService).scoped(),
    })
    return this
  }

  /**
   * Registra as dependências da camada de infraestrutura.
   */
  public addInfrastructure(): this {
    this.container.register({
      jwtService: asClass(JwtService).scoped(),
      fileManager: asClass(FileManager).scoped(),
      offlineAuthorizationVerifier: asClass(
        Ed25519OfflineAuthorizationVerifier,
      ).singleton(),
      licensingApiClient: asClass(LicensingHttpClient).singleton(),
      licensingStateRepository: asClass(
        VaultLicensingStateRepository,
      ).singleton(),
      addonConsentRepository: asClass(VaultAddonConsentRepository).singleton(),
      addonPackageVerifier: asClass(SignedAddonPackageVerifier).singleton(),
      addonsFacade: asClass(AddonsFacade).scoped(),
      keyedMutex: asClass(KeyedMutex).singleton(),
    })
    return this
  }

  /**
   * Registra um dicionário genérico de dependências.
   * Este método permite agrupar e registrar qualquer conjunto de resolvers, como Handlers ou outros módulos.
   * @param module Um objeto contendo os resolvers para o módulo de dependências.
   * @returns A própria instância do builder para encadeamento.
   */
  public addScoped<T extends Record<string, Constructor<object>>>(
    module: T,
  ): this {
    const registrations: NameAndRegistrationPair<Record<string, object>> = {}

    for (const key of Object.keys(module)) {
      const ClassRef = module[key]
      if (ClassRef) {
        registrations[key] = asClass(ClassRef).scoped()
      }
    }

    this.container.register(registrations)
    return this
  }

  public addFromPath(pathOrFile: string): this {
    let normalizedPath = `${pathOrFile}/*`
    if (pathOrFile.endsWith('.ts') || pathOrFile.endsWith('.js')) {
      normalizedPath = pathOrFile.replace(/[^/\\]+$/, '*')
    }
    if (pathOrFile.endsWith('/')) {
      normalizedPath = `${pathOrFile}*`
    }

    normalizedPath = normalizedPath.replace('*', '{!index,*}')

    this.container.loadModules([normalizedPath], {
      formatName: 'camelCase',
      resolverOptions: {
        lifetime: Lifetime.SCOPED,
      },
    })

    return this
  }

  /**
   * Finaliza a construção e retorna o contêiner configurado.
   */
  public build(): IServiceProvider {
    const serviceProvider = new ServiceProvider(this.container)

    this.container.register({
      serviceProvider: asValue(serviceProvider),
    })

    console.log(
      '✅ [IoC] Container principal construído e dependências registradas.',
    )
    return serviceProvider
  }
}
