import {
  type AddonConnectionAuthenticator,
  ConnectionLifecycleCoordinator,
  CredentialReference,
  CredentialReferenceFactory,
  CredentialVaultMutationResult,
  CredentialVaultReadResult,
  IAddonAuthenticatorRegistry,
  IConnectionCredentialsVault,
  type IConnectionLifecycleTransactionBoundary,
  type IConnectionPendingWorkGuard,
  RecoverConnectionLifecycleService,
} from '@mr-tick/application'
import {
  type ConnectionIdentity,
  ConnectionProfileDescriptor,
  Workspace,
} from '@mr-tick/domain'
import { AppError, Either, TokenRefreshError } from '@mr-tick/shared/helpers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { withSafeTransaction } from './sqlite-connection'
import { SQLiteConnectionLifecycleRepository } from './SQLiteConnectionLifecycleRepository'
import { SQLiteConnectionLifecycleTransactionBoundary } from './SQLiteConnectionLifecycleTransactionBoundary'
import { SQLiteConnectionReservationRepository } from './SQLiteConnectionReservationRepository'
import { SQLiteWorkspacesRepository } from './SQLiteWorkspaceRepository'

class TestAuthenticatorRegistry implements IAddonAuthenticatorRegistry {
  private authenticators = new Map<string, AddonConnectionAuthenticator>()

  public register(
    addonId: string,
    authenticator: AddonConnectionAuthenticator,
  ): void {
    this.authenticators.set(
      `${addonId}:${authenticator.authProfileId}`,
      authenticator,
    )
  }

  public unregister(addonId: string, authProfileId: string): void {
    this.authenticators.delete(`${addonId}:${authProfileId}`)
  }

  public getAuthenticator(
    addonId: string,
    authProfileId: string,
  ): AddonConnectionAuthenticator | undefined {
    return this.authenticators.get(`${addonId}:${authProfileId}`)
  }

  public getAuthenticatorsForAddon(
    addonId: string,
  ): readonly AddonConnectionAuthenticator[] {
    const result: AddonConnectionAuthenticator[] = []
    for (const [key, auth] of this.authenticators.entries()) {
      if (key.startsWith(`${addonId}:`)) {
        result.push(auth)
      }
    }
    return result
  }
}

const dummyAuthenticatorRegistry: IAddonAuthenticatorRegistry =
  new TestAuthenticatorRegistry()

class ControlledCredentialsVault implements IConnectionCredentialsVault {
  public readonly storage = new Map<string, string>()

  public async readCredential(
    reference: CredentialReference,
  ): Promise<CredentialVaultReadResult> {
    const value = this.storage.get(reference.id)
    if (value === undefined) {
      return { kind: 'absent' }
    }
    return { kind: 'present', token: value }
  }

  public async writeCredential(
    reference: CredentialReference,
    token: string,
  ): Promise<CredentialVaultMutationResult> {
    this.storage.set(reference.id, token)
    return { kind: 'completed' }
  }

  public async removeCredential(
    reference: CredentialReference,
  ): Promise<CredentialVaultMutationResult> {
    this.storage.delete(reference.id)
    return { kind: 'completed' }
  }
}

describe('Deterministic Database/Vault Boundary and Lifecycle Interruption', () => {
  let repository: SQLiteWorkspacesRepository
  let lifecycleRepository: SQLiteConnectionLifecycleRepository
  let reservationRepository: SQLiteConnectionReservationRepository
  let transactionBoundary: SQLiteConnectionLifecycleTransactionBoundary
  let vault: ControlledCredentialsVault

  const profile: ConnectionProfileDescriptor = {
    connectionProfileId: 'discord-presence',
    cardinality: 'single',
    default: true,
    roles: [
      {
        authorizationRole: 'primary',
        allowedAuthProfileIds: ['discord-oauth'],
        defaultAuthProfileId: 'discord-oauth',
      },
    ],
  }

  beforeEach(() => {
    repository = new SQLiteWorkspacesRepository(':memory:')
    lifecycleRepository = new SQLiteConnectionLifecycleRepository(repository.db)
    reservationRepository = new SQLiteConnectionReservationRepository(
      repository.db,
    )
    transactionBoundary = new SQLiteConnectionLifecycleTransactionBoundary(
      repository.db,
    )
    vault = new ControlledCredentialsVault()
  })

  afterEach(async () => {
    await lifecycleRepository.close()
    await reservationRepository.close()
    await repository.close()
  })

  it('RED to GREEN: recovery preserves candidate credential if workspace connection is already active in database', async () => {
    // 1. Setup workspace with connection
    const created = Workspace.create({ name: 'Boundary Test Workspace' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success

    const connInstanceId = 'conn-boundary-1'
    workspace.createConnection(connInstanceId, 'mistertick-discord', profile)
    const savedInitial = await repository.create(workspace)
    expect(savedInitial.isSuccess()).toBe(true)

    // 2. Reserve connection slot
    const reservationId = 'res-boundary-1'
    const reservationResult = await reservationRepository.reserveConnectionSlot(
      {
        reservationId,
        workspaceId: workspace.id,
        addonId: 'mistertick-discord',
        connectionProfileId: 'discord-presence',
        connectionId: connInstanceId,
        cardinality: 'single',
        default: true,
      },
    )
    expect(reservationResult.isSuccess()).toBe(true)

    // 3. Simulate coordinator.connect interruption between workspace update and metadata_committed:
    // candidate written into vault
    const candidateRef = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'mistertick-discord',
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: 'auth-1',
      operationId: 'op-interrupted',
    })
    await vault.writeCredential(
      candidateRef,
      JSON.stringify({ accessToken: 'active-token-xyz' }),
    )

    // lifecycle begins and advances to candidate_written
    const beginResult = await lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId: 'op-interrupted',
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      intent: 'connection.connect',
      expectedRevision: 1,
      connectionGeneration: 1,
      reservationId,
      candidateReference: candidateRef.id,
      previousReferences: [],
    })
    expect(beginResult.isSuccess()).toBe(true)

    const advanceResult = await lifecycleRepository.advanceLifecycle(
      'op-interrupted',
      'candidate_written',
    )
    expect(advanceResult.isSuccess()).toBe(true)

    // Workspace is updated in the database with the active candidate authorization!
    const wsToUpdate = (await repository.getById(workspace.id)).success
    expect(wsToUpdate).toBeDefined()
    if (!wsToUpdate) return

    const connectAuthResult = wsToUpdate.connectAuthorization(connInstanceId, {
      authorizationId: 'auth-1',
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      credentialReferenceId: candidateRef.id,
      identity: {
        kind: 'human',
        providerId: 'discord',
        tenantId: '1372352088457220126',
        providerSubjectId: 'user-discord-123',
        displayName: 'Discord User',
      },
    })
    expect(connectAuthResult.isSuccess()).toBe(true)
    const updateResult = await repository.update(wsToUpdate)
    expect(updateResult.isSuccess()).toBe(true)

    // CRASH / INTERRUPTION OCCURS HERE:
    // The journal in the database is still in phase 'candidate_written'.
    // The workspace in the database is committed with the connection ACTIVE using candidateRef.id.

    // 4. System recovers using RecoverConnectionLifecycleService:
    const recoveryService = new RecoverConnectionLifecycleService(
      lifecycleRepository,
      vault,
      repository,
      transactionBoundary,
    )
    const recoveryResult = await recoveryService.execute()
    expect(recoveryResult.isSuccess()).toBe(true)

    // 5. Assert: The candidate credential MUST NOT have been deleted from the vault!
    const credentialAfterRecovery = await vault.readCredential(candidateRef)
    expect(credentialAfterRecovery.kind).toBe('present')
  })

  it('atomically rolls back workspace metadata update if milestone advance fails in shared transaction', async () => {
    // 1. Setup workspace with unconfigured connection
    const created = Workspace.create({ name: 'Atomic Rollback Workspace' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success

    const connInstanceId = 'conn-boundary-2'
    workspace.createConnection(connInstanceId, 'mistertick-discord', profile)
    const savedInitial = await repository.create(workspace)
    expect(savedInitial.isSuccess()).toBe(true)

    const reservationId = 'res-boundary-2'
    const reservationResult = await reservationRepository.reserveConnectionSlot(
      {
        reservationId,
        workspaceId: workspace.id,
        addonId: 'mistertick-discord',
        connectionProfileId: 'discord-presence',
        connectionId: connInstanceId,
        cardinality: 'single',
        default: true,
      },
    )
    expect(reservationResult.isSuccess()).toBe(true)

    // 2. Create a coordinator with a transaction boundary that simulates a failure during advanceLifecycle
    class FailingLifecycleRepository extends SQLiteConnectionLifecycleRepository {
      public override async advanceLifecycle(
        operationId: string,
        phase:
          | 'candidate_written'
          | 'metadata_committed'
          | 'cleanup_pending'
          | 'candidate_cleanup_pending',
      ): Promise<Either<AppError, void>> {
        if (phase === 'metadata_committed') {
          return Either.failure(
            AppError.Internal('SIMULATED_DATABASE_FAILURE_ON_MILESTONE'),
          )
        }
        return super.advanceLifecycle(operationId, phase)
      }
    }

    const failingLifecycleBoundary: IConnectionLifecycleTransactionBoundary = {
      runInTransaction: async (action) => {
        return withSafeTransaction(repository.db, async (trx) => {
          const transactionalWorkspaces = new SQLiteWorkspacesRepository(trx)
          const transactionalLifecycle = new FailingLifecycleRepository(trx)
          return action({
            workspaces: transactionalWorkspaces,
            lifecycle: transactionalLifecycle,
          })
        })
      },
    }

    const coordinator = new ConnectionLifecycleCoordinator(
      vault,
      repository,
      lifecycleRepository,
      reservationRepository,
      {
        withNoPendingWrites: (_wId, _cId, op) => op(),
      },
      failingLifecycleBoundary,
      dummyAuthenticatorRegistry,
    )

    // 3. Attempt to connect
    const connectResult = await coordinator.connect({
      workspaceId: workspace.id,
      connectionInstanceId: connInstanceId,
      addonId: 'mistertick-discord',
      profile,
      method: 'authorized',
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      configuration: {},
      authenticate: async () =>
        Either.success({
          kind: 'authorized',
          identity: {
            kind: 'human',
            providerId: 'discord',
            tenantId: '1372352088457220126',
            providerSubjectId: 'user-atomic-fail',
            displayName: 'Atomic Fail User',
          },
          credentials: { accessToken: 'token-atomic' },
        }),
    })

    // 4. Assert: Connect failed with the internal error
    expect(connectResult.isFailure()).toBe(true)
    if (connectResult.isSuccess()) return
    expect(connectResult.failure.messageKey).toBe(
      'SIMULATED_DATABASE_FAILURE_ON_MILESTONE',
    )

    // 5. Assert: The workspace in the database must have ROLLED BACK (status still unconfigured, no authorizations)
    const wsInDbResult = await repository.getById(workspace.id)
    expect(wsInDbResult.isSuccess()).toBe(true)
    if (wsInDbResult.isFailure() || !wsInDbResult.success) return
    const wsInDb = wsInDbResult.success
    const connInDb = wsInDb.connections.find((c) => c.id === connInstanceId)
    expect(connInDb).toBeDefined()
    expect(connInDb?.status).toBe('disconnected')
    expect(connInDb?.authorizations).toHaveLength(0)

    // 6. Assert: Candidate credential was cleaned up from the vault by the failure cleanup
    expect(vault.storage.size).toBe(0)
  })

  it('atomically commits both workspace metadata update and metadata_committed milestone when both succeed', async () => {
    // 1. Setup workspace with unconfigured connection
    const created = Workspace.create({ name: 'Atomic Success Workspace' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success

    const connInstanceId = 'conn-boundary-3'
    workspace.createConnection(connInstanceId, 'mistertick-discord', profile)
    const savedInitial = await repository.create(workspace)
    expect(savedInitial.isSuccess()).toBe(true)

    const reservationId = 'res-boundary-3'
    const reservationResult = await reservationRepository.reserveConnectionSlot(
      {
        reservationId,
        workspaceId: workspace.id,
        addonId: 'mistertick-discord',
        connectionProfileId: 'discord-presence',
        connectionId: connInstanceId,
        cardinality: 'single',
        default: true,
      },
    )
    expect(reservationResult.isSuccess()).toBe(true)

    // 2. Coordinator with real SQLite transaction boundary
    const coordinator = new ConnectionLifecycleCoordinator(
      vault,
      repository,
      lifecycleRepository,
      reservationRepository,
      {
        withNoPendingWrites: (_wId, _cId, op) => op(),
      },
      transactionBoundary,
      dummyAuthenticatorRegistry,
    )

    // 3. Connect successfully
    const connectResult = await coordinator.connect({
      workspaceId: workspace.id,
      connectionInstanceId: connInstanceId,
      addonId: 'mistertick-discord',
      profile,
      method: 'authorized',
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      configuration: {},
      authenticate: async () =>
        Either.success({
          kind: 'authorized',
          identity: {
            kind: 'human',
            providerId: 'discord',
            tenantId: '1372352088457220126',
            providerSubjectId: 'user-atomic-success',
            displayName: 'Atomic Success User',
          },
          credentials: { accessToken: 'token-atomic-success' },
        }),
    })

    expect(connectResult.isSuccess()).toBe(true)

    // 4. Workspace in the database has connection connected with active authorization
    const wsInDbResult = await repository.getById(workspace.id)
    expect(wsInDbResult.isSuccess()).toBe(true)
    if (wsInDbResult.isFailure() || !wsInDbResult.success) return
    const wsInDb = wsInDbResult.success
    const connInDb = wsInDb.connections.find((c) => c.id === connInstanceId)
    expect(connInDb).toBeDefined()
    expect(connInDb?.status).toBe('connected')
    expect(connInDb?.authorizations).toHaveLength(1)

    // 5. Credential is present in vault
    expect(vault.storage.size).toBe(1)

    // 6. Journal in SQLite confirms metadata_committed milestone committed with workspace
    const journalRows = await repository.db('workspace_journal').where({
      workspace_id: workspace.id,
      connection_id: connInstanceId,
    })
    expect(journalRows.length).toBeGreaterThanOrEqual(1)
    const completedJournal = journalRows.find(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'status' in entry &&
        entry.status === 'completed',
    )
    expect(completedJournal).toBeDefined()
    if (
      typeof completedJournal === 'object' &&
      completedJournal !== null &&
      'phase' in completedJournal
    ) {
      expect(completedJournal.phase).toBe('metadata_committed')
    }
  })

  it('recovery de refresh apos crash em candidate_written com SQLite real conclui forward commit seguro quando correlacao e CAS conferem', async () => {
    // 1. Setup workspace e conexao conectada
    const created = Workspace.create({ name: 'Refresh Boundary Workspace' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success
    const connInstanceId = 'conn-refresh-1'
    workspace.createConnection(connInstanceId, 'mistertick-discord', profile)
    await repository.create(workspace)

    const reservationResult = await reservationRepository.reserveConnectionSlot(
      {
        reservationId: 'res-boundary-refresh-1',
        workspaceId: workspace.id,
        addonId: 'mistertick-discord',
        connectionProfileId: 'discord-presence',
        connectionId: connInstanceId,
        cardinality: 'single',
        default: true,
      },
    )
    expect(reservationResult.isSuccess()).toBe(true)

    const coordinator = new ConnectionLifecycleCoordinator(
      vault,
      repository,
      lifecycleRepository,
      reservationRepository,
      {
        withNoPendingWrites: (_wId, _cId, op) => op(),
      },
      transactionBoundary,
      dummyAuthenticatorRegistry,
    )

    const connectResult = await coordinator.connect({
      workspaceId: workspace.id,
      connectionInstanceId: connInstanceId,
      addonId: 'mistertick-discord',
      profile,
      method: 'authorized',
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      configuration: {},
      authenticate: async () =>
        Either.success({
          kind: 'authorized',
          identity: {
            kind: 'human',
            providerId: 'discord',
            tenantId: '1372352088457220126',
            providerSubjectId: 'user-refresh-1',
            displayName: 'Refresh User 1',
          },
          credentials: { accessToken: 'token-initial' },
        }),
    })
    expect(connectResult.isSuccess()).toBe(true)

    const wsAfterConnect = (await repository.getById(workspace.id)).success!
    const connAfterConnect = wsAfterConnect.connections.find(
      (c) => c.id === connInstanceId,
    )!
    const initialAuth = connAfterConnect.authorizations[0]!
    const initialRefId = initialAuth.credentialReferenceId!
    expect(vault.storage.has(initialRefId)).toBe(true)

    // 2. Simula falha/crash durante performTokenRefresh após candidate_written no SQLite
    const refreshOpId = 'refresh-op-crash-1'
    const candidateRef = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'mistertick-discord',
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: initialAuth.authorizationId,
      operationId: refreshOpId,
    })

    // Grava candidate no cofre (provedor rotacionou remotamente)
    await vault.writeCredential(
      candidateRef,
      JSON.stringify({ accessToken: 'token-renewed-uncommitted' }),
    )
    expect(vault.storage.has(candidateRef.id)).toBe(true)

    // Registra no SQLite com intent connection.refresh e reservationId null
    const beginRes = await lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId: refreshOpId,
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: initialAuth.authorizationId,
      expectedAuthorizationGeneration: initialAuth.generation,
      expectedConnectionGeneration: connAfterConnect.generation,
      intent: 'connection.refresh',
      expectedRevision: connAfterConnect.generation,
      connectionGeneration: connAfterConnect.generation,
      reservationId: null,
      candidateReference: candidateRef.id,
      previousReferences: [initialRefId],
    })
    expect(beginRes.isSuccess()).toBe(true)

    const advanceRes = await lifecycleRepository.advanceLifecycle(
      refreshOpId,
      'candidate_written',
    )
    expect(advanceRes.isSuccess()).toBe(true)

    // 3. Executa recovery (boot da aplicacao): deve concluir forward commit seguro
    const recoveryService = new RecoverConnectionLifecycleService(
      lifecycleRepository,
      vault,
      repository,
      transactionBoundary,
    )
    const recoveryResult = await recoveryService.execute()
    expect(recoveryResult.isSuccess()).toBe(true)

    // 4. Invariantes pós-recovery:
    // O candidate novo DEVE estar preservado no cofre
    expect(vault.storage.has(candidateRef.id)).toBe(true)
    // O segredo antigo (já consumido remotamente) DEVE ter sido limpo do cofre
    expect(vault.storage.has(initialRefId)).toBe(false)
    // A autorização no SQLite agora aponta para o candidateRef.id e continua 'active'
    const wsInDb = (await repository.getById(workspace.id)).success!
    const connInDb = wsInDb.connections.find((c) => c.id === connInstanceId)!
    const authInDb = connInDb.authorizations.find(
      (a) => a.authorizationId === initialAuth.authorizationId,
    )!
    expect(authInDb.status).toBe('active')
    expect(authInDb.credentialReferenceId).toBe(candidateRef.id)

    // No SQLite o journal entry deve ter sido completado
    const rowInDb = await repository
      .db('workspace_journal')
      .where({ operation_id: refreshOpId })
      .first()
    expect(rowInDb?.status).toBe('completed')
  })

  it('recovery de refresh apos crash em candidate_written quando CAS falha marca reauth_required sem reusar token antigo', async () => {
    // 1. Setup workspace e conexao conectada
    const created = Workspace.create({ name: 'Refresh CAS Fail Workspace' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success
    const connInstanceId = 'conn-refresh-cas-fail'
    workspace.createConnection(connInstanceId, 'mistertick-discord', profile)
    await repository.create(workspace)

    const reservationResult = await reservationRepository.reserveConnectionSlot(
      {
        reservationId: 'res-boundary-refresh-cas',
        workspaceId: workspace.id,
        addonId: 'mistertick-discord',
        connectionProfileId: 'discord-presence',
        connectionId: connInstanceId,
        cardinality: 'single',
        default: true,
      },
    )
    expect(reservationResult.isSuccess()).toBe(true)

    const coordinator = new ConnectionLifecycleCoordinator(
      vault,
      repository,
      lifecycleRepository,
      reservationRepository,
      {
        withNoPendingWrites: (_wId, _cId, op) => op(),
      },
      transactionBoundary,
      dummyAuthenticatorRegistry,
    )

    const connectResult = await coordinator.connect({
      workspaceId: workspace.id,
      connectionInstanceId: connInstanceId,
      addonId: 'mistertick-discord',
      profile,
      method: 'authorized',
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      configuration: {},
      authenticate: async () =>
        Either.success({
          kind: 'authorized',
          identity: {
            kind: 'human',
            providerId: 'discord',
            tenantId: '1372352088457220126',
            providerSubjectId: 'user-refresh-cas',
            displayName: 'Refresh User CAS',
          },
          credentials: { accessToken: 'token-initial-cas' },
        }),
    })
    expect(connectResult.isSuccess()).toBe(true)

    const wsAfterConnect = (await repository.getById(workspace.id)).success!
    const connAfterConnect = wsAfterConnect.connections.find(
      (c) => c.id === connInstanceId,
    )!
    const initialAuth = connAfterConnect.authorizations[0]!
    const initialRefId = initialAuth.credentialReferenceId!

    // 2. Simula crash após candidate_written
    const refreshOpId = 'refresh-op-cas-fail-1'
    const candidateRef = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'mistertick-discord',
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: initialAuth.authorizationId,
      operationId: refreshOpId,
    })

    await vault.writeCredential(
      candidateRef,
      JSON.stringify({ accessToken: 'token-renewed-uncommitted' }),
    )

    await lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId: refreshOpId,
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: initialAuth.authorizationId,
      expectedAuthorizationGeneration: initialAuth.generation,
      expectedConnectionGeneration: connAfterConnect.generation,
      intent: 'connection.refresh',
      expectedRevision: connAfterConnect.generation,
      connectionGeneration: connAfterConnect.generation,
      reservationId: null,
      candidateReference: candidateRef.id,
      previousReferences: [initialRefId],
    })
    await lifecycleRepository.advanceLifecycle(refreshOpId, 'candidate_written')

    // Simula que a conexao foi desconectada antes do recovery (CAS mismatch para forward commit)
    wsAfterConnect.disconnectConnection(connInstanceId)
    await repository.update(wsAfterConnect)

    // 3. Executa recovery
    const recoveryService = new RecoverConnectionLifecycleService(
      lifecycleRepository,
      vault,
      repository,
      transactionBoundary,
    )
    const recoveryResult = await recoveryService.execute()
    expect(recoveryResult.isSuccess()).toBe(true)

    // Invariantes: candidate limpo do cofre, journal abortado, token antigo nao reusado
    expect(vault.storage.has(candidateRef.id)).toBe(false)
    const rowInDb = await repository
      .db('workspace_journal')
      .where({ operation_id: refreshOpId })
      .first()
    expect(rowInDb?.status).toBe('aborted')
  })

  it('recovery de refresh pendente antigo NAO rebaixa autorizacao nova reautenticada com geracao superior', async () => {
    // 1. Setup workspace e conexao conectada
    const created = Workspace.create({ name: 'Refresh Superseeded Workspace' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success
    const connInstanceId = 'conn-refresh-superseeded'
    workspace.createConnection(connInstanceId, 'mistertick-discord', profile)
    await repository.create(workspace)

    const reservationResult = await reservationRepository.reserveConnectionSlot(
      {
        reservationId: 'res-boundary-refresh-sup',
        workspaceId: workspace.id,
        addonId: 'mistertick-discord',
        connectionProfileId: 'discord-presence',
        connectionId: connInstanceId,
        cardinality: 'single',
        default: true,
      },
    )
    expect(reservationResult.isSuccess()).toBe(true)

    const coordinator = new ConnectionLifecycleCoordinator(
      vault,
      repository,
      lifecycleRepository,
      reservationRepository,
      {
        withNoPendingWrites: (_wId, _cId, op) => op(),
      },
      transactionBoundary,
      dummyAuthenticatorRegistry,
    )

    // Conecta primeira vez (geracao 1)
    const connect1 = await coordinator.connect({
      workspaceId: workspace.id,
      connectionInstanceId: connInstanceId,
      addonId: 'mistertick-discord',
      profile,
      method: 'authorized',
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      configuration: {},
      authenticate: async () =>
        Either.success({
          kind: 'authorized',
          identity: {
            kind: 'human',
            providerId: 'discord',
            tenantId: '1372352088457220126',
            providerSubjectId: 'user-refresh-sup',
            displayName: 'Refresh User Sup',
          },
          credentials: { accessToken: 'token-gen-1' },
        }),
    })
    expect(connect1.isSuccess()).toBe(true)

    const ws1 = (await repository.getById(workspace.id)).success!
    const conn1 = ws1.connections.find((c) => c.id === connInstanceId)!
    const auth1 = conn1.authorizations[0]!
    const oldRefId = auth1.credentialReferenceId!
    const oldGeneration = conn1.generation

    // 2. Grava um refresh pendente antigo no journal (geracao 1)
    const oldRefreshOpId = 'old-refresh-op-1'
    await lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId: oldRefreshOpId,
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: auth1.authorizationId,
      expectedAuthorizationGeneration: auth1.generation,
      expectedConnectionGeneration: oldGeneration,
      intent: 'connection.refresh',
      expectedRevision: oldGeneration,
      connectionGeneration: oldGeneration,
      reservationId: null,
      candidateReference: null,
      previousReferences: [oldRefId],
    })

    // 3. Usuário reautoriza a conexão com sucesso (connect gera nova geracao 2 e nova credencial)
    const connect2 = await coordinator.connect({
      workspaceId: workspace.id,
      connectionInstanceId: connInstanceId,
      addonId: 'mistertick-discord',
      profile,
      method: 'authorized',
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      configuration: {},
      correlation: {
        connectionGeneration: conn1.generation,
        authorizationGeneration: auth1.generation,
        authorizationId: auth1.authorizationId,
      },
      authenticate: async () =>
        Either.success({
          kind: 'authorized',
          identity: {
            kind: 'human',
            providerId: 'discord',
            tenantId: '1372352088457220126',
            providerSubjectId: 'user-refresh-sup',
            displayName: 'Refresh User Sup',
          },
          credentials: { accessToken: 'token-gen-2-new' },
        }),
    })
    expect(connect2.isSuccess()).toBe(true)

    const ws2 = (await repository.getById(workspace.id)).success!
    const conn2 = ws2.connections.find((c) => c.id === connInstanceId)!
    const auth2 = conn2.authorizations[0]!
    expect(auth2.generation).toBeGreaterThan(oldGeneration)
    expect(auth2.status).toBe('active')
    const newRefId = auth2.credentialReferenceId!
    expect(newRefId).not.toBe(oldRefId)

    // 4. Agora executa recovery do journal (que contem a operacao antiga oldRefreshOpId da geracao 1)
    const recoveryService = new RecoverConnectionLifecycleService(
      lifecycleRepository,
      vault,
      repository,
      transactionBoundary,
    )
    const recoveryResult = await recoveryService.execute()
    expect(recoveryResult.isSuccess()).toBe(true)

    // 5. Invariante: a autorização NOVA NÃO pode ter sido rebaixada para reauth_required!
    const wsAfterRecovery = (await repository.getById(workspace.id)).success!
    const connAfterRecovery = wsAfterRecovery.connections.find(
      (c) => c.id === connInstanceId,
    )!
    const authAfterRecovery = connAfterRecovery.authorizations[0]!
    expect(authAfterRecovery.status).toBe('active') // Permanece active!
    expect(authAfterRecovery.credentialReferenceId).toBe(newRefId) // Preserva a credencial nova!

    // Journal antigo foi abortado
    const rowInDb = await repository
      .db('workspace_journal')
      .where({ operation_id: oldRefreshOpId })
      .first()
    expect(rowInDb?.status).toBe('aborted')
  })

  it('recovery de refresh apos crash em metadata_committed com SQLite real limpa previousReferences', async () => {
    // 1. Setup workspace e conexao conectada
    const created = Workspace.create({ name: 'Refresh Committed Workspace' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success
    const connInstanceId = 'conn-refresh-2'
    workspace.createConnection(connInstanceId, 'mistertick-discord', profile)
    await repository.create(workspace)

    const reservationResult = await reservationRepository.reserveConnectionSlot(
      {
        reservationId: 'res-boundary-refresh-2',
        workspaceId: workspace.id,
        addonId: 'mistertick-discord',
        connectionProfileId: 'discord-presence',
        connectionId: connInstanceId,
        cardinality: 'single',
        default: true,
      },
    )
    expect(reservationResult.isSuccess()).toBe(true)

    const coordinator = new ConnectionLifecycleCoordinator(
      vault,
      repository,
      lifecycleRepository,
      reservationRepository,
      {
        withNoPendingWrites: (_wId, _cId, op) => op(),
      },
      transactionBoundary,
      dummyAuthenticatorRegistry,
    )

    await coordinator.connect({
      workspaceId: workspace.id,
      connectionInstanceId: connInstanceId,
      addonId: 'mistertick-discord',
      profile,
      method: 'authorized',
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      configuration: {},
      authenticate: async () =>
        Either.success({
          kind: 'authorized',
          identity: {
            kind: 'human',
            providerId: 'discord',
            tenantId: '1372352088457220126',
            providerSubjectId: 'user-refresh-2',
            displayName: 'Refresh User 2',
          },
          credentials: { accessToken: 'token-initial-2' },
        }),
    })

    const wsAfterConnect = (await repository.getById(workspace.id)).success!
    const connAfterConnect = wsAfterConnect.connections.find(
      (c) => c.id === connInstanceId,
    )!
    const initialAuth = connAfterConnect.authorizations[0]!
    const oldRefId = initialAuth.credentialReferenceId!

    // 2. Simula que metadata_committed ocorreu (workspace atualizado no SQLite e journal avancado)
    const refreshOpId = 'refresh-op-committed-2'
    const candidateRef = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'mistertick-discord',
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: initialAuth.authorizationId,
      operationId: refreshOpId,
    })
    await vault.writeCredential(
      candidateRef,
      JSON.stringify({ accessToken: 'token-renewed-committed' }),
    )

    // Workspace atualizado no SQLite com candidateRef
    wsAfterConnect.connectAuthorization(
      connInstanceId,
      {
        authorizationRole: 'primary',
        authProfileId: 'discord-oauth',
        identity: initialAuth.identity!,
        authorizationId: initialAuth.authorizationId,
        credentialReferenceId: candidateRef.id,
      },
      {},
    )
    await repository.update(wsAfterConnect)

    // Journal no SQLite em cleanup_pending
    await lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId: refreshOpId,
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: initialAuth.authorizationId,
      expectedAuthorizationGeneration: initialAuth.generation,
      expectedConnectionGeneration: connAfterConnect.generation,
      intent: 'connection.refresh',
      expectedRevision: connAfterConnect.generation,
      connectionGeneration: connAfterConnect.generation,
      reservationId: null,
      candidateReference: candidateRef.id,
      previousReferences: [oldRefId],
    })
    await lifecycleRepository.advanceLifecycle(
      refreshOpId,
      'metadata_committed',
    )
    await lifecycleRepository.advanceLifecycle(refreshOpId, 'cleanup_pending')

    // Ambos estao no cofre antes do restart/recovery
    expect(vault.storage.has(oldRefId)).toBe(true)
    expect(vault.storage.has(candidateRef.id)).toBe(true)

    // 3. Executa recovery
    const recoveryService = new RecoverConnectionLifecycleService(
      lifecycleRepository,
      vault,
      repository,
      transactionBoundary,
    )
    const recoveryResult = await recoveryService.execute()
    expect(recoveryResult.isSuccess()).toBe(true)

    // 4. Invariantes pós-recovery:
    // oldRefId deve ter sido removido do cofre
    expect(vault.storage.has(oldRefId)).toBe(false)
    // candidateRef ativo deve ser preservado no cofre
    expect(vault.storage.has(candidateRef.id)).toBe(true)
    // Journal finalizado com sucesso no SQLite
    const rowInDb = await repository
      .db('workspace_journal')
      .where({ operation_id: refreshOpId })
      .first()
    expect(rowInDb?.status).toBe('completed')
  })

  it('RED to GREEN: SQLite real + vault + provider: failure during markAuthReauthRequired prevents retry in memory and marks reauth_required on recovery upon restart', async () => {
    const authRegistry = new TestAuthenticatorRegistry()
    const pendingWorkGuard: IConnectionPendingWorkGuard = {
      withNoPendingWrites: async (_w, _c, op) => op(),
    }

    const coordinator = new ConnectionLifecycleCoordinator(
      vault,
      repository,
      lifecycleRepository,
      reservationRepository,
      pendingWorkGuard,
      transactionBoundary,
      authRegistry,
    )

    // 1. Cria workspace e conecta autorização real no SQLite e Vault
    const ws = Workspace.create({
      name: 'SQLite Real WS',
    }).success!
    const savedWs = await repository.create(ws)
    expect(savedWs.isSuccess()).toBe(true)

    const wsCreated = await coordinator.create({
      workspaceId: ws.id,
      connectionInstanceId: 'conn-real-1',
      addonId: 'mistertick-discord',
      profile,
    })
    expect(wsCreated.isSuccess()).toBe(true)

    const initialToken = {
      accessToken: 'initial-access-token',
      refreshToken: 'initial-refresh-token',
    }

    const connectResult = await coordinator.connect({
      workspaceId: ws.id,
      connectionInstanceId: 'conn-real-1',
      addonId: 'mistertick-discord',
      profile,
      method: 'authorized',
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      configuration: {},
      authenticate: async () =>
        Either.success({
          kind: 'authorized',
          identity: {
            kind: 'human',
            providerId: 'discord',
            tenantId: '123',
            providerSubjectId: 'user-123',
            displayName: 'Discord User',
          },
          credentials: initialToken,
        }),
    })
    expect(connectResult.isSuccess()).toBe(true)

    // Confirma que autorização está 'active' no SQLite real
    const wsInDbBefore = (await repository.getById(ws.id)).success!
    const connInDbBefore = wsInDbBefore.connections.find(
      (c) => c.id === 'conn-real-1',
    )!
    const authInDbBefore = connInDbBefore.authorizations.find(
      (a) => a.authorizationRole === 'primary',
    )!
    expect(authInDbBefore.status).toBe('active')
    const initialAuthId = authInDbBefore.authorizationId

    // 2. Registra authenticator no registry:
    // O provedor consome o refresh token mas a resposta se perde por timeout incerto (504 remoteOutcomeUncertain)
    let networkCallCount = 0
    authRegistry.register('mistertick-discord', {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: true,
      supportsRevocation: false,
      createAuthorizationRequest: vi.fn(),
      completeAuthentication: vi.fn(),
      refreshToken: async () => {
        networkCallCount++
        // Confirma que ANTES da rede o SQLite real já possui a operação gravada na tabela workspace_journal
        const rows = await repository.db('workspace_journal').where({
          workspace_id: ws.id,
          intent: 'connection.refresh',
          status: 'pending',
        })
        expect(rows.length).toBe(1)
        expect(rows[0].phase).toBe('intent')

        return Either.failure(
          TokenRefreshError.remoteOutcomeUncertain(
            'REMOTE_TIMEOUT_UNCERTAIN',
            504,
          ),
        )
      },
    })

    // 3. Simula falha ao persistir marcador (injetando erro no SQLite repository.update)
    vi.spyOn(repository, 'update').mockImplementationOnce(async () =>
      Either.failure(AppError.Internal('INJECTED_DB_WRITE_FAILURE')),
    )

    // 4. Executa refresh: falha de gravação NÃO pode ser silenciada (Either tratado e propagado)
    const refreshResult = await coordinator.refresh({
      addonId: 'mistertick-discord',
      scope: {
        workspaceId: ws.id,
        connectionInstanceId: 'conn-real-1',
        authorizationRole: 'primary',
      },
    })
    expect(refreshResult.isFailure()).toBe(true)
    expect(refreshResult.failure.messageKey).toBe('INJECTED_DB_WRITE_FAILURE')
    expect(networkCallCount).toBe(1)

    // 5. Nova chamada na mesma sessão DEVE ser barrada pela quarentena em memória sem chamar rede
    const secondCall = await coordinator.refresh({
      addonId: 'mistertick-discord',
      scope: {
        workspaceId: ws.id,
        connectionInstanceId: 'conn-real-1',
        authorizationRole: 'primary',
      },
    })
    expect(secondCall.isFailure()).toBe(true)
    expect(secondCall.failure.messageKey).toBe('REAUTH_REQUIRED')
    expect(networkCallCount).toBe(1) // Provedor NÃO foi chamado novamente!

    // 6. Simula RESTART / REABERTURA do aplicativo:
    // Cria novo recovery service com o SQLite real contendo a operação de refresh pendente gravada antes da rede
    const recoveryService = new RecoverConnectionLifecycleService(
      lifecycleRepository,
      vault,
      repository,
      transactionBoundary,
    )
    const recoveryResult = await recoveryService.execute()
    expect(recoveryResult.isSuccess()).toBe(true)

    // Após recovery, a autorização no SQLite real DEVE estar marcada como 'reauth_required'
    const wsInDbAfterRecovery = (await repository.getById(ws.id)).success!
    const connInDbAfter = wsInDbAfterRecovery.connections.find(
      (c) => c.id === 'conn-real-1',
    )!
    const authInDbAfter = connInDbAfter.authorizations.find(
      (a) => a.authorizationId === initialAuthId,
    )!
    expect(authInDbAfter.status).toBe('reauth_required')

    // 7. Nova instância de coordinator após restart também recusa refresh lendo 'reauth_required' do SQLite
    const restartedCoordinator = new ConnectionLifecycleCoordinator(
      vault,
      repository,
      lifecycleRepository,
      reservationRepository,
      pendingWorkGuard,
      transactionBoundary,
      authRegistry,
    )

    const thirdCall = await restartedCoordinator.refresh({
      addonId: 'mistertick-discord',
      scope: {
        workspaceId: ws.id,
        connectionInstanceId: 'conn-real-1',
        authorizationRole: 'primary',
      },
    })
    expect(thirdCall.isFailure()).toBe(true)
    expect(thirdCall.failure.messageKey).toBe('REAUTH_REQUIRED')
    expect(networkCallCount).toBe(1) // Token antigo consumido NUNCA é repetido!
  })

  it('authGen5 / connGen1 recupera corretamente com forward commit sem colisao de eixos', async () => {
    const created = Workspace.create({
      name: 'Multi-Generation Correlation WS',
    })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success

    const connInstanceId = 'conn-multi-gen-1'
    workspace.createConnection(connInstanceId, 'mistertick-discord', profile)
    await repository.create(workspace)

    const authId = 'auth-discord-multi-1'
    const identity: ConnectionIdentity = {
      kind: 'human',
      providerId: 'discord',
      tenantId: '1372352088457220126',
      providerSubjectId: 'user-multi-123',
      displayName: 'User Multi 123',
    }

    let prevRefId = ''
    for (let index = 1; index <= 5; index += 1) {
      const ref = CredentialReferenceFactory.create({
        ownerId: 'mistertick-discord',
        workspaceId: workspace.id,
        connectionId: connInstanceId,
        authorizationId: `${authId}-v${index}`,
      })
      await vault.writeCredential(
        ref,
        JSON.stringify({ token: `token-v${index}` }),
      )
      prevRefId = ref.id
      const connectResult = workspace.connectAuthorization(
        connInstanceId,
        {
          authorizationRole: 'primary',
          authProfileId: 'discord-oauth',
          identity,
          authorizationId: authId,
          credentialReferenceId: ref.id,
        },
        { guildId: 'guild-1' },
      )
      expect(connectResult.isSuccess()).toBe(true)
    }
    await repository.update(workspace)

    const wsInDb = await repository.getById(workspace.id)
    expect(wsInDb.isSuccess()).toBe(true)
    if (wsInDb.isFailure()) return
    const freshWs = wsInDb.success
    expect(freshWs).toBeDefined()
    if (!freshWs) return

    const connInDb = freshWs.connections.find((c) => c.id === connInstanceId)
    expect(connInDb).toBeDefined()
    if (!connInDb) return
    expect(connInDb.generation).toBe(1)

    const targetAuth = connInDb.authorizations.find(
      (a) => a.authorizationId === authId,
    )
    expect(targetAuth).toBeDefined()
    if (!targetAuth) return
    expect(targetAuth.generation).toBe(5)
    expect(targetAuth.credentialReferenceId).toBe(prevRefId)

    const refreshOpId = 'refresh-op-gen5-1'
    const candidateRef = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'mistertick-discord',
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: authId,
      operationId: refreshOpId,
    })

    await vault.writeCredential(
      candidateRef,
      JSON.stringify({ token: 'token-candidate-gen6' }),
    )

    await lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId: refreshOpId,
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: authId,
      expectedAuthorizationGeneration: 5,
      expectedConnectionGeneration: 1,
      intent: 'connection.refresh',
      expectedRevision: connInDb.generation,
      connectionGeneration: connInDb.generation,
      reservationId: null,
      candidateReference: candidateRef.id,
      previousReferences: [prevRefId],
    })
    await lifecycleRepository.advanceLifecycle(refreshOpId, 'candidate_written')

    const recoveryService = new RecoverConnectionLifecycleService(
      lifecycleRepository,
      vault,
      repository,
      transactionBoundary,
    )
    const recoveryResult = await recoveryService.execute()
    expect(recoveryResult.isSuccess()).toBe(true)

    const wsAfterRecovery = await repository.getById(workspace.id)
    expect(wsAfterRecovery.isSuccess()).toBe(true)
    if (wsAfterRecovery.isFailure()) return
    const recoveredWs = wsAfterRecovery.success
    expect(recoveredWs).toBeDefined()
    if (!recoveredWs) return

    const connAfter = recoveredWs.connections.find(
      (c) => c.id === connInstanceId,
    )
    expect(connAfter).toBeDefined()
    if (!connAfter) return
    expect(connAfter.generation).toBe(1)

    const authAfter = connAfter.authorizations.find(
      (a) => a.authorizationId === authId,
    )
    expect(authAfter).toBeDefined()
    if (!authAfter) return
    expect(authAfter.generation).toBe(6)
    expect(authAfter.status).toBe('active')
    expect(authAfter.credentialReferenceId).toBe(candidateRef.id)

    const prevRef = CredentialReferenceFactory.fromId(prevRefId)
    expect(prevRef).toBeDefined()
    if (prevRef) {
      const prevRead = await vault.readCredential(prevRef)
      expect(prevRead.kind).toBe('absent')
    }

    const journalRow = await repository
      .db('workspace_journal')
      .where({ operation_id: refreshOpId })
      .first()
    expect(journalRow?.phase).toBe('metadata_committed')
    expect(journalRow?.status).toBe('completed')
  })

  it('readCredential no candidato: absent marca reauth_required; unavailable mantem journal recuperavel', async () => {
    // Subcenário A: candidate absent no cofre
    const createdA = Workspace.create({ name: 'Candidate Absent WS' })
    expect(createdA.isSuccess()).toBe(true)
    if (createdA.isFailure()) return
    const wsA = createdA.success

    const connIdA = 'conn-absent-1'
    wsA.createConnection(connIdA, 'mistertick-discord', profile)
    await repository.create(wsA)

    const authIdA = 'auth-absent-1'
    const identityA: ConnectionIdentity = {
      kind: 'human',
      providerId: 'discord',
      tenantId: '1372352088457220126',
      providerSubjectId: 'user-absent-123',
      displayName: 'User Absent 123',
    }
    const secretRefA = CredentialReferenceFactory.create({
      ownerId: 'mistertick-discord',
      workspaceId: wsA.id,
      connectionId: connIdA,
      authorizationId: authIdA,
    })
    await vault.writeCredential(
      secretRefA,
      JSON.stringify({ token: 'initial-token' }),
    )
    const connectAuthA = wsA.connectAuthorization(connIdA, {
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      identity: identityA,
      authorizationId: authIdA,
      credentialReferenceId: secretRefA.id,
    })
    expect(connectAuthA.isSuccess()).toBe(true)
    await repository.update(wsA)

    const refreshOpA = 'refresh-op-absent-1'
    const candidateRefA = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'mistertick-discord',
      workspaceId: wsA.id,
      connectionId: connIdA,
      authorizationId: authIdA,
      operationId: refreshOpA,
    })
    // NÃO grava candidateRefA no cofre (permanece absent)

    await lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId: refreshOpA,
      workspaceId: wsA.id,
      connectionId: connIdA,
      authorizationId: authIdA,
      expectedAuthorizationGeneration: 1,
      expectedConnectionGeneration: 1,
      intent: 'connection.refresh',
      expectedRevision: 1,
      connectionGeneration: 1,
      reservationId: null,
      candidateReference: candidateRefA.id,
      previousReferences: [secretRefA.id],
    })
    await lifecycleRepository.advanceLifecycle(refreshOpA, 'candidate_written')

    const recoveryServiceA = new RecoverConnectionLifecycleService(
      lifecycleRepository,
      vault,
      repository,
      transactionBoundary,
    )
    const resultA = await recoveryServiceA.execute()
    expect(resultA.isSuccess()).toBe(true)

    const wsInDbA = (await repository.getById(wsA.id)).success
    expect(wsInDbA).toBeDefined()
    if (!wsInDbA) return
    const connInDbA = wsInDbA.connections.find((c) => c.id === connIdA)
    expect(connInDbA).toBeDefined()
    if (!connInDbA) return
    const authInDbA = connInDbA.authorizations.find(
      (a) => a.authorizationId === authIdA,
    )
    expect(authInDbA).toBeDefined()
    if (!authInDbA) return
    expect(authInDbA.status).toBe('reauth_required')

    const journalRowA = await repository
      .db('workspace_journal')
      .where({ operation_id: refreshOpA })
      .first()
    expect(journalRowA?.status).toBe('aborted')

    // Subcenário B: candidate read unavailable no cofre
    const createdB = Workspace.create({ name: 'Candidate Unavailable WS' })
    expect(createdB.isSuccess()).toBe(true)
    if (createdB.isFailure()) return
    const wsB = createdB.success

    const connIdB = 'conn-unavail-1'
    wsB.createConnection(connIdB, 'mistertick-discord', profile)
    await repository.create(wsB)

    const authIdB = 'auth-unavail-1'
    const identityB: ConnectionIdentity = {
      kind: 'human',
      providerId: 'discord',
      tenantId: '1372352088457220126',
      providerSubjectId: 'user-unavail-123',
      displayName: 'User Unavail 123',
    }
    const secretRefB = CredentialReferenceFactory.create({
      ownerId: 'mistertick-discord',
      workspaceId: wsB.id,
      connectionId: connIdB,
      authorizationId: authIdB,
    })
    await vault.writeCredential(
      secretRefB,
      JSON.stringify({ token: 'initial-token-b' }),
    )
    const connectAuthB = wsB.connectAuthorization(connIdB, {
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      identity: identityB,
      authorizationId: authIdB,
      credentialReferenceId: secretRefB.id,
    })
    expect(connectAuthB.isSuccess()).toBe(true)
    await repository.update(wsB)

    const refreshOpB = 'refresh-op-unavail-1'
    const candidateRefB = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'mistertick-discord',
      workspaceId: wsB.id,
      connectionId: connIdB,
      authorizationId: authIdB,
      operationId: refreshOpB,
    })

    await lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId: refreshOpB,
      workspaceId: wsB.id,
      connectionId: connIdB,
      authorizationId: authIdB,
      expectedAuthorizationGeneration: 1,
      expectedConnectionGeneration: 1,
      intent: 'connection.refresh',
      expectedRevision: 1,
      connectionGeneration: 1,
      reservationId: null,
      candidateReference: candidateRefB.id,
      previousReferences: [secretRefB.id],
    })
    await lifecycleRepository.advanceLifecycle(refreshOpB, 'candidate_written')

    const readSpy = vi
      .spyOn(vault, 'readCredential')
      .mockResolvedValueOnce({ kind: 'unavailable' })

    const recoveryServiceB = new RecoverConnectionLifecycleService(
      lifecycleRepository,
      vault,
      repository,
      transactionBoundary,
    )
    const resultB = await recoveryServiceB.execute()
    readSpy.mockRestore()

    expect(resultB.isFailure()).toBe(true)
    expect(resultB.failure.messageKey).toBe('CREDENTIALS_VAULT_UNAVAILABLE')

    const wsInDbB = (await repository.getById(wsB.id)).success
    expect(wsInDbB).toBeDefined()
    if (!wsInDbB) return
    const connInDbB = wsInDbB.connections.find((c) => c.id === connIdB)
    expect(connInDbB).toBeDefined()
    if (!connInDbB) return
    const authInDbB = connInDbB.authorizations.find(
      (a) => a.authorizationId === authIdB,
    )
    expect(authInDbB).toBeDefined()
    if (!authInDbB) return
    expect(authInDbB.status).toBe('active')

    const journalRowB = await repository
      .db('workspace_journal')
      .where({ operation_id: refreshOpB })
      .first()
    expect(journalRowB?.phase).toBe('candidate_written')
    expect(journalRowB?.status).toBe('pending')
  })

  it('update forward falha + mark update falha (CAS/DB) mantem journal recuperavel sem falso sucesso', async () => {
    const created = Workspace.create({ name: 'Forward Failure WS' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success

    const connInstanceId = 'conn-forward-fail-1'
    workspace.createConnection(connInstanceId, 'mistertick-discord', profile)
    await repository.create(workspace)

    const authId = 'auth-forward-fail-1'
    const identity: ConnectionIdentity = {
      kind: 'human',
      providerId: 'discord',
      tenantId: '1372352088457220126',
      providerSubjectId: 'user-fail-123',
      displayName: 'User Fail 123',
    }
    const secretRef = CredentialReferenceFactory.create({
      ownerId: 'mistertick-discord',
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: authId,
    })
    await vault.writeCredential(
      secretRef,
      JSON.stringify({ token: 'initial-token' }),
    )
    const connectAuth = workspace.connectAuthorization(connInstanceId, {
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      identity,
      authorizationId: authId,
      credentialReferenceId: secretRef.id,
    })
    expect(connectAuth.isSuccess()).toBe(true)
    await repository.update(workspace)

    const refreshOpId = 'refresh-op-forward-fail-1'
    const candidateRef = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'mistertick-discord',
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: authId,
      operationId: refreshOpId,
    })
    await vault.writeCredential(
      candidateRef,
      JSON.stringify({ token: 'candidate-token' }),
    )

    await lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId: refreshOpId,
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: authId,
      expectedAuthorizationGeneration: 1,
      expectedConnectionGeneration: 1,
      intent: 'connection.refresh',
      expectedRevision: 1,
      connectionGeneration: 1,
      reservationId: null,
      candidateReference: candidateRef.id,
      previousReferences: [secretRef.id],
    })
    await lifecycleRepository.advanceLifecycle(refreshOpId, 'candidate_written')

    const updateSpy = vi
      .spyOn(SQLiteWorkspacesRepository.prototype, 'update')
      .mockImplementation(async () =>
        Either.failure(AppError.Internal('DB_PERSISTENCE_FAILED')),
      )

    const recoveryService = new RecoverConnectionLifecycleService(
      lifecycleRepository,
      vault,
      repository,
      transactionBoundary,
    )
    const recoveryResult = await recoveryService.execute()
    updateSpy.mockRestore()

    expect(recoveryResult.isFailure()).toBe(true)
    expect(recoveryResult.failure.messageKey).toBe('DB_PERSISTENCE_FAILED')

    const journalRow = await repository
      .db('workspace_journal')
      .where({ operation_id: refreshOpId })
      .first()
    expect(journalRow?.phase).toBe('candidate_written')
    expect(journalRow?.status).toBe('pending')
  })

  it('cofre indisponivel em descarte mantem candidate_cleanup_pending recuperavel', async () => {
    const created = Workspace.create({ name: 'Discard Unavailable WS' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success

    const connInstanceId = 'conn-discard-unavail-1'
    workspace.createConnection(connInstanceId, 'mistertick-discord', profile)
    await repository.create(workspace)

    const authId = 'auth-discard-unavail-1'
    const identity: ConnectionIdentity = {
      kind: 'human',
      providerId: 'discord',
      tenantId: '1372352088457220126',
      providerSubjectId: 'user-discard-123',
      displayName: 'User Discard 123',
    }
    const secretRef = CredentialReferenceFactory.create({
      ownerId: 'mistertick-discord',
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: authId,
    })
    await vault.writeCredential(
      secretRef,
      JSON.stringify({ token: 'initial-token' }),
    )
    const connectAuth = workspace.connectAuthorization(connInstanceId, {
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      identity,
      authorizationId: authId,
      credentialReferenceId: secretRef.id,
    })
    expect(connectAuth.isSuccess()).toBe(true)
    workspace.disconnectConnection(connInstanceId)
    await repository.update(workspace)

    const refreshOpId = 'refresh-op-discard-unavail-1'
    const candidateRef = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'mistertick-discord',
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: authId,
      operationId: refreshOpId,
    })
    await vault.writeCredential(
      candidateRef,
      JSON.stringify({ token: 'candidate-token' }),
    )

    await lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId: refreshOpId,
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: authId,
      expectedAuthorizationGeneration: 1,
      expectedConnectionGeneration: 1,
      intent: 'connection.refresh',
      expectedRevision: 1,
      connectionGeneration: 1,
      reservationId: null,
      candidateReference: candidateRef.id,
      previousReferences: [secretRef.id],
    })
    await lifecycleRepository.advanceLifecycle(refreshOpId, 'candidate_written')

    const removeSpy = vi
      .spyOn(vault, 'removeCredential')
      .mockResolvedValueOnce({ kind: 'unavailable' })

    const recoveryService = new RecoverConnectionLifecycleService(
      lifecycleRepository,
      vault,
      repository,
      transactionBoundary,
    )
    const firstResult = await recoveryService.execute()
    removeSpy.mockRestore()

    expect(firstResult.isFailure()).toBe(true)
    expect(firstResult.failure.messageKey).toBe('CREDENTIALS_VAULT_UNAVAILABLE')

    const intermediateRow = await repository
      .db('workspace_journal')
      .where({ operation_id: refreshOpId })
      .first()
    expect(intermediateRow?.phase).toBe('candidate_cleanup_pending')
    expect(intermediateRow?.status).toBe('pending')

    const secondResult = await recoveryService.execute()
    expect(secondResult.isSuccess()).toBe(true)

    expect(vault.storage.has(candidateRef.id)).toBe(false)
    const finalRow = await repository
      .db('workspace_journal')
      .where({ operation_id: refreshOpId })
      .first()
    expect(finalRow?.status).toBe('aborted')
  })

  it('recovery com CAS falho NAO descarta candidato ja confirmado concorrentemente por outra execucao', async () => {
    const created = Workspace.create({ name: 'Concurrent Confirmation WS' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success

    const connInstanceId = 'conn-concurrent-1'
    workspace.createConnection(connInstanceId, 'mistertick-discord', profile)
    await repository.create(workspace)

    const authId = 'auth-concurrent-1'
    const identity: ConnectionIdentity = {
      kind: 'human',
      providerId: 'discord',
      tenantId: '1372352088457220126',
      providerSubjectId: 'user-concurrent-123',
      displayName: 'User Concurrent 123',
    }
    const secretRef = CredentialReferenceFactory.create({
      ownerId: 'mistertick-discord',
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: authId,
    })
    await vault.writeCredential(
      secretRef,
      JSON.stringify({ token: 'initial-token' }),
    )
    const connectAuth = workspace.connectAuthorization(connInstanceId, {
      authorizationRole: 'primary',
      authProfileId: 'discord-oauth',
      identity,
      authorizationId: authId,
      credentialReferenceId: secretRef.id,
    })
    expect(connectAuth.isSuccess()).toBe(true)
    await repository.update(workspace)

    const refreshOpId = 'refresh-op-concurrent-1'
    const candidateRef = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'mistertick-discord',
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: authId,
      operationId: refreshOpId,
    })
    await vault.writeCredential(
      candidateRef,
      JSON.stringify({ token: 'candidate-token' }),
    )

    await lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId: refreshOpId,
      workspaceId: workspace.id,
      connectionId: connInstanceId,
      authorizationId: authId,
      expectedAuthorizationGeneration: 1,
      expectedConnectionGeneration: 1,
      intent: 'connection.refresh',
      expectedRevision: 1,
      connectionGeneration: 1,
      reservationId: null,
      candidateReference: candidateRef.id,
      previousReferences: [secretRef.id],
    })
    await lifecycleRepository.advanceLifecycle(refreshOpId, 'candidate_written')

    // Uma execucao paralela do recovery tenta o forward commit, mas sofre erro de transacao (CAS conflict / concurrent write)
    // Intercalacao: enquanto esta transacao falha, outra execucao concorrente comitou o mesmo candidato no Workspace
    let casConflictTriggered = false
    const boundarySpy = vi
      .spyOn(transactionBoundary, 'runInTransaction')
      .mockImplementationOnce(async () => {
        casConflictTriggered = true
        const wsInDbResult = await repository.getById(workspace.id)
        if (wsInDbResult.isSuccess() && wsInDbResult.success) {
          wsInDbResult.success.connectAuthorization(connInstanceId, {
            authorizationRole: 'primary',
            authProfileId: 'discord-oauth',
            identity,
            authorizationId: authId,
            credentialReferenceId: candidateRef.id,
          })
          await repository.update(wsInDbResult.success)
        }
        return Either.failure(AppError.Http(409, 'CAS_CONFLICT'))
      })

    const recoveryService = new RecoverConnectionLifecycleService(
      lifecycleRepository,
      vault,
      repository,
      transactionBoundary,
    )
    const recoveryResult = await recoveryService.execute()
    boundarySpy.mockRestore()

    expect(casConflictTriggered).toBe(true)

    // O recovery DEVE ter sucesso completando a operacao em vez de descartar o candidato ativo!
    expect(recoveryResult.isSuccess()).toBe(true)

    // O candidato NAO foi descartado do cofre
    expect(vault.storage.has(candidateRef.id)).toBe(true)

    // A credencial anterior foi limpa do cofre
    expect(vault.storage.has(secretRef.id)).toBe(false)

    // O journal foi concluido
    const finalRow = await repository
      .db('workspace_journal')
      .where({ operation_id: refreshOpId })
      .first()
    expect(finalRow?.phase).toBe('metadata_committed')
    expect(finalRow?.status).toBe('completed')
  })
})
