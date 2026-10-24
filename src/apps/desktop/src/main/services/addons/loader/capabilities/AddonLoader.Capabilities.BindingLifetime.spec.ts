import {
  CoreConnection,
  CreatedTaskResult,
  ICoreAddonCapabilities,
  ITaskProvider,
  PagedResultDTO,
  TaskDTO,
  UpdatedTaskResult,
} from '@mr-tick/application'
import { IAddon, IAddonManifest } from '@mr-tick/sdk'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { describe, expect, it, vi } from 'vitest'

import { unavailableCore } from '../../core/addon-core-test-fixture'
import {
  createLoader,
  fakeHttpClient,
  fakeMembersProvider,
  fakeMetadataProvider,
  fakeTimeEntriesProvider,
} from './AddonLoader.Capabilities.fixture'

describe('AddonLoader - Capabilities & Granular Lifetime - Binding Lifetime & Concurrency', () => {
  describe('Granular Binding Lifetime & Concurrent Async Operations', () => {
    it('isolates connections: discards delayed async result of disconnected conn-1 while conn-2 succeeds using deterministic barrier', async () => {
      const loader = createLoader()

      let resolveConn1Entered: (() => void) | undefined
      const conn1Entered = new Promise<void>((resolve) => {
        resolveConn1Entered = resolve
      })
      let releaseConn1Gate: (() => void) | undefined
      const conn1Gate = new Promise<void>((resolve) => {
        releaseConn1Gate = resolve
      })

      let resolveConn2Entered: (() => void) | undefined
      const conn2Entered = new Promise<void>((resolve) => {
        resolveConn2Entered = resolve
      })
      let releaseConn2Gate: (() => void) | undefined
      const conn2Gate = new Promise<void>((resolve) => {
        releaseConn2Gate = resolve
      })

      const dsManifest: IAddonManifest = {
        id: 'test-granular-addon',
        name: 'Granular Addon',
        version: '1.0.0',
        author: 'Test',
        shortDescription: 'Desc',
        description: 'Long desc',
        capabilities: ['dataSource'],
      }

      const mockAddon: IAddon = {
        activate: (context) => {
          context.contributions.dataSources.register({
            createInstance: (ctx) => {
              const fakeTaskProvider: ITaskProvider = {
                pull: async () => Either.success<TaskDTO[], AppError>([]),
                findAll: async () => {
                  const scope = ctx.scope
                  if (scope.connectionInstanceId === 'conn-1') {
                    if (resolveConn1Entered) {
                      resolveConn1Entered()
                    }
                    await conn1Gate
                    return Either.success<PagedResultDTO<TaskDTO>, AppError>({
                      items: [
                        {
                          id: 'task-1',
                          title: 'Task Conn 1',
                          status: { id: 'open', name: 'Open' },
                          createdAt: new Date(),
                          updatedAt: new Date(),
                        },
                      ],
                      total: 1,
                      page: 1,
                      pageSize: 10,
                    })
                  }
                  if (resolveConn2Entered) {
                    resolveConn2Entered()
                  }
                  await conn2Gate
                  return Either.success<PagedResultDTO<TaskDTO>, AppError>({
                    items: [
                      {
                        id: 'task-2',
                        title: 'Task Conn 2',
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
                findById: async () =>
                  Either.success<TaskDTO | null, AppError>(null),
                create: async () =>
                  Either.success<CreatedTaskResult, AppError>({ id: 't-new' }),
                update: async () =>
                  Either.success<UpdatedTaskResult, AppError>({ id: 't-up' }),
                delete: async () => Either.success<void, AppError>(undefined),
              }
              return {
                tasksProvider: fakeTaskProvider,
                timeEntriesProvider: fakeTimeEntriesProvider,
                membersProvider: fakeMembersProvider,
                metadataProvider: fakeMetadataProvider,
              }
            },
          })
        },
        deactivate: vi.fn(),
      }

      await loader.activateAddon('test-granular-addon', mockAddon, dsManifest)
      const ds = loader.dataSourceRegistry
        .getItems()
        .find((item) => item.id === 'test-granular-addon')
      expect(ds).toBeDefined()
      if (!ds) return

      const instance1 = ds.createInstance({
        httpClient: fakeHttpClient,
        scope: { workspaceId: 'ws-1', connectionInstanceId: 'conn-1' },
      })
      const instance2 = ds.createInstance({
        httpClient: fakeHttpClient,
        scope: { workspaceId: 'ws-1', connectionInstanceId: 'conn-2' },
      })

      const call1Promise = instance1.tasksProvider.findAll()
      const call2Promise = instance2.tasksProvider.findAll()

      await Promise.all([conn1Entered, conn2Entered])

      loader.systemEventEmitter.emit('connection:disconnected', {
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
      })

      if (releaseConn1Gate) {
        releaseConn1Gate()
      }
      if (releaseConn2Gate) {
        releaseConn2Gate()
      }

      const [res1, res2] = await Promise.all([call1Promise, call2Promise])

      expect(res1.isFailure()).toBe(true)
      if (res1.isFailure()) {
        expect(res1.failure.messageKey).toBe(
          'CONNECTION_DISCONNECTED_OR_CHANGED',
        )
      }

      expect(res2.isSuccess()).toBe(true)
      if (res2.isSuccess()) {
        expect(res2.success.items[0]?.title).toBe('Task Conn 2')
      }

      const immediateCallConn1 = await instance1.tasksProvider.findAll()
      expect(immediateCallConn1.isFailure()).toBe(true)
      if (immediateCallConn1.isFailure()) {
        expect(immediateCallConn1.failure.messageKey).toBe(
          'CONNECTION_DISCONNECTED_OR_CHANGED',
        )
      }
    })

    it('cancels binding and rejects subsequent calls when connection:archived is emitted', async () => {
      const loader = createLoader()
      const dsManifest: IAddonManifest = {
        id: 'test-archive-addon',
        name: 'Archive Addon',
        version: '1.0.0',
        author: 'Test',
        shortDescription: 'Desc',
        description: 'Long desc',
        capabilities: ['dataSource'],
      }
      const mockAddon: IAddon = {
        activate: (context) => {
          context.contributions.dataSources.register({
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

      await loader.activateAddon('test-archive-addon', mockAddon, dsManifest)
      const ds = loader.dataSourceRegistry
        .getItems()
        .find((item) => item.id === 'test-archive-addon')
      expect(ds).toBeDefined()
      if (!ds) return

      const instance = ds.createInstance({
        httpClient: fakeHttpClient,
        scope: {
          workspaceId: 'ws-archived',
          connectionInstanceId: 'conn-archived',
        },
      })

      const before = await instance.tasksProvider.findAll()
      expect(before.isSuccess()).toBe(true)

      loader.systemEventEmitter.emit('connection:archived', {
        workspaceId: 'ws-archived',
        connectionInstanceId: 'conn-archived',
      })

      const after = await instance.tasksProvider.findAll()
      expect(after.isFailure()).toBe(true)
      if (after.isFailure()) {
        expect(after.failure.messageKey).toBe(
          'CONNECTION_DISCONNECTED_OR_CHANGED',
        )
      }
    })

    it('cancels binding and rejects subsequent calls when connection:removed is emitted', async () => {
      const loader = createLoader()
      const dsManifest: IAddonManifest = {
        id: 'test-remove-addon',
        name: 'Remove Addon',
        version: '1.0.0',
        author: 'Test',
        shortDescription: 'Desc',
        description: 'Long desc',
        capabilities: ['dataSource'],
      }
      const mockAddon: IAddon = {
        activate: (context) => {
          context.contributions.dataSources.register({
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

      await loader.activateAddon('test-remove-addon', mockAddon, dsManifest)
      const ds = loader.dataSourceRegistry
        .getItems()
        .find((item) => item.id === 'test-remove-addon')
      expect(ds).toBeDefined()
      if (!ds) return

      const instance = ds.createInstance({
        scope: {
          workspaceId: 'ws-removed',
          connectionInstanceId: 'conn-removed',
        },
        httpClient: fakeHttpClient,
      })

      const before = await instance.tasksProvider.findAll()
      expect(before.isSuccess()).toBe(true)

      loader.systemEventEmitter.emit('connection:removed', {
        workspaceId: 'ws-removed',
        connectionInstanceId: 'conn-removed',
      })

      const after = await instance.tasksProvider.findAll()
      expect(after.isFailure()).toBe(true)
      if (after.isFailure()) {
        expect(after.failure.messageKey).toBe(
          'CONNECTION_DISCONNECTED_OR_CHANGED',
        )
      }
    })
  })

  describe('Real Capability Ownership in Settings', () => {
    it('rejects capability of another profile before IO and allows connection without primary role', async () => {
      const mockConnections: CoreConnection[] = [
        {
          workspaceId: 'ws-settings',
          connectionInstanceId: 'conn-profile-a',
          addonId: 'settings-addon',
          connectionProfileId: 'profile-a',
          cardinality: 'single',
          status: 'connected',
          identity: null,
          authorizationRole: 'secondary',
        },
        {
          workspaceId: 'ws-settings',
          connectionInstanceId: 'conn-profile-b',
          addonId: 'settings-addon',
          connectionProfileId: 'profile-b',
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
          get: async (scope) => {
            const found = mockConnections.find(
              (c) =>
                c.workspaceId === scope.workspaceId &&
                c.connectionInstanceId === scope.connectionInstanceId,
            )
            if (!found) {
              return Either.failure(AppError.NotFound('CONNECTION_NOT_FOUND'))
            }
            return Either.success(found)
          },
        },
      }

      const loader = createLoader(() => customCore)
      const settingsAddon: IAddon = {
        activate: (context) => {
          context.contributions.settings.register([
            {
              id: 'token',
              type: 'text',
              label: 'Token',
              scope: 'configuration',
            },
          ])
        },
        deactivate: vi.fn(),
      }
      await loader.activateAddon('settings-addon', settingsAddon, {
        id: 'settings-addon',
        name: 'Settings Addon',
        version: '1.0.0',
        author: 'Test',
        shortDescription: 'Desc',
        description: 'Long desc',
        capabilities: ['watcher'],
      })

      const mismatchedResult = await loader.getAddonSettings('settings-addon', {
        kind: 'capability',
        workspaceId: 'ws-settings',
        connectionInstanceId: 'conn-profile-b',
        capabilityId: 'cap-for-profile-a',
      })
      expect(mismatchedResult.isFailure()).toBe(true)
      if (mismatchedResult.isFailure()) {
        expect(mismatchedResult.failure.messageKey).toBe(
          'ADDON_SCOPE_OWNERSHIP_INVALID',
        )
      }

      const scopeMismatchResult = await loader.getAddonSettings(
        'settings-addon',
        {
          kind: 'capability',
          workspaceId: 'ws-settings',
          connectionInstanceId: 'conn-profile-a',
          capabilityId: 'undeclared-cap',
        },
      )
      expect(scopeMismatchResult.isFailure()).toBe(true)
      if (scopeMismatchResult.isFailure()) {
        expect(scopeMismatchResult.failure.messageKey).toBe(
          'ADDON_SCOPE_OWNERSHIP_INVALID',
        )
      }

      const matchedResult = await loader.getAddonSettings('settings-addon', {
        kind: 'capability',
        workspaceId: 'ws-settings',
        connectionInstanceId: 'conn-profile-a',
        capabilityId: 'watcher',
      })
      expect(matchedResult.isSuccess()).toBe(true)
    })
  })

  describe('Real Dispatch Blocking with isOperationSupported', () => {
    it('refuses dataSource registration when no dataSource capability descriptor is declared', async () => {
      const loader = createLoader()
      const mockAddon: IAddon = {
        activate: (context) => {
          context.contributions.dataSources.register({
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
                  Either.success<CreatedTaskResult, AppError>({ id: 't-new' }),
                update: async () =>
                  Either.success<UpdatedTaskResult, AppError>({ id: 't-up' }),
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

      await loader.activateAddon('undeclared-ds-addon', mockAddon)
      const ds = loader.dataSourceRegistry
        .getItems()
        .find((item) => item.id === 'undeclared-ds-addon')
      expect(ds).toBeUndefined()
    })

    it('blocks undeclared operations at runtime before reaching inner provider', async () => {
      const loader = createLoader()
      const deleteSpy = vi.fn()
      const findAllSpy = vi.fn().mockResolvedValue(
        Either.success<PagedResultDTO<TaskDTO>, AppError>({
          items: [],
          total: 0,
          page: 1,
          pageSize: 10,
        }),
      )

      const manifest: IAddonManifest = {
        id: 'dispatch-addon',
        name: 'Dispatch Addon',
        version: '1.0.0',
        author: 'Test',
        shortDescription: 'Desc',
        description: 'Long desc',
        capabilities: ['dataSource'],
      }

      const mockAddon: IAddon = {
        activate: (context) => {
          context.contributions.dataSources.register({
            createInstance: () => ({
              tasksProvider: {
                pull: async () => Either.success<TaskDTO[], AppError>([]),
                findAll: findAllSpy,
                findById: async () =>
                  Either.success<TaskDTO | null, AppError>(null),
                create: async () =>
                  Either.success<CreatedTaskResult, AppError>({ id: 't-new' }),
                update: async () =>
                  Either.success<UpdatedTaskResult, AppError>({ id: 't-up' }),
                delete: deleteSpy,
              },
              timeEntriesProvider: fakeTimeEntriesProvider,
              membersProvider: fakeMembersProvider,
              metadataProvider: fakeMetadataProvider,
            }),
          })
        },
        deactivate: vi.fn(),
      }

      await loader.activateAddon('dispatch-addon', mockAddon, manifest)
      const ds = loader.dataSourceRegistry
        .getItems()
        .find((item) => item.id === 'dispatch-addon')
      expect(ds).toBeDefined()
      if (!ds) return

      const instance = ds.createInstance({
        httpClient: fakeHttpClient,
        scope: {
          workspaceId: 'ws-1',
          connectionInstanceId: 'conn-1',
        },
      })

      loader.disableCapability('dispatch-addon', 'dataSource')
      const deleteResult = await instance.tasksProvider.delete('t-1')
      expect(deleteResult.isFailure()).toBe(true)
      if (deleteResult.isFailure()) {
        expect(deleteResult.failure.messageKey).toBe('OPERATION_NOT_SUPPORTED')
      }
      expect(deleteSpy).not.toHaveBeenCalled()

      loader.enableCapability('dispatch-addon', 'dataSource')
      const readResult = await instance.tasksProvider.findAll()
      expect(readResult.isSuccess()).toBe(true)
      expect(findAllSpy).toHaveBeenCalled()
    })

    it('does not register executable dataSource if addon has no dataSource capability', async () => {
      const loader = createLoader()
      const manifest: IAddonManifest = {
        id: 'optional-incompat-ds',
        name: 'Optional Incompatible DataSource',
        version: '1.0.0',
        author: 'Test',
        shortDescription: 'Desc',
        description: 'Long desc',
        capabilities: ['watcher'],
      }

      const mockAddon: IAddon = {
        activate: (context) => {
          context.contributions.dataSources.register({
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

      const activated = await loader.activateAddon(
        'optional-incompat-ds',
        mockAddon,
        manifest,
      )
      expect(activated).toBe(true)

      const registeredDs = loader.dataSourceRegistry
        .getItems()
        .find((item) => item.id === 'optional-incompat-ds')
      expect(registeredDs).toBeUndefined()
    })

    it('ensures atomic registration of manifest capabilities without polluting disabled state on failure', () => {
      const loader = createLoader()
      const res = loader.registerManifestCapabilities('atomic-addon', [
        'dataSource',
        'dataSource',
      ])
      expect(res.isFailure()).toBe(true)
      if (res.isFailure()) {
        expect(res.failure.messageKey).toBe(
          'CAPABILITY_DUPLICATE_ID:dataSource',
        )
      }
      expect(
        loader.isOperationSupported('atomic-addon', 'watcher', 'watch'),
      ).toBe(false)
    })
  })
})
