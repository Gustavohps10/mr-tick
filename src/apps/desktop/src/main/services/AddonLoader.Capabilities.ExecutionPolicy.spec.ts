import {
  AddonAuthenticatorRegistry,
  AddonConnectionProfilesResolver,
  CoreConnection,
  CreatedTaskResult,
  CreatedTimeEntryResult,
  CredentialReferenceFactory,
  GetMappingFieldsService,
  ICoreAddonCapabilities,
  IDisconnectAddonConnectionUseCase,
  MappingFieldDefinition,
  OAuthAttemptCoordinator,
  PagedResultDTO,
  TaskDTO,
  TimeEntryDTO,
  TimeEntryPullPageDTO,
  UpdatedTaskResult,
  UpdatedTimeEntryResult,
} from '@mr-tick/application'
import { Workspace } from '@mr-tick/domain'
import { IAddon, IAddonManifest } from '@mr-tick/sdk'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { describe, expect, it, vi } from 'vitest'

import { DataSourceResolver } from '@/main/resolvers/data-source-resolver'

import { unavailableCore } from './addon-core-test-fixture'
import { emptyAddonCredentialsVault } from './addon-workspace-reference-test-fixture'
import { AddonCoreCapabilities } from './AddonCoreCapabilities'
import {
  createLoader,
  fakeHttpClient,
  fakeMembersProvider,
  fakeMetadataProvider,
  fakeTasksProvider,
  fakeTimeEntriesProvider,
} from './AddonLoader.Capabilities.fixture'

describe('AddonLoader - Capabilities & Granular Lifetime - Execution Policy & Providers', () => {
  describe('Concurrent Instances for Same Connection & Protected Providers', () => {
    it('keeps multiple instances of the same connection simultaneously valid and classifies static vs remote mapping fields via resolver/usecase', async () => {
      const loader = createLoader()
      const dsManifest: IAddonManifest = {
        id: 'test-concurrent-instances',
        name: 'Concurrent Addon',
        version: '1.0.0',
        categories: ['dataSource'],
        author: 'Test',
        shortDescription: 'Desc',
        description: 'Long desc',
        capabilities: [
          {
            capabilityId: 'ds-concurrent',
            kind: 'dataSource',
            contractVersion: '1.0.0',
            executionPolicy: { kind: 'independent' },
            authRequirement: { kind: 'none' },
            supportedOperations: ['read', 'write', 'getMappingFields'],
            required: true,
          },
        ],
      }

      const staticFields: MappingFieldDefinition[] = [
        { id: 'static-1', name: 'Static Field', category: 'status' },
      ]
      const remoteFields: MappingFieldDefinition[] = [
        { id: 'remote-1', name: 'Remote Field', category: 'tracker' },
      ]

      const mockAddon: IAddon = {
        activate: (context) => {
          context.contributions.dataSources.register({
            getConnectionProfiles: () => [
              {
                connectionProfileId: 'prof-c',
                cardinality: 'multi',
                default: true,
              },
            ],
            getConnectionSchema: () => [],
            getStaticMappingFields: () => staticFields,
            getMappingFields: async (scope) =>
              Either.success<MappingFieldDefinition[], AppError>([
                {
                  id: `scoped-${scope.workspaceId}-${scope.connectionInstanceId}`,
                  name: 'Scoped Field',
                  category: 'activity',
                },
              ]),
            createInstance: () => ({
              tasksProvider: {
                pull: async () => Either.success<TaskDTO[], AppError>([]),
                findAll: async () =>
                  Either.success<PagedResultDTO<TaskDTO>, AppError>({
                    items: [],
                    total: 0,
                    page: 1,
                    pageSize: 10,
                  }),
                findById: async () =>
                  Either.success<TaskDTO | null, AppError>(null),
                create: async () =>
                  Either.success<CreatedTaskResult, AppError>({ id: 't-1' }),
                update: async () =>
                  Either.success<UpdatedTaskResult, AppError>({ id: 't-1' }),
                delete: async () => Either.success<void, AppError>(undefined),
              },
              timeEntriesProvider: fakeTimeEntriesProvider,
              membersProvider: fakeMembersProvider,
              metadataProvider: {
                ...fakeMetadataProvider,
                getMappingFields: async () =>
                  Either.success<MappingFieldDefinition[], AppError>(
                    remoteFields,
                  ),
              },
            }),
          })
        },
        deactivate: vi.fn(),
      }

      await loader.activateAddon(
        'test-concurrent-instances',
        mockAddon,
        dsManifest,
      )
      const ds = loader.dataSourceRegistry
        .getItems()
        .find((item) => item.id === 'test-concurrent-instances')
      expect(ds).toBeDefined()
      if (!ds) return

      const invalidScopeInstance = ds.createInstance({
        httpClient: fakeHttpClient,
        scope: { workspaceId: '', connectionInstanceId: '' },
      })
      const invalidScopeRes = await invalidScopeInstance.tasksProvider.findAll()
      expect(invalidScopeRes.isFailure()).toBe(true)
      if (invalidScopeRes.isFailure()) {
        expect(invalidScopeRes.failure.messageKey).toBe(
          'CONNECTION_SCOPE_REQUIRED',
        )
      }

      const instanceA = ds.createInstance({
        httpClient: fakeHttpClient,
        scope: { workspaceId: 'ws-c', connectionInstanceId: 'conn-c' },
      })
      const instanceB = ds.createInstance({
        httpClient: fakeHttpClient,
        scope: { workspaceId: 'ws-c', connectionInstanceId: 'conn-c' },
      })

      const [resA, resB] = await Promise.all([
        instanceA.tasksProvider.findAll(),
        instanceB.tasksProvider.findAll(),
      ])
      expect(resA.isSuccess()).toBe(true)
      expect(resB.isSuccess()).toBe(true)

      const userRes = await instanceA.membersProvider.getCurrentUser()
      expect(userRes.isSuccess()).toBe(true)

      const metaRes = await instanceA.metadataProvider.getMetadata(
        'user-1',
        { updatedAt: new Date(), id: 'chk-1' },
        10,
      )
      expect(metaRes.isSuccess()).toBe(true)

      expect(ds.getStaticMappingFields?.()).toEqual(staticFields)

      if (ds.getMappingFields) {
        const emptyScopeMapping = await ds.getMappingFields({
          workspaceId: '',
          connectionInstanceId: '',
        })
        expect(emptyScopeMapping.isFailure()).toBe(true)

        const mappingRes = await ds.getMappingFields({
          workspaceId: 'ws-c',
          connectionInstanceId: 'conn-c',
        })
        expect(mappingRes.isSuccess()).toBe(true)
        if (mappingRes.isSuccess()) {
          expect(mappingRes.success[0]?.id).toBe('scoped-ws-c-conn-c')
        }
      }

      const wsCreate = Workspace.create({ name: 'WS Concurrent' })
      expect(wsCreate.isSuccess()).toBe(true)
      if (wsCreate.isFailure()) return
      const ws = wsCreate.success
      ws.createConnection('conn-c', 'test-concurrent-instances', {
        connectionProfileId: 'prof-c',
        cardinality: 'multi',
        default: true,
        roles: [
          {
            authorizationRole: 'primary',
            allowedAuthProfileIds: ['auth-c'],
            defaultAuthProfileId: 'auth-c',
          },
        ],
      })
      const credRef = CredentialReferenceFactory.create({
        ownerId: 'test-concurrent-instances',
        workspaceId: ws.id,
        connectionId: 'conn-c',
        authorizationId: 'auth-rec-c',
      })
      ws.connectAuthorization(
        'conn-c',
        {
          authorizationId: 'auth-rec-c',
          authorizationRole: 'primary',
          authProfileId: 'auth-c',
          credentialReferenceId: credRef.id,
          identity: {
            kind: 'human',
            providerId: 'test',
            tenantId: 'tenant',
            providerSubjectId: 'sub-1',
            displayName: 'User C',
          },
        },
        {},
      )

      const resolver = new DataSourceResolver(
        {
          create: async () => Either.success(),
          getById: async (id) =>
            id === ws.id ? Either.success(ws) : Either.success(undefined),
          list: async () =>
            Either.success({ items: [ws], total: 1, page: 1, pageSize: 10 }),
          update: async () => Either.success(),
          remove: async () => Either.success(),
        },
        {
          ...emptyAddonCredentialsVault(),
          getToken: async () => ({
            kind: 'present',
            token: JSON.stringify({ apiKey: 'k' }),
          }),
        },
        { addonsBasePath: '', addonLoader: loader },
        { createClient: () => fakeHttpClient },
      )
      const getMappingFieldsUseCase = new GetMappingFieldsService(resolver)

      const invalidUseCaseRes = await getMappingFieldsUseCase.execute({
        workspaceId: '',
        connectionInstanceId: 'conn-c',
      })
      expect(invalidUseCaseRes.isFailure()).toBe(true)

      const useCaseRes = await getMappingFieldsUseCase.execute({
        workspaceId: ws.id,
        connectionInstanceId: 'conn-c',
      })
      expect(useCaseRes.isSuccess()).toBe(true)
      if (useCaseRes.isSuccess()) {
        expect(useCaseRes.success).toEqual(remoteFields)
      }

      loader.systemEventEmitter.emit('connection:disconnected', {
        workspaceId: 'ws-c',
        connectionInstanceId: 'conn-c',
      })

      const afterA = await instanceA.tasksProvider.findAll()
      const afterB = await instanceB.tasksProvider.findAll()
      expect(afterA.isFailure()).toBe(true)
      expect(afterB.isFailure()).toBe(true)

      const afterUser = await instanceA.membersProvider.getCurrentUser()
      expect(afterUser.isFailure()).toBe(true)

      const afterMeta = await instanceA.metadataProvider.getMetadata(
        'user-1',
        { updatedAt: new Date(), id: 'chk-1' },
        10,
      )
      expect(afterMeta.isFailure()).toBe(true)

      if (ds.getMappingFields) {
        const afterMapping = await ds.getMappingFields({
          workspaceId: 'ws-c',
          connectionInstanceId: 'conn-c',
        })
        expect(afterMapping.isFailure()).toBe(true)
      }
    })
  })

  describe('GuardedTimeEntryProvider Optional Methods Preservation', () => {
    it('preserves absence of optional methods when inner provider does not support them', async () => {
      const loader = createLoader()
      const dsManifest: IAddonManifest = {
        id: 'test-optional-methods',
        name: 'Optional Methods Addon',
        version: '1.0.0',
        categories: ['dataSource'],
        author: 'Test',
        shortDescription: 'Desc',
        description: 'Long desc',
        capabilities: [
          {
            capabilityId: 'ds-opt',
            kind: 'dataSource',
            contractVersion: '1.0.0',
            executionPolicy: { kind: 'independent' },
            authRequirement: { kind: 'none' },
            supportedOperations: ['read', 'write'],
            required: true,
          },
        ],
      }
      const mockAddon: IAddon = {
        activate: (context) => {
          context.contributions.dataSources.register({
            getConnectionProfiles: () => [],
            getConnectionSchema: () => [],
            createInstance: () => ({
              tasksProvider: {
                pull: async () => Either.success<TaskDTO[], AppError>([]),
                findAll: async () =>
                  Either.success<PagedResultDTO<TaskDTO>, AppError>({
                    items: [],
                    total: 0,
                    page: 1,
                    pageSize: 10,
                  }),
                findById: async () =>
                  Either.success<TaskDTO | null, AppError>(null),
                create: async () =>
                  Either.success<CreatedTaskResult, AppError>({ id: 't-1' }),
                update: async () =>
                  Either.success<UpdatedTaskResult, AppError>({ id: 't-1' }),
                delete: async () => Either.success<void, AppError>(undefined),
              },
              timeEntriesProvider: {
                pull: async () =>
                  Either.success<TimeEntryPullPageDTO, AppError>({
                    items: [],
                    checkpoint: { updatedAt: new Date(), id: '0' },
                    snapshotId: 'snap-opt',
                    hasMore: false,
                  }),
                findByMemberId: async () =>
                  Either.success<PagedResultDTO<TimeEntryDTO>, AppError>({
                    items: [],
                    total: 0,
                    page: 1,
                    pageSize: 10,
                  }),
                findAll: async () =>
                  Either.success<PagedResultDTO<TimeEntryDTO>, AppError>({
                    items: [],
                    total: 0,
                    page: 1,
                    pageSize: 10,
                  }),
                findById: async () =>
                  Either.success<TimeEntryDTO | null, AppError>(null),
                create: async () =>
                  Either.success<CreatedTimeEntryResult, AppError>({
                    id: 'te-1',
                  }),
                update: async () =>
                  Either.success<UpdatedTimeEntryResult, AppError>({
                    id: 'te-1',
                  }),
                delete: async () => Either.success<void, AppError>(undefined),
              },
              membersProvider: fakeMembersProvider,
              metadataProvider: fakeMetadataProvider,
            }),
          })
        },
        deactivate: vi.fn(),
      }

      await loader.activateAddon('test-optional-methods', mockAddon, dsManifest)
      const ds = loader.dataSourceRegistry
        .getItems()
        .find((item) => item.id === 'test-optional-methods')
      expect(ds).toBeDefined()
      if (!ds) return

      const instance = ds.createInstance({
        httpClient: fakeHttpClient,
        scope: { workspaceId: 'ws-opt', connectionInstanceId: 'conn-opt' },
      })

      expect(instance.timeEntriesProvider.findByCorrelation).toBeUndefined()
      expect(instance.timeEntriesProvider.updateConditional).toBeUndefined()
      expect('findByCorrelation' in instance.timeEntriesProvider).toBe(false)
      expect('updateConditional' in instance.timeEntriesProvider).toBe(false)
    })
  })

  describe('ExecutionPolicy, Settings Reapply & Real Event Flow to Loader', () => {
    it('isolates capabilities on the same addon and connection: workspace switch stops only activeWorkspace capability while independent capability in-flight operation succeeds', async () => {
      const loader = createLoader()

      let releaseIndependent: () => void = () => {}
      const independentGate = new Promise<void>((resolve) => {
        releaseIndependent = resolve
      })
      let markIndependentEntered: () => void = () => {}
      const independentEntered = new Promise<void>((resolve) => {
        markIndependentEntered = resolve
      })

      let releaseWatcher: () => void = () => {}
      const watcherGate = new Promise<void>((resolve) => {
        releaseWatcher = resolve
      })
      let markWatcherEntered: () => void = () => {}
      const watcherEntered = new Promise<void>((resolve) => {
        markWatcherEntered = resolve
      })

      await loader.activateAddon(
        'hybrid-addon',
        {
          activate: (context) => {
            context.contributions.dataSources.register({
              getConnectionProfiles: () => [],
              getConnectionSchema: () => [],
              createInstance: () => ({
                tasksProvider: {
                  ...fakeTasksProvider,
                  findAll: async () => {
                    markIndependentEntered()
                    await independentGate
                    return Either.success<PagedResultDTO<TaskDTO>, AppError>({
                      items: [
                        {
                          id: 'task-ind-1',
                          title: 'Independent Task',
                          status: { id: 'open', name: 'Open' },
                          createdAt: new Date(),
                          updatedAt: new Date(),
                        },
                      ],
                      total: 1,
                      page: 1,
                      pageSize: 10,
                    })
                  },
                },
                timeEntriesProvider: fakeTimeEntriesProvider,
                membersProvider: fakeMembersProvider,
                metadataProvider: fakeMetadataProvider,
              }),
            })
          },
          deactivate: vi.fn(),
        },
        {
          id: 'hybrid-addon',
          name: 'Hybrid Addon',
          version: '1.0.0',
          categories: ['watcher', 'dataSource'],
          author: 'Test',
          shortDescription: 'Desc',
          description: 'Long desc',
          capabilities: [
            {
              capabilityId: 'voice-watcher',
              kind: 'watcher',
              contractVersion: '1.0.0',
              executionPolicy: {
                kind: 'activeWorkspace',
                exclusivity: 'exclusiveSocket',
              },
              authRequirement: {
                kind: 'required',
                connectionProfileId: 'hybrid-prof',
                authorizationRole: 'primary',
              },
              supportedOperations: ['read', 'write'],
              required: true,
              settingsSchemaScope: 'capability',
            },
            {
              capabilityId: 'ds-main',
              kind: 'dataSource',
              contractVersion: '1.0.0',
              executionPolicy: { kind: 'independent' },
              authRequirement: {
                kind: 'required',
                connectionProfileId: 'hybrid-prof',
                authorizationRole: 'primary',
              },
              supportedOperations: ['read', 'write'],
              required: true,
            },
          ],
        },
      )

      loader.setActiveWorkspace('ws-1')

      const watcherBindingWs1 = loader.getAddonBindingLifetime(
        'hybrid-addon',
        'ws-1',
        'conn-1',
        'voice-watcher',
      )
      const dsBindingWs1 = loader.getAddonBindingLifetime(
        'hybrid-addon',
        'ws-1',
        'conn-1',
        'ds-main',
      )
      expect(watcherBindingWs1).toBeDefined()
      expect(dsBindingWs1).toBeDefined()
      if (!watcherBindingWs1 || !dsBindingWs1) return

      expect(watcherBindingWs1.isActive()).toBe(true)
      expect(dsBindingWs1.isActive()).toBe(true)

      const ds = loader.dataSourceRegistry
        .getItems()
        .find((item) => item.id === 'hybrid-addon')
      expect(ds).toBeDefined()
      if (!ds) return

      const dsInstance = ds.createInstance({
        httpClient: fakeHttpClient,
        scope: { workspaceId: 'ws-1', connectionInstanceId: 'conn-1' },
      })

      const inFlightIndependent = dsInstance.tasksProvider.findAll()
      const inFlightWatcher = watcherBindingWs1.guardAsync(async () => {
        markWatcherEntered()
        await watcherGate
        return 'watcher-late-result'
      })

      await independentEntered
      await watcherEntered

      loader.setActiveWorkspace('ws-2')

      // activeWorkspace capability on ws-1 is stopped (not resuscitated with startNextGeneration)
      expect(watcherBindingWs1.isActive()).toBe(false)
      expect(watcherBindingWs1.getGeneration()).toBe(1)
      // independent capability on the SAME addon and SAME connection remains active
      expect(dsBindingWs1.isActive()).toBe(true)
      expect(dsBindingWs1.getGeneration()).toBe(1)

      releaseWatcher()
      releaseIndependent()

      const watcherOutcome = await inFlightWatcher
      const independentOutcome = await inFlightIndependent

      expect(watcherOutcome).toBeUndefined()
      expect(independentOutcome.isSuccess()).toBe(true)
      if (independentOutcome.isSuccess()) {
        expect(independentOutcome.success.items).toHaveLength(1)
      }

      // Disconnecting the connection stops ALL bindings for (ws-1, conn-1)
      loader.systemEventEmitter.emit('connection:disconnected', {
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
      })
      expect(dsBindingWs1.isActive()).toBe(false)
      const afterDisconnect = await dsInstance.tasksProvider.findAll()
      expect(afterDisconnect.isFailure()).toBe(true)
    })

    it('reapplies settings functionally via onApply with a single active subscription, preserves neighbor capability, rejects failed apply without marking applied, and handles 207 partial credential failure', async () => {
      const mockConnections: CoreConnection[] = [
        {
          workspaceId: 'ws-1',
          connectionInstanceId: 'conn-1',
          addonId: 'reapply-addon',
          connectionProfileId: 'reapply-prof',
          cardinality: 'single',
          status: 'connected',
          identity: null,
        },
      ]
      const customCore: ICoreAddonCapabilities = {
        ...unavailableCore,
        connections: {
          ...unavailableCore.connections,
          list: async () => Either.success(mockConnections),
          get: async () => Either.success(mockConnections[0]!),
        },
      }

      let failVaultWrite = false
      const baseVault = emptyAddonCredentialsVault()
      const customVault: ReturnType<typeof emptyAddonCredentialsVault> = {
        ...baseVault,
        writeCredential: async (reference, secret) => {
          if (failVaultWrite) {
            return { kind: 'unavailable' }
          }
          return baseVault.writeCredential(reference, secret)
        },
      }

      const loader = createLoader(() => customCore, customVault)

      let shouldFailApply = false
      const executedValues: boolean[] = []

      await loader.activateAddon(
        'reapply-addon',
        {
          activate: (context) => {
            context.contributions.settings.register(
              [
                {
                  id: 'enableFeature',
                  type: 'boolean',
                  label: 'Enable Feature',
                  scope: 'configuration',
                  defaultValue: true,
                },
                {
                  id: 'webhookSecret',
                  type: 'password',
                  label: 'Webhook Secret',
                  scope: 'credential',
                },
              ],
              {
                onApply: ({ values, events }) => {
                  if (shouldFailApply) {
                    return Either.failure(
                      AppError.Internal('RUNTIME_APPLY_FAILED'),
                    )
                  }
                  const enabled = Boolean(values['enableFeature'])
                  events.on('timer:start', () => {
                    executedValues.push(enabled)
                  })
                  return Either.success()
                },
              },
            )
            context.contributions.dataSources.register({
              getConnectionProfiles: () => [],
              getConnectionSchema: () => [],
              createInstance: () => ({
                tasksProvider: fakeTasksProvider,
                timeEntriesProvider: fakeTimeEntriesProvider,
                membersProvider: fakeMembersProvider,
                metadataProvider: fakeMetadataProvider,
              }),
            })
          },
          deactivate: vi.fn(),
        },
        {
          id: 'reapply-addon',
          name: 'Reapply Addon',
          version: '1.0.0',
          categories: ['watcher', 'dataSource'],
          author: 'Test',
          shortDescription: 'Desc',
          description: 'Long desc',
          capabilities: [
            {
              capabilityId: 'voice-watcher',
              kind: 'watcher',
              contractVersion: '1.0.0',
              executionPolicy: { kind: 'activeWorkspace' },
              authRequirement: {
                kind: 'required',
                connectionProfileId: 'reapply-prof',
                authorizationRole: 'primary',
              },
              supportedOperations: ['read', 'write'],
              required: true,
              settingsSchemaScope: 'capability',
            },
            {
              capabilityId: 'ds-neighbor',
              kind: 'dataSource',
              contractVersion: '1.0.0',
              executionPolicy: { kind: 'independent' },
              authRequirement: {
                kind: 'required',
                connectionProfileId: 'reapply-prof',
                authorizationRole: 'primary',
              },
              supportedOperations: ['read'],
              required: true,
            },
          ],
        },
      )

      const ds = loader.dataSourceRegistry
        .getItems()
        .find((item) => item.id === 'reapply-addon')
      expect(ds).toBeDefined()
      if (!ds) return

      const dsInstance = ds.createInstance({
        httpClient: fakeHttpClient,
        scope: { workspaceId: 'ws-1', connectionInstanceId: 'conn-1' },
      })

      const capScope = {
        kind: 'capability' as const,
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        capabilityId: 'voice-watcher',
      }

      // 1st save: enableFeature = false (rev 0 -> 1)
      const save1 = await loader.saveAddonSettings(
        'reapply-addon',
        capScope,
        0,
        { enableFeature: false },
      )
      expect(save1.isSuccess()).toBe(true)
      expect(loader.getAppliedSettingsRevision('reapply-addon', capScope)).toBe(
        1,
      )

      loader.systemEventEmitter.emit('timer:start', {
        entryId: 'e-1',
        taskId: 't-1',
        workspaceId: 'ws-1',
        startedAt: new Date().toISOString(),
      })
      expect(executedValues).toEqual([false])

      // 2nd save: enableFeature = true (rev 1 -> 2)
      const save2 = await loader.saveAddonSettings(
        'reapply-addon',
        capScope,
        1,
        { enableFeature: true },
      )
      expect(save2.isSuccess()).toBe(true)
      expect(loader.getAppliedSettingsRevision('reapply-addon', capScope)).toBe(
        2,
      )

      // Emit timer:start again -> only ONE active listener must fire with the new setting (true)
      loader.systemEventEmitter.emit('timer:start', {
        entryId: 'e-2',
        taskId: 't-1',
        workspaceId: 'ws-1',
        startedAt: new Date().toISOString(),
      })
      expect(executedValues).toEqual([false, true])

      // Neighbor capability (ds-neighbor) on the same connection is NOT invalidated
      const neighborCheck = await dsInstance.tasksProvider.findAll()
      expect(neighborCheck.isSuccess()).toBe(true)

      // 3rd save: simulate runtime application failure (rev 2 -> 3 in repo, but apply fails)
      shouldFailApply = true
      const save3 = await loader.saveAddonSettings(
        'reapply-addon',
        capScope,
        2,
        { enableFeature: false },
      )
      expect(save3.isFailure()).toBe(true)
      if (save3.isFailure()) {
        expect(save3.failure.messageKey).toBe('RUNTIME_APPLY_FAILED')
      }
      // Revision 3 must NOT be declared as applied!
      expect(loader.getAppliedSettingsRevision('reapply-addon', capScope)).toBe(
        2,
      )
      // Persisted settings in repository are NOT corrupted (revision is 3, value is false)
      const persistedAfterFail = await loader.getAddonSettings(
        'reapply-addon',
        capScope,
      )
      expect(persistedAfterFail.isSuccess()).toBe(true)
      if (persistedAfterFail.isSuccess()) {
        expect(persistedAfterFail.success.revision).toBe(3)
        expect(persistedAfterFail.success.values['enableFeature']).toBe(false)
      }

      // 4th save: partial credential failure (207) -> non-secret settings (rev 3 -> 4) are persisted and applied, while 207 error is preserved
      shouldFailApply = false
      failVaultWrite = true
      const save4 = await loader.saveAddonSettings(
        'reapply-addon',
        capScope,
        3,
        { enableFeature: true },
        { webhookSecret: 'secret-val' },
      )
      expect(save4.isFailure()).toBe(true)
      if (save4.isFailure()) {
        expect(save4.failure.statusCode).toBe(207)
        expect(save4.failure.messageKey).toBe(
          'ADDON_CREDENTIAL_PARTIAL_FAILURE',
        )
      }
      // Because non-secret settings were persisted in rev 4 and onApply succeeded, applied revision is 4
      expect(loader.getAppliedSettingsRevision('reapply-addon', capScope)).toBe(
        4,
      )
      loader.systemEventEmitter.emit('timer:start', {
        entryId: 'e-3',
        taskId: 't-1',
        workspaceId: 'ws-1',
        startedAt: new Date().toISOString(),
      })
      expect(executedValues).toEqual([false, true, true])
    })

    it('correlates generation and revision across concurrent apply1/apply2 (late apply1 success or failure never regresses or stops rev2) and rejects disconnect during apply', async () => {
      const mockConnections: CoreConnection[] = [
        {
          workspaceId: 'ws-1',
          connectionInstanceId: 'conn-1',
          addonId: 'concurrent-apply-addon',
          connectionProfileId: 'conc-prof',
          cardinality: 'single',
          status: 'connected',
          identity: null,
        },
      ]
      const customCore: ICoreAddonCapabilities = {
        ...unavailableCore,
        connections: {
          ...unavailableCore.connections,
          list: async () => Either.success(mockConnections),
          get: async () => Either.success(mockConnections[0]!),
        },
      }
      const loader = createLoader(() => customCore)

      let releaseRev1: () => void = () => {}
      const rev1Gate = new Promise<void>((resolve) => {
        releaseRev1 = resolve
      })
      let markRev1Entered: () => void = () => {}
      const rev1Entered = new Promise<void>((resolve) => {
        markRev1Entered = resolve
      })

      let releaseRev3: () => void = () => {}
      const rev3Gate = new Promise<void>((resolve) => {
        releaseRev3 = resolve
      })
      let markRev3Entered: () => void = () => {}
      const rev3Entered = new Promise<void>((resolve) => {
        markRev3Entered = resolve
      })

      let releaseRev5Disconnect: () => void = () => {}
      const rev5Gate = new Promise<void>((resolve) => {
        releaseRev5Disconnect = resolve
      })
      let markRev5Entered: () => void = () => {}
      const rev5Entered = new Promise<void>((resolve) => {
        markRev5Entered = resolve
      })

      const consumedTags: string[] = []
      const cleanedUpTags: string[] = []
      const savedEvents: number[] = []
      loader.systemEventEmitter.on('addon:settings:saved', (payload) => {
        if (payload.addonId === 'concurrent-apply-addon') {
          savedEvents.push(payload.revision)
        }
      })

      await loader.activateAddon(
        'concurrent-apply-addon',
        {
          activate: (context) => {
            context.contributions.settings.register(
              [
                {
                  id: 'tag',
                  type: 'text',
                  label: 'Tag',
                  scope: 'configuration',
                  defaultValue: 'init',
                },
              ],
              {
                onApply: async ({ revision, values, events, track }) => {
                  const rawTag = values['tag']
                  let tagValue = ''
                  if (typeof rawTag === 'string') {
                    tagValue = rawTag
                  }
                  if (revision === 1) {
                    markRev1Entered()
                    await rev1Gate
                  }
                  if (revision === 3) {
                    markRev3Entered()
                    await rev3Gate
                    return Either.failure(
                      AppError.Internal('STALE_APPLY_FAILED'),
                    )
                  }
                  if (revision === 5) {
                    markRev5Entered()
                    await rev5Gate
                  }
                  track(() => {
                    cleanedUpTags.push(tagValue)
                  })
                  events.on('timer:start', () => {
                    consumedTags.push(tagValue)
                  })
                  return Either.success()
                },
              },
            )
          },
          deactivate: vi.fn(),
        },
        {
          id: 'concurrent-apply-addon',
          name: 'Concurrent Apply Addon',
          version: '1.0.0',
          categories: ['watcher'],
          author: 'Test',
          shortDescription: 'Desc',
          description: 'Long desc',
          capabilities: [
            {
              capabilityId: 'voice-watcher',
              kind: 'watcher',
              contractVersion: '1.0.0',
              executionPolicy: { kind: 'activeWorkspace' },
              authRequirement: {
                kind: 'required',
                connectionProfileId: 'conc-prof',
                authorizationRole: 'primary',
              },
              supportedOperations: ['read', 'write'],
              required: true,
              settingsSchemaScope: 'capability',
            },
          ],
        },
      )

      // Undeclared scope (e.g. workspace instead of capability) is rejected explicitly
      const invalidScopeGet = await loader.getAddonSettings(
        'concurrent-apply-addon',
        { kind: 'workspace', workspaceId: 'ws-1' },
      )
      expect(invalidScopeGet.isFailure()).toBe(true)
      if (invalidScopeGet.isFailure()) {
        expect(invalidScopeGet.failure.messageKey).toBe(
          'CAPABILITY_SETTINGS_SCOPE_MISMATCH',
        )
      }

      const capScope = {
        kind: 'capability' as const,
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        capabilityId: 'voice-watcher',
      }

      // Case A: apply1 (rev 1) held at barrier -> apply2 (rev 2) completes -> release apply1 with SUCCESS
      const save1Promise = loader.saveAddonSettings(
        'concurrent-apply-addon',
        capScope,
        0,
        { tag: 'v1-stale' },
      )
      await rev1Entered

      const save2Result = await loader.saveAddonSettings(
        'concurrent-apply-addon',
        capScope,
        1,
        { tag: 'v2-fresh' },
      )
      expect(save2Result.isSuccess()).toBe(true)
      expect(
        loader.getAppliedSettingsRevision('concurrent-apply-addon', capScope),
      ).toBe(2)
      expect(savedEvents).toEqual([2])

      releaseRev1()
      const save1Result = await save1Promise
      expect(save1Result.isSuccess()).toBe(true)

      // Late apply1 must NOT regress appliedSettingsRevisions, must NOT emit stale event, and its post-await track/listener must be immediately disposed
      expect(
        loader.getAppliedSettingsRevision('concurrent-apply-addon', capScope),
      ).toBe(2)
      expect(savedEvents).toEqual([2])
      expect(cleanedUpTags).toContain('v1-stale')

      loader.systemEventEmitter.emit('timer:start', {
        entryId: 'e-c1',
        taskId: 't-1',
        workspaceId: 'ws-1',
        startedAt: new Date().toISOString(),
      })
      expect(consumedTags).toEqual(['v2-fresh'])

      // Case B: apply3 (rev 3) held at barrier -> apply4 (rev 4) completes -> release apply3 with FAILURE
      const save3Promise = loader.saveAddonSettings(
        'concurrent-apply-addon',
        capScope,
        2,
        { tag: 'v3-stale-fail' },
      )
      await rev3Entered

      const save4Result = await loader.saveAddonSettings(
        'concurrent-apply-addon',
        capScope,
        3,
        { tag: 'v4-active' },
      )
      expect(save4Result.isSuccess()).toBe(true)
      expect(
        loader.getAppliedSettingsRevision('concurrent-apply-addon', capScope),
      ).toBe(4)
      expect(savedEvents).toEqual([2, 4])

      releaseRev3()
      const save3Result = await save3Promise
      expect(save3Result.isFailure()).toBe(true)

      // Late failing apply3 must NOT stop rev 4's active generation!
      expect(
        loader.getAppliedSettingsRevision('concurrent-apply-addon', capScope),
      ).toBe(4)
      loader.systemEventEmitter.emit('timer:start', {
        entryId: 'e-c2',
        taskId: 't-1',
        workspaceId: 'ws-1',
        startedAt: new Date().toISOString(),
      })
      expect(consumedTags).toEqual(['v2-fresh', 'v4-active'])

      // Case C: Disconnect during await applyHandler (rev 5)
      const save5Promise = loader.saveAddonSettings(
        'concurrent-apply-addon',
        capScope,
        4,
        { tag: 'v5-disconnected' },
      )
      await rev5Entered

      loader.systemEventEmitter.emit('connection:disconnected', {
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
      })

      releaseRev5Disconnect()
      const save5Result = await save5Promise
      expect(save5Result.isFailure()).toBe(true)
      if (save5Result.isFailure()) {
        expect(save5Result.failure.messageKey).toBe(
          'CONNECTION_DISCONNECTED_OR_CHANGED',
        )
      }
      // Must NOT mark rev 5 as applied, must NOT emit saved event, and must NOT open listener
      expect(
        loader.getAppliedSettingsRevision('concurrent-apply-addon', capScope),
      ).toBe(4)
      expect(savedEvents).toEqual([2, 4])
      loader.systemEventEmitter.emit('timer:start', {
        entryId: 'e-c3',
        taskId: 't-1',
        workspaceId: 'ws-1',
        startedAt: new Date().toISOString(),
      })
      expect(consumedTags).toEqual(['v2-fresh', 'v4-active'])
    })

    it('invalidates binding via real CoreAddonCapabilities disconnect event without manual emit', async () => {
      const createdWorkspace = Workspace.create({ name: 'E2E Workspace' })
      if (createdWorkspace.isFailure()) {
        expect.fail('Failed to create workspace')
        return
      }
      const ws = createdWorkspace.success
      ws.createConnection('conn-e2e', 'e2e-addon', {
        connectionProfileId: 'profile-1',
        cardinality: 'multi',
        default: true,
      })

      const disconnectService: IDisconnectAddonConnectionUseCase = {
        execute: async () => Either.success(),
      }

      const loader = createLoader()
      const core = new AddonCoreCapabilities(
        {
          create: async () => Either.failure(AppError.NotFound('NOT_FOUND')),
          getById: async () => Either.success(ws),
          list: async () =>
            Either.success({ items: [ws], total: 1, page: 1, pageSize: 10 }),
          update: async () => Either.failure(AppError.NotFound('NOT_FOUND')),
          remove: async () => Either.failure(AppError.NotFound('NOT_FOUND')),
        },
        {
          queryCore: async () => ({
            ok: false,
            error: { messageKey: 'NOT_FOUND', statusCode: 404 },
          }),
          getState: () => 'ready',
          onStateChanged: () => () => {},
        },
        'e2e-addon',
        {
          create: async () => Either.success(ws),
          connect: async () => Either.failure(AppError.NotFound('NOT_FOUND')),
          disconnect: async () =>
            Either.failure(AppError.NotFound('NOT_FOUND')),
          withCredentials: async () =>
            Either.failure(AppError.NotFound('NOT_FOUND')),
          refresh: async () => Either.failure(AppError.NotFound('NOT_FOUND')),
          archive: async () => Either.failure(AppError.NotFound('NOT_FOUND')),
          restore: async () => Either.failure(AppError.NotFound('NOT_FOUND')),
        },
        {
          getConnectionProfiles: async () => Either.success([]),
          getDataSource: async () =>
            Either.failure(AppError.NotFound('NOT_FOUND')),
          getDataSourcesForWorkspace: async () => Either.success([]),
        },
        () => undefined,
        { execute: async () => Either.failure(AppError.NotFound('NOT_FOUND')) },
        { execute: async () => Either.failure(AppError.NotFound('NOT_FOUND')) },
        disconnectService,
        { execute: async () => Either.failure(AppError.NotFound('NOT_FOUND')) },
        new AddonAuthenticatorRegistry(),
        new AddonConnectionProfilesResolver(),
        new OAuthAttemptCoordinator(),
        loader.systemEventEmitter,
      )

      const dsManifest: IAddonManifest = {
        id: 'e2e-addon',
        name: 'E2E Addon',
        version: '1.0.0',
        categories: ['dataSource'],
        author: 'Test',
        shortDescription: 'Desc',
        description: 'Long desc',
        capabilities: [
          {
            capabilityId: 'ds-e2e',
            kind: 'dataSource',
            contractVersion: '1.0.0',
            executionPolicy: { kind: 'independent' },
            authRequirement: { kind: 'none' },
            supportedOperations: ['read', 'write'],
            required: true,
          },
        ],
      }

      const mockAddon: IAddon = {
        activate: (context) => {
          context.contributions.dataSources.register({
            getConnectionProfiles: () => [],
            getConnectionSchema: () => [],
            createInstance: () => ({
              tasksProvider: {
                pull: async () => Either.success<TaskDTO[], AppError>([]),
                findAll: async () =>
                  Either.success<PagedResultDTO<TaskDTO>, AppError>({
                    items: [],
                    total: 0,
                    page: 1,
                    pageSize: 10,
                  }),
                findById: async () =>
                  Either.success<TaskDTO | null, AppError>(null),
                create: async () =>
                  Either.success<CreatedTaskResult, AppError>({ id: 't-1' }),
                update: async () =>
                  Either.success<UpdatedTaskResult, AppError>({ id: 't-1' }),
                delete: async () => Either.success<void, AppError>(undefined),
              },
              timeEntriesProvider: fakeTimeEntriesProvider,
              membersProvider: fakeMembersProvider,
              metadataProvider: fakeMetadataProvider,
            }),
          })
        },
        deactivate: vi.fn(),
      }

      await loader.activateAddon('e2e-addon', mockAddon, dsManifest)
      const ds = loader.dataSourceRegistry
        .getItems()
        .find((item) => item.id === 'e2e-addon')
      expect(ds).toBeDefined()
      if (!ds) return

      const instance = ds.createInstance({
        httpClient: fakeHttpClient,
        scope: {
          workspaceId: 'ws-e2e',
          connectionInstanceId: 'conn-e2e',
        },
      })

      const before = await instance.tasksProvider.findAll()
      expect(before.isSuccess()).toBe(true)

      const disconnectResult = await core.connections.disconnect({
        workspaceId: 'ws-e2e',
        connectionInstanceId: 'conn-e2e',
      })
      expect(disconnectResult.isSuccess()).toBe(true)

      const after = await instance.tasksProvider.findAll()
      expect(after.isFailure()).toBe(true)
      if (after.isFailure()) {
        expect(after.failure.messageKey).toBe(
          'CONNECTION_DISCONNECTED_OR_CHANGED',
        )
      }
    })
  })
})
