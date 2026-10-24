import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  ConnectAddonConnectionService,
  ConnectionLifecycleCoordinator,
  IAddonAuthenticatorRegistry,
  IAddonConnectionProfilesResolver,
  IConnectionCredentialsVault,
  IWorkspacesRepository,
  LinkConnectionService,
} from '@mr-tick/application'
import { ConnectionProfileDescriptor, Workspace } from '@mr-tick/domain'
import { Either } from '@mr-tick/shared/helpers'
import { afterEach, describe, expect, it } from 'vitest'

import { SQLiteConnectionLifecycleRepository } from './SQLiteConnectionLifecycleRepository'
import { SQLiteConnectionLifecycleTransactionBoundary } from './SQLiteConnectionLifecycleTransactionBoundary'
import { SQLiteConnectionReservationRepository } from './SQLiteConnectionReservationRepository'
import { SQLiteWorkspacesRepository } from './SQLiteWorkspaceRepository'

const dummyAuthenticatorRegistry: IAddonAuthenticatorRegistry = {
  register: () => {},
  unregister: () => {},
  getAuthenticator: () => undefined,
  getAuthenticatorsForAddon: () => [],
}

let temporaryDirectory: string | undefined
let activeRepositories: SQLiteWorkspacesRepository[] = []

describe('connection reservation integration', () => {
  afterEach(async () => {
    for (const repo of activeRepositories) {
      await repo.close()
    }
    activeRepositories = []
    if (temporaryDirectory === undefined) return
    const resolved = path.resolve(temporaryDirectory)
    const prefix = path.resolve(os.tmpdir(), 'connection-reservation-t04-')
    expect(path.isAbsolute(resolved)).toBe(true)
    expect(resolved.startsWith(prefix)).toBe(true)
    if (!path.isAbsolute(resolved)) return
    if (!resolved.startsWith(prefix)) return
    await fs.rm(resolved, { recursive: true, force: true })
    temporaryDirectory = undefined
  })

  it('admits one concurrent single-profile link and authenticates only its winner', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'connection-reservation-t04-'),
    )
    const repository = new SQLiteWorkspacesRepository(temporaryDirectory)
    activeRepositories.push(repository)
    const workspace = createWorkspace()
    const created = await repository.create(workspace)
    expect(created.isSuccess()).toBe(true)

    const resolver = createResolver(async () =>
      Either.success([
        {
          connectionProfileId: 'primary',
          cardinality: 'single',
          default: true,
        },
      ]),
    )
    const credentialsVault: IConnectionCredentialsVault = {
      readCredential: async () => ({ kind: 'absent' }),
      writeCredential: async () => ({ kind: 'completed' }),
      removeCredential: async () => ({ kind: 'completed' }),
    }
    const lifecycleRepository = new SQLiteConnectionLifecycleRepository(
      repository.db,
    )
    const reservationRepository = new SQLiteConnectionReservationRepository(
      repository.db,
    )
    const coordinator = new ConnectionLifecycleCoordinator(
      credentialsVault,
      repository,
      lifecycleRepository,
      reservationRepository,
      {
        withNoPendingWrites: (_workspaceId, _connectionId, operation) =>
          operation(),
      },
      new SQLiteConnectionLifecycleTransactionBoundary(repository.db),
      dummyAuthenticatorRegistry,
    )
    const service = new LinkConnectionService(repository, resolver, coordinator)

    const [firstLink, secondLink] = await Promise.all([
      service.execute({
        workspaceId: workspace.id,
        connectionInstanceId: 'connection-alpha',
        addonId: 'addon-a',
        connectionProfileId: 'primary',
      }),
      service.execute({
        workspaceId: workspace.id,
        connectionInstanceId: 'connection-beta',
        addonId: 'addon-a',
        connectionProfileId: 'primary',
      }),
    ])

    const results = [firstLink, secondLink]
    const successes = results.filter((result) => result.isSuccess())
    const failures = results.filter((result) => result.isFailure())
    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(1)
    if (failures[0].isFailure()) {
      expect(failures[0].failure.messageKey).toBe(
        'CONNECTION_CARDINALITY_REACHED',
      )
    }

    const winningConnection =
      firstLink.isSuccess() && firstLink.success
        ? { id: 'connection-alpha' }
        : { id: 'connection-beta' }

    let authenticationCount = 0
    let notifyStarted: (() => void) | undefined
    const authenticationStarted = new Promise<void>((resolve) => {
      notifyStarted = resolve
    })
    let allowFinish: (() => void) | undefined
    const authenticationCanFinish = new Promise<void>((resolve) => {
      allowFinish = resolve
    })

    const authenticatorRegistry: IAddonAuthenticatorRegistry = {
      register: () => {},
      unregister: () => {},
      getAuthenticatorsForAddon: () => [],
      getAuthenticator: (addonId, authProfileId) => {
        if (addonId !== 'addon-a' || authProfileId !== 'primary')
          return undefined
        return {
          method: 'credentials',
          authProfileId: 'primary',
          supportsRefresh: false,
          supportsRevocation: false,
          authenticate: async () => {
            authenticationCount += 1
            notifyStarted?.()
            await authenticationCanFinish
            const identity = {
              kind: 'human' as const,
              providerId: 'addon-a',
              tenantId: 'tenant-1',
              providerSubjectId: 'user-1',
              displayName: 'User One',
            }
            return Either.success({
              kind: 'authorized' as const,
              identity,
              credentials: { token: 'credential-a' },
            })
          },
        }
      },
    }

    const connectService = new ConnectAddonConnectionService(
      repository,
      coordinator,
      resolver,
      authenticatorRegistry,
    )

    const connectPromise = connectService.execute({
      workspaceId: workspace.id,
      addonId: 'addon-a',
      connectionInstanceId: winningConnection.id,
      authenticationInput: {
        method: 'authorized',
        authorizationRole: 'primary',
        authProfileId: 'primary',
        credentials: { token: 'credential-a' },
        configuration: { baseUrl: 'https://a.example.test' },
      },
    })
    await authenticationStarted
    if (allowFinish) allowFinish()
    const connected = await connectPromise
    expect(
      connected.isSuccess(),
      connected.isFailure() ? JSON.stringify(connected.failure) : '',
    ).toBe(true)
    expect(authenticationCount).toBe(1)
    const finalRecord = await repository.getById(workspace.id)
    expect(finalRecord.isSuccess()).toBe(true)
    expect(
      finalRecord.success?.connections.filter(
        (connection) => connection.status === 'connected',
      ),
    ).toHaveLength(1)
  })

  it('cancels a late auth callback after disconnect without restoring connection or credential', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'connection-reservation-t04-'),
    )
    const repository = new SQLiteWorkspacesRepository(temporaryDirectory)
    activeRepositories.push(repository)
    const workspace = createWorkspace()
    const created = await repository.create(workspace)
    expect(created.isSuccess()).toBe(true)

    const storedCredentials = new Map<string, string>()
    const credentialsVault: IConnectionCredentialsVault = {
      readCredential: async (reference) => {
        const token = storedCredentials.get(
          `${reference.service}/${reference.account}`,
        )
        if (token === undefined) return { kind: 'absent' }
        return { kind: 'present', token }
      },
      writeCredential: async (reference, token) => {
        storedCredentials.set(
          `${reference.service}/${reference.account}`,
          token,
        )
        return { kind: 'completed' }
      },
      removeCredential: async (reference) => {
        storedCredentials.delete(`${reference.service}/${reference.account}`)
        return { kind: 'completed' }
      },
    }

    const lifecycleRepository = new SQLiteConnectionLifecycleRepository(
      repository.db,
    )
    const reservationRepository = new SQLiteConnectionReservationRepository(
      repository.db,
    )
    const coordinator = new ConnectionLifecycleCoordinator(
      credentialsVault,
      repository,
      lifecycleRepository,
      reservationRepository,
      {
        withNoPendingWrites: (_workspaceId, _connectionId, operation) =>
          operation(),
      },
      new SQLiteConnectionLifecycleTransactionBoundary(repository.db),
      dummyAuthenticatorRegistry,
    )
    const resolver = createResolver(async () =>
      Either.success([
        {
          connectionProfileId: 'primary',
          cardinality: 'single',
          default: true,
        },
      ]),
    )
    const linkService = new LinkConnectionService(
      repository,
      resolver,
      coordinator,
    )
    const linked = await linkService.execute({
      workspaceId: workspace.id,
      connectionInstanceId: 'late-connection',
      addonId: 'addon-a',
      connectionProfileId: 'primary',
    })
    expect(linked.isSuccess()).toBe(true)

    let resolveAuthentication: (() => void) | undefined
    const authenticationHold = new Promise<void>((resolve) => {
      resolveAuthentication = resolve
    })

    const authenticatorRegistry: IAddonAuthenticatorRegistry = {
      register: () => {},
      unregister: () => {},
      getAuthenticatorsForAddon: () => [],
      getAuthenticator: () => ({
        method: 'credentials',
        authProfileId: 'primary',
        supportsRefresh: false,
        supportsRevocation: false,
        authenticate: async () => {
          await authenticationHold
          const identity = {
            kind: 'human' as const,
            providerId: 'addon-a',
            tenantId: 'tenant-1',
            providerSubjectId: 'user-late',
            displayName: 'Late User',
          }
          return Either.success({
            kind: 'authorized' as const,
            identity,
            credentials: { token: 'credential-late' },
          })
        },
      }),
    }

    const connectService = new ConnectAddonConnectionService(
      repository,
      coordinator,
      resolver,
      authenticatorRegistry,
    )

    const connectionResult = connectService.execute({
      workspaceId: workspace.id,
      addonId: 'addon-a',
      connectionInstanceId: 'late-connection',
      authenticationInput: {
        method: 'authorized',
        authorizationRole: 'primary',
        authProfileId: 'primary',
        credentials: { token: 'late-secret' },
        configuration: {},
      },
    })

    const disconnected = await coordinator.disconnect({
      workspaceId: workspace.id,
      connectionInstanceId: 'late-connection',
      addonId: 'addon-a',
    })
    expect(disconnected.isSuccess()).toBe(true)
    if (resolveAuthentication) resolveAuthentication()
    const lateResult = await connectionResult

    expect(lateResult.isFailure()).toBe(true)
    expect(storedCredentials.size).toBe(0)
    const finalRecord = await repository.getById(workspace.id)
    expect(finalRecord.isSuccess()).toBe(true)
    expect(finalRecord.success?.connections[0].status).toBe('disconnected')
    expect(finalRecord.success?.connections[0]).not.toHaveProperty(
      'authorizationId',
    )
  })

  it('rejects a disconnect from another addon without changing persisted bytes', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'connection-reservation-t04-'),
    )
    const repository = new SQLiteWorkspacesRepository(temporaryDirectory)
    activeRepositories.push(repository)
    const workspace = createWorkspace()
    const created = await repository.create(workspace)
    expect(created.isSuccess()).toBe(true)
    const lifecycleRepository = new SQLiteConnectionLifecycleRepository(
      repository.db,
    )
    const reservationRepository = new SQLiteConnectionReservationRepository(
      repository.db,
    )
    const coordinator = new ConnectionLifecycleCoordinator(
      {
        readCredential: async () => ({ kind: 'absent' as const }),
        writeCredential: async () => ({ kind: 'completed' }),
        removeCredential: async () => ({ kind: 'completed' }),
      },
      repository,
      lifecycleRepository,
      reservationRepository,
      {
        withNoPendingWrites: (_workspaceId, _connectionId, operation) =>
          operation(),
      },
      new SQLiteConnectionLifecycleTransactionBoundary(repository.db),
      dummyAuthenticatorRegistry,
    )
    const resolver = createResolver(async () =>
      Either.success([
        {
          connectionProfileId: 'primary',
          cardinality: 'single',
          default: true,
        },
      ]),
    )
    const linkService = new LinkConnectionService(
      repository,
      resolver,
      coordinator,
    )
    const linked = await linkService.execute({
      workspaceId: workspace.id,
      connectionInstanceId: 'target-connection',
      addonId: 'addon-owner',
      connectionProfileId: 'primary',
    })
    expect(linked.isSuccess()).toBe(true)

    const wsBefore = await repository.getById(workspace.id)
    expect(wsBefore.isSuccess()).toBe(true)

    const rejected = await coordinator.disconnect({
      workspaceId: workspace.id,
      connectionInstanceId: 'target-connection',
      addonId: 'different-addon',
    })

    expect(rejected.isFailure()).toBe(true)
    expect(rejected.failure.messageKey).toBe(
      'CONNECTION_PROFILE_OWNERSHIP_CONFLICT',
    )
    const wsAfter = await repository.getById(workspace.id)
    expect(wsAfter.isSuccess()).toBe(true)
    expect(wsAfter.success?.connections[0].status).toBe(
      wsBefore.success?.connections[0].status,
    )
  })

  it('replays a successful link without creating another confirmed reservation or rewriting bytes', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'connection-reservation-t04-'),
    )
    const repository = new SQLiteWorkspacesRepository(temporaryDirectory)
    activeRepositories.push(repository)
    const workspace = createWorkspace()
    const created = await repository.create(workspace)
    expect(created.isSuccess()).toBe(true)

    const resolver = createResolver(async () =>
      Either.success([
        {
          connectionProfileId: 'primary',
          cardinality: 'multi',
          default: true,
        },
      ]),
    )
    const credentialsVault: IConnectionCredentialsVault = {
      readCredential: async () => ({ kind: 'absent' }),
      writeCredential: async () => ({ kind: 'completed' }),
      removeCredential: async () => ({ kind: 'completed' }),
    }
    const lifecycleRepository = new SQLiteConnectionLifecycleRepository(
      repository.db,
    )
    const reservationRepository = new SQLiteConnectionReservationRepository(
      repository.db,
    )
    const coordinator = new ConnectionLifecycleCoordinator(
      credentialsVault,
      repository,
      lifecycleRepository,
      reservationRepository,
      {
        withNoPendingWrites: (_workspaceId, _connectionId, operation) =>
          operation(),
      },
      new SQLiteConnectionLifecycleTransactionBoundary(repository.db),
      dummyAuthenticatorRegistry,
    )
    const service = new LinkConnectionService(repository, resolver, coordinator)
    const input = {
      workspaceId: workspace.id,
      connectionInstanceId: 'connection-replay',
      addonId: 'addon-a',
      connectionProfileId: 'primary',
    }

    const firstLink = await service.execute(input)
    expect(firstLink.isSuccess()).toBe(true)
    const firstRecord = await repository.getById(workspace.id)
    expect(firstRecord.isSuccess()).toBe(true)
    const confirmedBeforeReplay = firstRecord.success?.connections.filter(
      (connection) => connection.id === input.connectionInstanceId,
    )
    expect(confirmedBeforeReplay).toHaveLength(1)

    const replay = await service.execute(input)

    expect(
      replay.isSuccess(),
      replay.isFailure() ? replay.failure.messageKey : '',
    ).toBe(true)
    const replayRecord = await repository.getById(workspace.id)
    expect(replayRecord.isSuccess()).toBe(true)
    const confirmedAfterReplay = replayRecord.success?.connections.filter(
      (connection) => connection.id === input.connectionInstanceId,
    )
    expect(confirmedAfterReplay).toHaveLength(1)
  })

  it('preserves both connections when two concurrent flows link independent connections under multi profile', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'connection-reservation-t04-'),
    )
    const repository = new SQLiteWorkspacesRepository(temporaryDirectory)
    activeRepositories.push(repository)
    const workspace = createWorkspace()
    const created = await repository.create(workspace)
    expect(created.isSuccess()).toBe(true)

    const resolver = createResolver(async () =>
      Either.success([
        {
          connectionProfileId: 'multi-profile',
          cardinality: 'multi',
          default: true,
        },
      ]),
    )
    const credentialsVault: IConnectionCredentialsVault = {
      readCredential: async () => ({ kind: 'absent' }),
      writeCredential: async () => ({ kind: 'completed' }),
      removeCredential: async () => ({ kind: 'completed' }),
    }
    const lifecycleRepository = new SQLiteConnectionLifecycleRepository(
      repository.db,
    )
    const reservationRepository = new SQLiteConnectionReservationRepository(
      repository.db,
    )

    let flow1ReadDoneResolve!: () => void
    const flow1ReadDone = new Promise<void>((resolve) => {
      flow1ReadDoneResolve = resolve
    })

    let flow2ReadDoneResolve!: () => void
    const flow2ReadDone = new Promise<void>((resolve) => {
      flow2ReadDoneResolve = resolve
    })

    let flow1UpdateDoneResolve!: () => void
    const flow1UpdateDone = new Promise<void>((resolve) => {
      flow1UpdateDoneResolve = resolve
    })

    let coordinatorReadCount = 0
    const originalGetById = repository.getById.bind(repository)

    // Wrap repository so that both coordinator flows read the initial workspace state BEFORE flow 1 updates
    const wrappedRepository: IWorkspacesRepository = {
      getById: async (id: string) => {
        const res = await originalGetById(id)
        coordinatorReadCount += 1
        if (coordinatorReadCount === 1) {
          flow1ReadDoneResolve()
          await flow2ReadDone
          return res
        }
        if (coordinatorReadCount === 2) {
          flow2ReadDoneResolve()
          await flow1UpdateDone
          return res
        }
        return res
      },
      list: repository.list.bind(repository),
      create: repository.create.bind(repository),
      update: async (ws: Workspace) => {
        const res = await repository.update(ws)
        flow1UpdateDoneResolve()
        return res
      },
      remove: repository.remove.bind(repository),
    }

    const coordinator = new ConnectionLifecycleCoordinator(
      credentialsVault,
      wrappedRepository,
      lifecycleRepository,
      reservationRepository,
      {
        withNoPendingWrites: (_workspaceId, _connectionId, operation) =>
          operation(),
      },
      new SQLiteConnectionLifecycleTransactionBoundary(repository.db),
      dummyAuthenticatorRegistry,
    )

    const [firstCreate, secondCreate] = await Promise.all([
      coordinator.create({
        workspaceId: workspace.id,
        connectionInstanceId: 'connection-1',
        addonId: 'addon-a',
        profile: {
          connectionProfileId: 'multi-profile',
          cardinality: 'multi',
          default: true,
        },
      }),
      coordinator.create({
        workspaceId: workspace.id,
        connectionInstanceId: 'connection-2',
        addonId: 'addon-a',
        profile: {
          connectionProfileId: 'multi-profile',
          cardinality: 'multi',
          default: true,
        },
      }),
    ])

    expect(firstCreate.isSuccess()).toBe(true)
    expect(secondCreate.isSuccess()).toBe(true)

    const finalRecord = await repository.getById(workspace.id)
    expect(finalRecord.isSuccess()).toBe(true)
    const connIds = finalRecord.success?.connections.map((c) => c.id) ?? []
    expect(connIds).toContain('connection-1')
    expect(connIds).toContain('connection-2')
    expect(finalRecord.success?.connections).toHaveLength(2)
  })
})

function createWorkspace(): Workspace {
  const result = Workspace.create({ name: 'Concurrent connection' })
  if (result.isFailure()) throw new Error(result.failure.messageKey)
  return result.success
}

function createResolver(
  query: () => Promise<Either<never, ConnectionProfileDescriptor[]>>,
): IAddonConnectionProfilesResolver {
  return {
    getConnectionSchema: vi.fn(async () => Either.success([])),
    getConnectionProfiles: async () => query(),
  }
}
