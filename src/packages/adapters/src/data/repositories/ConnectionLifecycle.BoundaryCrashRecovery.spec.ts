import {
  ConnectionLifecycleCoordinator,
  CredentialReferenceFactory,
  RecoverConnectionLifecycleService,
} from '@mr-tick/application'
import { ConnectionProfileDescriptor, Workspace } from '@mr-tick/domain'
import { Either } from '@mr-tick/shared/helpers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ControlledCredentialsVault,
  createBoundaryTestSetup,
  dummyAuthenticatorRegistry,
} from './ConnectionLifecycle.Boundary.fixture'
import { SQLiteConnectionLifecycleRepository } from './SQLiteConnectionLifecycleRepository'
import { SQLiteConnectionLifecycleTransactionBoundary } from './SQLiteConnectionLifecycleTransactionBoundary'
import { SQLiteConnectionReservationRepository } from './SQLiteConnectionReservationRepository'
import { SQLiteWorkspacesRepository } from './SQLiteWorkspaceRepository'

describe('Deterministic Database/Vault Boundary - Crash Recovery & CAS', () => {
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

    // 2. Simula falha/crash durante performTokenRefresh ap+�s candidate_written no SQLite
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

    // 4. Invariantes p+�s-recovery:
    // O candidate novo DEVE estar preservado no cofre
    expect(vault.storage.has(candidateRef.id)).toBe(true)
    // O segredo antigo (j+� consumido remotamente) DEVE ter sido limpo do cofre
    expect(vault.storage.has(initialRefId)).toBe(false)
    // A autoriza+�+�o no SQLite agora aponta para o candidateRef.id e continua 'active'
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

    // 2. Simula crash ap+�s candidate_written
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

    // 3. Usu+�rio reautoriza a conex+�o com sucesso (connect gera nova geracao 2 e nova credencial)
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

    // 5. Invariante: a autoriza+�+�o NOVA N+�O pode ter sido rebaixada para reauth_required!
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

    // 4. Invariantes p+�s-recovery:
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
})
