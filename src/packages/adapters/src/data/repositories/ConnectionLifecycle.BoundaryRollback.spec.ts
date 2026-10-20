import {
  ConnectionLifecycleCoordinator,
  CredentialReferenceFactory,
  type IConnectionLifecycleTransactionBoundary,
  RecoverConnectionLifecycleService,
} from '@mr-tick/application'
import { ConnectionProfileDescriptor, Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ControlledCredentialsVault,
  createBoundaryTestSetup,
  dummyAuthenticatorRegistry,
} from './ConnectionLifecycle.Boundary.fixture'
import { withSafeTransaction } from './sqlite-connection'
import { SQLiteConnectionLifecycleRepository } from './SQLiteConnectionLifecycleRepository'
import { SQLiteConnectionLifecycleTransactionBoundary } from './SQLiteConnectionLifecycleTransactionBoundary'
import { SQLiteConnectionReservationRepository } from './SQLiteConnectionReservationRepository'
import { SQLiteWorkspacesRepository } from './SQLiteWorkspaceRepository'

describe('Deterministic Database/Vault Boundary - Atomic Commit & Rollback', () => {
  let repository: SQLiteWorkspacesRepository
  let lifecycleRepository: SQLiteConnectionLifecycleRepository
  let reservationRepository: SQLiteConnectionReservationRepository
  let transactionBoundary: SQLiteConnectionLifecycleTransactionBoundary
  let vault: ControlledCredentialsVault
  let profile: ConnectionProfileDescriptor

  beforeEach(() => {
    const setup = createBoundaryTestSetup()
    repository = setup.repository
    lifecycleRepository = setup.lifecycleRepository
    reservationRepository = setup.reservationRepository
    transactionBoundary = setup.transactionBoundary
    vault = setup.vault
    profile = setup.profile
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
})
