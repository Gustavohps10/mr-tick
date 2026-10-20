import {
  ConnectionLifecycleCoordinator,
  CredentialReferenceFactory,
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

import {
  ControlledCredentialsVault,
  createBoundaryTestSetup,
  TestAuthenticatorRegistry,
} from './ConnectionLifecycle.Boundary.fixture'
import { SQLiteConnectionLifecycleRepository } from './SQLiteConnectionLifecycleRepository'
import { SQLiteConnectionLifecycleTransactionBoundary } from './SQLiteConnectionLifecycleTransactionBoundary'
import { SQLiteConnectionReservationRepository } from './SQLiteConnectionReservationRepository'
import { SQLiteWorkspacesRepository } from './SQLiteWorkspaceRepository'

describe('Deterministic Database/Vault Boundary - Vault Errors & Quarantine', () => {
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

    // 1. Cria workspace e conecta autoriza+�+�o real no SQLite e Vault
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

    // Confirma que autoriza+�+�o est+� 'active' no SQLite real
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
        // Confirma que ANTES da rede o SQLite real j+� possui a opera+�+�o gravada na tabela workspace_journal
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

    // 4. Executa refresh: falha de grava+�+�o N+�O pode ser silenciada (Either tratado e propagado)
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

    // 5. Nova chamada na mesma sess+�o DEVE ser barrada pela quarentena em mem+�ria sem chamar rede
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
    expect(networkCallCount).toBe(1) // Provedor N+�O foi chamado novamente!

    // 6. Simula RESTART / REABERTURA do aplicativo:
    // Cria novo recovery service com o SQLite real contendo a opera+�+�o de refresh pendente gravada antes da rede
    const recoveryService = new RecoverConnectionLifecycleService(
      lifecycleRepository,
      vault,
      repository,
      transactionBoundary,
    )
    const recoveryResult = await recoveryService.execute()
    expect(recoveryResult.isSuccess()).toBe(true)

    // Ap+�s recovery, a autoriza+�+�o no SQLite real DEVE estar marcada como 'reauth_required'
    const wsInDbAfterRecovery = (await repository.getById(ws.id)).success!
    const connInDbAfter = wsInDbAfterRecovery.connections.find(
      (c) => c.id === 'conn-real-1',
    )!
    const authInDbAfter = connInDbAfter.authorizations.find(
      (a) => a.authorizationId === initialAuthId,
    )!
    expect(authInDbAfter.status).toBe('reauth_required')

    // 7. Nova inst+�ncia de coordinator ap+�s restart tamb+�m recusa refresh lendo 'reauth_required' do SQLite
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
    expect(networkCallCount).toBe(1) // Token antigo consumido NUNCA +� repetido!
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
    // Subcen+�rio A: candidate absent no cofre
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
    // N+�O grava candidateRefA no cofre (permanece absent)

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

    // Subcen+�rio B: candidate read unavailable no cofre
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
