import { ConnectionIdentity, Workspace } from '@mr-tick/domain'
import {
  AppError,
  Either,
  isNonEmptyString,
  isRecord,
} from '@mr-tick/shared/helpers'

import {
  ConnectionCredentialOperation,
  ConnectionLifecycleAuthentication,
  ConnectionSlotReservation,
  CoreConnectionScope,
  IAddonAuthenticatorRegistry,
  IConnectionCredentialsVault,
  IConnectionLifecycleCoordinator,
  IConnectionLifecycleRepository,
  IConnectionLifecycleTransactionBoundary,
  IConnectionPendingWorkGuard,
  IConnectionReservationRepository,
  IWorkspacesRepository,
} from '@/contracts'
import type {
  AddonConnectionAuthenticator,
  AuthenticationResult,
  ConnectionConfigPayload,
} from '@/contracts/core/IAddonConnectionAuthenticator'
import {
  CredentialReference,
  CredentialReferenceFactory,
} from '@/utils/credential-reference'

/** Owns the atomic slot, journal, credential, and metadata lifecycle. */
export class ConnectionLifecycleCoordinator implements IConnectionLifecycleCoordinator {
  private readonly inFlightRefreshes = new Map<
    string,
    Promise<Either<AppError, void>>
  >()
  private readonly quarantinedAuthorizations = new Map<string, number>()

  constructor(
    private readonly credentialsVault: IConnectionCredentialsVault,
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly lifecycleRepository: IConnectionLifecycleRepository,
    private readonly reservationRepository: IConnectionReservationRepository,
    private readonly pendingWorkGuard: IConnectionPendingWorkGuard,
    private readonly transactionBoundary: IConnectionLifecycleTransactionBoundary,
    private readonly authenticatorRegistry: IAddonAuthenticatorRegistry,
  ) {}

  public async create(
    input: Parameters<IConnectionLifecycleCoordinator['create']>[0],
  ): Promise<Either<AppError, Workspace>> {
    const workspaceResult = await this.workspacesRepository.getById(
      input.workspaceId,
    )
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (workspace === undefined)
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

    const reservation = this.reservation(input)
    const reserved =
      await this.reservationRepository.reserveConnectionSlot(reservation)
    if (reserved.isFailure()) return reserved.forwardFailure()

    const linked = workspace.createConnection(
      input.connectionInstanceId,
      input.addonId,
      input.profile,
    )
    if (linked.isFailure()) {
      const released =
        await this.reservationRepository.releaseConnectionSlot(reservation)
      if (released.isFailure()) return released.forwardFailure()
      return linked.forwardFailure()
    }

    let saved = await this.workspacesRepository.update(workspace)
    if (saved.isFailure() && saved.failure.statusCode === 409) {
      const latestResult = await this.workspacesRepository.getById(
        input.workspaceId,
      )
      if (latestResult.isSuccess() && latestResult.success !== undefined) {
        const latestWorkspace = latestResult.success
        const retryLinked = latestWorkspace.createConnection(
          input.connectionInstanceId,
          input.addonId,
          input.profile,
        )
        if (retryLinked.isSuccess()) {
          saved = await this.workspacesRepository.update(latestWorkspace)
          if (saved.isSuccess()) {
            return Either.success(latestWorkspace)
          }
        }
      }
    }
    if (saved.isFailure()) {
      const released =
        await this.reservationRepository.releaseConnectionSlot(reservation)
      if (released.isFailure()) return released.forwardFailure()
      return saved.forwardFailure()
    }

    return Either.success(workspace)
  }

  public async connect(
    input: Parameters<IConnectionLifecycleCoordinator['connect']>[0],
  ): Promise<Either<AppError, ConnectionLifecycleAuthentication>> {
    const workspaceResult = await this.workspacesRepository.getById(
      input.workspaceId,
    )
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (workspace === undefined)
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

    const connection = workspace.connections.find(
      (item) => item.id === input.connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))
    if (connection.addonId !== input.addonId)
      return Either.failure(
        AppError.Http(409, 'CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
      )
    if (
      connection.addonId !== input.addonId ||
      connection.connectionProfileId !== input.profile.connectionProfileId ||
      connection.cardinality !== input.profile.cardinality
    )
      return Either.failure(
        AppError.ValidationError('CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
      )

    const reservationResult =
      await this.reservationRepository.findConnectionReservation({
        workspaceId: input.workspaceId,
        addonId: input.addonId,
        connectionProfileId: input.profile.connectionProfileId,
        connectionId: input.connectionInstanceId,
      })
    if (reservationResult.isFailure()) return reservationResult.forwardFailure()
    const reservation = reservationResult.success
    if (reservation === undefined || reservation.status !== 'confirmed')
      return Either.failure(
        AppError.ValidationError('CONNECTION_RESERVATION_NOT_FOUND'),
      )

    if (input.method === 'none') {
      const operationId = crypto.randomUUID()
      const intent = await this.lifecycleRepository.beginLifecycle({
        kind: 'lifecycle',
        operationId,
        workspaceId: input.workspaceId,
        connectionId: input.connectionInstanceId,
        intent: 'connection.connect',
        expectedRevision: connection.generation,
        connectionGeneration: connection.generation,
        reservationId: reservation.reservationId,
        candidateReference: null,
        previousReferences: [],
      })
      if (intent.isFailure()) return intent.forwardFailure()

      const connected = workspace.connectNone(
        input.connectionInstanceId,
        input.configuration,
      )
      if (connected.isFailure()) {
        const aborted = await this.lifecycleRepository.abortPending(operationId)
        if (aborted.isFailure()) return aborted.forwardFailure()
        return connected.forwardFailure()
      }

      const commitResult = await this.transactionBoundary.runInTransaction(
        async ({ workspaces, lifecycle }) => {
          const updateResult = await workspaces.update(workspace)
          if (updateResult.isFailure()) return updateResult.forwardFailure()

          const finished = await lifecycle.finishLifecycle(operationId)
          if (finished.isFailure()) return finished.forwardFailure()

          return Either.success(undefined)
        },
      )
      if (commitResult.isFailure()) return commitResult.forwardFailure()

      return Either.success({ kind: 'none' })
    }

    const role = input.authorizationRole.trim()
    if (role.length === 0) {
      return Either.failure(
        AppError.ValidationError('AUTHORIZATION_ROLE_REQUIRED'),
      )
    }

    const authProfileId = input.authProfileId.trim()
    if (authProfileId.length === 0) {
      return Either.failure(
        AppError.ValidationError('AUTH_PROFILE_ID_REQUIRED'),
      )
    }

    if (input.profile.roles !== undefined && input.profile.roles.length > 0) {
      const requirement = input.profile.roles.find(
        (candidate) => candidate.authorizationRole === role,
      )
      if (requirement === undefined) {
        return Either.failure(
          AppError.ValidationError('AUTHORIZATION_ROLE_NOT_DECLARED'),
        )
      }
      if (!requirement.allowedAuthProfileIds.includes(authProfileId)) {
        return Either.failure(
          AppError.ValidationError('AUTH_PROFILE_NOT_ALLOWED_FOR_ROLE'),
        )
      }
    }

    const existingAuth = connection.authorizations.find(
      (candidate) => candidate.authorizationRole === role,
    )
    const currentConnectionGeneration = connection.generation
    const currentAuthGen =
      existingAuth !== undefined ? existingAuth.generation : 0
    const currentAuthIdentifier = existingAuth?.authorizationId

    if (input.correlation !== undefined) {
      if (
        currentConnectionGeneration !== input.correlation.connectionGeneration
      ) {
        return Either.failure(
          AppError.Http(409, 'CONNECTION_DISCONNECTED_OR_CHANGED'),
        )
      }
      if (currentAuthGen !== input.correlation.authorizationGeneration) {
        return Either.failure(
          AppError.Http(409, 'AUTHORIZATION_DISCONNECTED_OR_CHANGED'),
        )
      }
      if (
        input.correlation.authorizationId !== undefined &&
        currentAuthIdentifier !== input.correlation.authorizationId
      ) {
        return Either.failure(
          AppError.Http(409, 'AUTHORIZATION_DISCONNECTED_OR_CHANGED'),
        )
      }
    }

    const authorizationId =
      existingAuth !== undefined
        ? existingAuth.authorizationId
        : crypto.randomUUID()
    const operationId = crypto.randomUUID()
    const candidate = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: input.addonId,
      workspaceId: input.workspaceId,
      connectionId: input.connectionInstanceId,
      authorizationId,
      operationId,
    })
    const previousReferences =
      existingAuth !== undefined &&
      existingAuth.credentialReferenceId !== undefined
        ? [existingAuth.credentialReferenceId]
        : []

    const intent = await this.lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId,
      workspaceId: input.workspaceId,
      connectionId: input.connectionInstanceId,
      intent: 'connection.connect',
      expectedRevision: connection.generation,
      connectionGeneration: connection.generation,
      reservationId: reservation.reservationId,
      candidateReference: candidate.id,
      previousReferences,
    })
    if (intent.isFailure()) {
      return intent.forwardFailure()
    }

    const authentication = await input.authenticate()
    if (authentication.isFailure()) {
      const aborted = await this.lifecycleRepository.abortPending(operationId)
      if (aborted.isFailure()) return aborted.forwardFailure()
      return authentication.forwardFailure()
    }

    const written = await this.credentialsVault.writeCredential(
      candidate,
      JSON.stringify(authentication.success.credentials),
    )
    if (written.kind === 'unavailable') {
      const pending = await this.lifecycleRepository.advanceLifecycle(
        operationId,
        'candidate_cleanup_pending',
      )
      if (pending.isFailure()) return pending.forwardFailure()
      return Either.failure(AppError.Internal('CREDENTIALS_VAULT_UNAVAILABLE'))
    }

    const advanced = await this.lifecycleRepository.advanceLifecycle(
      operationId,
      'candidate_written',
    )
    if (advanced.isFailure())
      return this.cleanupCandidateFailure(
        operationId,
        candidate,
        advanced.failure,
      )

    const currentWorkspaceResult = await this.workspacesRepository.getById(
      input.workspaceId,
    )
    if (currentWorkspaceResult.isFailure())
      return this.cleanupCandidateFailure(
        operationId,
        candidate,
        currentWorkspaceResult.failure,
      )
    const currentWorkspace = currentWorkspaceResult.success
    if (currentWorkspace === undefined)
      return this.cleanupCandidateFailure(
        operationId,
        candidate,
        AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'),
      )

    const expectedConnectionGeneration =
      input.correlation !== undefined
        ? input.correlation.connectionGeneration
        : connection.generation
    const currentConnection = currentWorkspace.connections.find(
      (item) => item.id === input.connectionInstanceId,
    )
    if (
      currentConnection === undefined ||
      currentConnection.generation !== expectedConnectionGeneration
    )
      return this.cleanupCandidateFailure(
        operationId,
        candidate,
        AppError.Http(409, 'CONNECTION_DISCONNECTED_OR_CHANGED'),
      )

    const currentAuth = currentConnection.authorizations.find(
      (candidateAuth) => candidateAuth.authorizationRole === role,
    )
    const currentAuthGeneration =
      currentAuth !== undefined ? currentAuth.generation : 0
    const currentAuthId =
      currentAuth !== undefined ? currentAuth.authorizationId : undefined
    const expectedAuthGeneration =
      input.correlation !== undefined
        ? input.correlation.authorizationGeneration
        : existingAuth !== undefined
          ? existingAuth.generation
          : 0
    const expectedAuthId =
      input.correlation !== undefined
        ? input.correlation.authorizationId
        : existingAuth !== undefined
          ? existingAuth.authorizationId
          : undefined

    if (
      currentAuthGeneration !== expectedAuthGeneration ||
      currentAuthId !== expectedAuthId
    ) {
      return this.cleanupCandidateFailure(
        operationId,
        candidate,
        AppError.Http(409, 'AUTHORIZATION_DISCONNECTED_OR_CHANGED'),
      )
    }

    const connected = this.applyIdentity(
      currentWorkspace,
      input.connectionInstanceId,
      authentication.success,
      authorizationId,
      role,
      authProfileId,
      candidate.id,
      input.configuration,
    )
    if (connected.isFailure())
      return this.cleanupCandidateFailure(
        operationId,
        candidate,
        connected.failure,
      )

    const commitResult = await this.transactionBoundary.runInTransaction(
      async ({ workspaces, lifecycle }) => {
        const updateResult = await workspaces.update(currentWorkspace)
        if (updateResult.isFailure()) return updateResult.forwardFailure()

        const advanced = await lifecycle.advanceLifecycle(
          operationId,
          'metadata_committed',
        )
        if (advanced.isFailure()) return advanced.forwardFailure()

        return Either.success(undefined)
      },
    )
    if (commitResult.isFailure()) {
      return this.cleanupCandidateFailure(
        operationId,
        candidate,
        commitResult.failure,
      )
    }

    if (previousReferences.length > 0) {
      for (const prevRefId of previousReferences) {
        const oldRef = CredentialReferenceFactory.fromId(prevRefId)
        if (oldRef === undefined) {
          const pending = await this.lifecycleRepository.advanceLifecycle(
            operationId,
            'cleanup_pending',
          )
          if (pending.isFailure()) return pending.forwardFailure()
          return Either.failure(
            AppError.Internal('CORRUPTED_CREDENTIAL_REFERENCE'),
          )
        }
        const removal = await this.credentialsVault.removeCredential(oldRef)
        if (removal.kind === 'unavailable') {
          const pending = await this.lifecycleRepository.advanceLifecycle(
            operationId,
            'cleanup_pending',
          )
          if (pending.isFailure()) return pending.forwardFailure()
          return Either.success({
            kind: 'identity',
            identity: authentication.success.identity,
          })
        }
      }
    }

    const finished = await this.lifecycleRepository.finishLifecycle(operationId)
    if (finished.isFailure()) return finished.forwardFailure()

    const quarantineKey = this.getQuarantineKey(
      input.workspaceId,
      input.connectionInstanceId,
      authorizationId,
    )
    this.quarantinedAuthorizations.delete(quarantineKey)

    return Either.success({
      kind: 'identity',
      identity: authentication.success.identity,
    })
  }

  public async withCredentials(input: {
    addonId: string
    scope: CoreConnectionScope & { authorizationRole: string }
    operation: ConnectionCredentialOperation
  }): Promise<Either<AppError, void>> {
    if (!input.addonId.trim())
      return Either.failure(AppError.ValidationError('ADDON_ID_REQUIRED'))
    if (
      !input.scope.workspaceId.trim() ||
      !input.scope.connectionInstanceId.trim()
    )
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    const role = input.scope.authorizationRole.trim()
    if (!role)
      return Either.failure(
        AppError.ValidationError('AUTHORIZATION_ROLE_REQUIRED'),
      )

    const workspaceResult = await this.workspacesRepository.getById(
      input.scope.workspaceId,
    )
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (workspace === undefined)
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

    const connection = workspace.connections.find(
      (item) => item.id === input.scope.connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))
    if (connection.addonId !== input.addonId)
      return Either.failure(
        AppError.Http(409, 'CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
      )
    if (connection.status !== 'connected')
      return Either.failure(
        AppError.ValidationError('CONNECTION_NOT_CONNECTED'),
      )

    const authorization = connection.authorizations.find(
      (candidate) => candidate.authorizationRole === role,
    )
    if (authorization === undefined)
      return Either.failure(
        AppError.ValidationError('AUTHORIZATION_ROLE_NOT_FOUND'),
      )
    if (authorization.credentialReferenceId === undefined)
      return Either.failure(
        AppError.ValidationError('CONNECTION_CREDENTIALS_ABSENT'),
      )

    const reference = CredentialReferenceFactory.fromId(
      authorization.credentialReferenceId,
    )
    if (reference === undefined)
      return Either.failure(
        AppError.ValidationError('CONNECTION_CREDENTIALS_INVALID'),
      )
    const parsedRef =
      CredentialReferenceFactory.parseConnectionReference(reference)
    if (parsedRef !== undefined && parsedRef.ownerId !== input.addonId)
      return Either.failure(
        AppError.Http(409, 'CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
      )

    const readResult = await this.credentialsVault.readCredential(reference)
    if (readResult.kind === 'absent')
      return Either.failure(AppError.NotFound('CONNECTION_CREDENTIALS_ABSENT'))
    if (readResult.kind === 'unavailable')
      return Either.failure(AppError.Internal('CREDENTIALS_VAULT_UNAVAILABLE'))

    const credentialsResult = parseConnectionCredentialPayload(readResult.token)
    if (credentialsResult.isFailure()) return credentialsResult.forwardFailure()

    return this.pendingWorkGuard.withNoPendingWrites(
      input.scope.workspaceId,
      [input.scope.connectionInstanceId],
      () => input.operation(credentialsResult.success),
    )
  }

  public async refresh(input: {
    addonId: string
    scope: CoreConnectionScope & { authorizationRole?: string }
  }): Promise<Either<AppError, void>> {
    const addonId = input.addonId.trim()
    if (addonId.length === 0)
      return Either.failure(AppError.ValidationError('ADDON_ID_REQUIRED'))

    const workspaceId = input.scope.workspaceId.trim()
    const connectionInstanceId = input.scope.connectionInstanceId.trim()
    if (workspaceId.length === 0 || connectionInstanceId.length === 0)
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )

    const workspaceResult = await this.workspacesRepository.getById(workspaceId)
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (workspace === undefined)
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

    const connection = workspace.connections.find(
      (item) => item.id === connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))
    if (connection.addonId !== addonId)
      return Either.failure(
        AppError.Http(409, 'CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
      )
    if (connection.status !== 'connected')
      return Either.failure(
        AppError.ValidationError('CONNECTION_NOT_CONNECTED'),
      )

    let targetRole = input.scope.authorizationRole?.trim()
    if (targetRole === undefined || targetRole.length === 0) {
      if (connection.authorizations.length === 1) {
        const singleAuth = connection.authorizations.find((item) =>
          isNonEmptyString(item.authorizationRole),
        )
        if (singleAuth !== undefined) {
          targetRole = singleAuth.authorizationRole
        }
      }
    }
    if (targetRole === undefined || targetRole.length === 0) {
      return Either.failure(
        AppError.ValidationError('AUTHORIZATION_ROLE_REQUIRED'),
      )
    }

    const authorization = connection.authorizations.find(
      (candidate) => candidate.authorizationRole === targetRole,
    )
    if (authorization === undefined)
      return Either.failure(
        AppError.ValidationError('AUTHORIZATION_ROLE_NOT_FOUND'),
      )
    if (authorization.status === 'reauth_required')
      return Either.failure(AppError.Unauthorized('REAUTH_REQUIRED'))
    const quarantineKey = this.getQuarantineKey(
      workspaceId,
      connectionInstanceId,
      authorization.authorizationId,
    )
    const quarantinedGen = this.quarantinedAuthorizations.get(quarantineKey)
    if (quarantinedGen !== undefined) {
      if (authorization.generation <= quarantinedGen) {
        return Either.failure(AppError.Unauthorized('REAUTH_REQUIRED'))
      }
      this.quarantinedAuthorizations.delete(quarantineKey)
    }
    if (authorization.status !== 'active')
      return Either.failure(
        AppError.ValidationError('AUTHORIZATION_NOT_AUTHORIZED'),
      )
    if (authorization.credentialReferenceId === undefined)
      return Either.failure(
        AppError.ValidationError('CONNECTION_CREDENTIALS_ABSENT'),
      )

    const reference = CredentialReferenceFactory.fromId(
      authorization.credentialReferenceId,
    )
    if (reference === undefined)
      return Either.failure(
        AppError.ValidationError('CONNECTION_CREDENTIALS_INVALID'),
      )
    const parsedRef =
      CredentialReferenceFactory.parseConnectionReference(reference)
    if (parsedRef !== undefined && parsedRef.ownerId !== addonId)
      return Either.failure(
        AppError.Http(409, 'CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
      )

    const authenticator = this.authenticatorRegistry.getAuthenticator(
      addonId,
      authorization.authProfileId,
    )
    if (authenticator === undefined)
      return Either.failure(AppError.ValidationError('AUTHENTICATOR_NOT_FOUND'))
    if (authenticator.method !== 'oauth' || !authenticator.supportsRefresh)
      return Either.failure(AppError.ValidationError('REFRESH_NOT_SUPPORTED'))

    const dedupKey = `${workspaceId}:${connectionInstanceId}:${authorization.authorizationId}`
    const inFlight = this.inFlightRefreshes.get(dedupKey)
    if (inFlight !== undefined) {
      return inFlight
    }

    const expectedConnectionGeneration = connection.generation
    const expectedAuthGeneration = authorization.generation
    const authorizationId = authorization.authorizationId
    const authorizationRole = authorization.authorizationRole
    const authProfileId = authorization.authProfileId
    const identity = authorization.identity
    const previousReferenceId = authorization.credentialReferenceId
    const connectionConfig = connection.config
    const safeRole = targetRole

    const refreshPromise = this.performTokenRefresh({
      addonId,
      workspaceId,
      connectionInstanceId,
      authorizationId,
      authorizationRole,
      authProfileId,
      identity,
      previousReferenceId,
      connectionConfig,
      expectedConnectionGeneration,
      expectedAuthGeneration,
      reference,
      authenticator,
      scope: {
        workspaceId,
        connectionInstanceId,
        authorizationRole: safeRole,
      },
    }).finally(() => {
      this.inFlightRefreshes.delete(dedupKey)
    })

    this.inFlightRefreshes.set(dedupKey, refreshPromise)
    return refreshPromise
  }

  private async performTokenRefresh(params: {
    addonId: string
    workspaceId: string
    connectionInstanceId: string
    authorizationId: string
    authorizationRole: string
    authProfileId: string
    identity: ConnectionIdentity
    previousReferenceId: string
    connectionConfig?: Readonly<Record<string, string | number | boolean>>
    expectedConnectionGeneration: number
    expectedAuthGeneration: number
    reference: CredentialReference
    authenticator: Extract<
      AddonConnectionAuthenticator,
      { method: 'oauth'; supportsRefresh: true }
    >
    scope: CoreConnectionScope & { authorizationRole: string }
  }): Promise<Either<AppError, void>> {
    const operationId = crypto.randomUUID()
    const candidate = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: params.addonId,
      workspaceId: params.workspaceId,
      connectionId: params.connectionInstanceId,
      authorizationId: params.authorizationId,
      operationId,
    })

    const intent = await this.lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId,
      workspaceId: params.workspaceId,
      connectionId: params.connectionInstanceId,
      authorizationId: params.authorizationId,
      expectedAuthorizationGeneration: params.expectedAuthGeneration,
      expectedConnectionGeneration: params.expectedConnectionGeneration,
      intent: 'connection.refresh',
      expectedRevision: params.expectedConnectionGeneration,
      connectionGeneration: params.expectedConnectionGeneration,
      reservationId: null,
      candidateReference: candidate.id,
      previousReferences: [params.previousReferenceId],
    })
    if (intent.isFailure()) return intent.forwardFailure()

    const readResult = await this.credentialsVault.readCredential(
      params.reference,
    )
    if (readResult.kind === 'absent') {
      const abortResult =
        await this.lifecycleRepository.abortPending(operationId)
      if (abortResult.isFailure()) return abortResult.forwardFailure()
      return Either.failure(AppError.NotFound('CONNECTION_CREDENTIALS_ABSENT'))
    }
    if (readResult.kind === 'unavailable') {
      const abortResult =
        await this.lifecycleRepository.abortPending(operationId)
      if (abortResult.isFailure()) return abortResult.forwardFailure()
      return Either.failure(AppError.Internal('CREDENTIALS_VAULT_UNAVAILABLE'))
    }

    const credentialsResult = parseConnectionCredentialPayload(readResult.token)
    if (credentialsResult.isFailure()) {
      const abortResult =
        await this.lifecycleRepository.abortPending(operationId)
      if (abortResult.isFailure()) return abortResult.forwardFailure()
      return credentialsResult.forwardFailure()
    }

    const renewalResult = await params.authenticator.refreshToken(
      params.scope,
      credentialsResult.success,
    )
    if (renewalResult.isFailure()) {
      const renewalError = renewalResult.failure
      if (renewalError.reauthRequired || renewalError.remoteOutcomeUncertain) {
        const quarantineKey = this.getQuarantineKey(
          params.workspaceId,
          params.connectionInstanceId,
          params.authorizationId,
        )
        this.quarantinedAuthorizations.set(
          quarantineKey,
          params.expectedAuthGeneration,
        )
        const markResult = await this.markAuthReauthRequired({
          workspaceId: params.workspaceId,
          connectionId: params.connectionInstanceId,
          authorizationId: params.authorizationId,
          expectedAuthGeneration: params.expectedAuthGeneration,
        })
        if (markResult.isFailure()) return markResult.forwardFailure()
        return renewalResult.forwardFailure()
      }

      const abortResult =
        await this.lifecycleRepository.abortPending(operationId)
      if (abortResult.isFailure()) return abortResult.forwardFailure()

      return renewalResult.forwardFailure()
    }

    const postWorkspaceResult = await this.workspacesRepository.getById(
      params.workspaceId,
    )
    if (postWorkspaceResult.isFailure()) {
      return this.cleanupRefreshPostNetworkFailure(
        params,
        operationId,
        candidate,
        postWorkspaceResult.failure,
      )
    }
    const postWorkspace = postWorkspaceResult.success
    if (postWorkspace === undefined) {
      return this.cleanupRefreshPostNetworkFailure(
        params,
        operationId,
        candidate,
        AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'),
      )
    }

    const postConnection = postWorkspace.connections.find(
      (item) => item.id === params.connectionInstanceId,
    )
    if (
      postConnection === undefined ||
      postConnection.status !== 'connected' ||
      postConnection.generation !== params.expectedConnectionGeneration
    ) {
      return this.cleanupRefreshPostNetworkFailure(
        params,
        operationId,
        candidate,
        AppError.Http(409, 'CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }

    const postAuth = postConnection.authorizations.find(
      (item) => item.authorizationId === params.authorizationId,
    )
    if (
      postAuth === undefined ||
      postAuth.status !== 'active' ||
      postAuth.generation !== params.expectedAuthGeneration
    ) {
      return this.cleanupRefreshPostNetworkFailure(
        params,
        operationId,
        candidate,
        AppError.Http(409, 'AUTHORIZATION_DISCONNECTED_OR_CHANGED'),
      )
    }

    const written = await this.credentialsVault.writeCredential(
      candidate,
      JSON.stringify(renewalResult.success.credentials),
    )
    if (written.kind === 'unavailable') {
      const pending = await this.lifecycleRepository.advanceLifecycle(
        operationId,
        'candidate_cleanup_pending',
      )
      if (pending.isFailure()) return pending.forwardFailure()
      const quarantineKey = this.getQuarantineKey(
        params.workspaceId,
        params.connectionInstanceId,
        params.authorizationId,
      )
      this.quarantinedAuthorizations.set(
        quarantineKey,
        params.expectedAuthGeneration,
      )
      const markResult = await this.markAuthReauthRequired({
        workspaceId: params.workspaceId,
        connectionId: params.connectionInstanceId,
        authorizationId: params.authorizationId,
        expectedAuthGeneration: params.expectedAuthGeneration,
      })
      if (markResult.isFailure()) return markResult.forwardFailure()
      return Either.failure(AppError.Internal('CREDENTIALS_VAULT_UNAVAILABLE'))
    }

    const advanced = await this.lifecycleRepository.advanceLifecycle(
      operationId,
      'candidate_written',
    )
    if (advanced.isFailure()) {
      return this.cleanupRefreshPostNetworkFailure(
        params,
        operationId,
        candidate,
        advanced.failure,
      )
    }

    const commitWorkspaceResult = await this.workspacesRepository.getById(
      params.workspaceId,
    )
    if (commitWorkspaceResult.isFailure()) {
      return this.cleanupRefreshPostNetworkFailure(
        params,
        operationId,
        candidate,
        commitWorkspaceResult.failure,
      )
    }
    const commitWorkspace = commitWorkspaceResult.success
    if (commitWorkspace === undefined) {
      return this.cleanupRefreshPostNetworkFailure(
        params,
        operationId,
        candidate,
        AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'),
      )
    }
    const commitConnection = commitWorkspace.connections.find(
      (item) => item.id === params.connectionInstanceId,
    )
    if (
      commitConnection === undefined ||
      commitConnection.status !== 'connected' ||
      commitConnection.generation !== params.expectedConnectionGeneration
    ) {
      return this.cleanupRefreshPostNetworkFailure(
        params,
        operationId,
        candidate,
        AppError.Http(409, 'CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const commitAuth = commitConnection.authorizations.find(
      (item) => item.authorizationId === params.authorizationId,
    )
    if (
      commitAuth === undefined ||
      commitAuth.status !== 'active' ||
      commitAuth.generation !== params.expectedAuthGeneration
    ) {
      return this.cleanupRefreshPostNetworkFailure(
        params,
        operationId,
        candidate,
        AppError.Http(409, 'AUTHORIZATION_DISCONNECTED_OR_CHANGED'),
      )
    }

    const updated = commitWorkspace.connectAuthorization(
      params.connectionInstanceId,
      {
        authorizationRole: params.authorizationRole,
        authProfileId: params.authProfileId,
        identity: params.identity,
        authorizationId: params.authorizationId,
        credentialReferenceId: candidate.id,
      },
      params.connectionConfig,
    )
    if (updated.isFailure()) {
      return this.cleanupRefreshPostNetworkFailure(
        params,
        operationId,
        candidate,
        updated.failure,
      )
    }

    const commitResult = await this.transactionBoundary.runInTransaction(
      async ({ workspaces, lifecycle }) => {
        const updateResult = await workspaces.update(commitWorkspace)
        if (updateResult.isFailure()) return updateResult.forwardFailure()

        const advancedCommit = await lifecycle.advanceLifecycle(
          operationId,
          'metadata_committed',
        )
        if (advancedCommit.isFailure()) return advancedCommit.forwardFailure()

        return Either.success(undefined)
      },
    )
    if (commitResult.isFailure()) {
      return this.cleanupRefreshPostNetworkFailure(
        params,
        operationId,
        candidate,
        commitResult.failure,
      )
    }

    const oldRef = CredentialReferenceFactory.fromId(params.previousReferenceId)
    if (oldRef !== undefined) {
      const cleanupResult = await this.credentialsVault.removeCredential(oldRef)
      if (cleanupResult.kind === 'unavailable') {
        const cleanupPending = await this.lifecycleRepository.advanceLifecycle(
          operationId,
          'cleanup_pending',
        )
        if (cleanupPending.isFailure()) return cleanupPending.forwardFailure()
        return Either.failure(
          AppError.Internal('CREDENTIALS_VAULT_UNAVAILABLE'),
        )
      }
    }

    const finished = await this.lifecycleRepository.finishLifecycle(operationId)
    if (finished.isFailure()) return finished.forwardFailure()

    return Either.success(undefined)
  }

  private async markAuthReauthRequired(params: {
    workspaceId: string
    connectionId: string
    authorizationId: string
    expectedAuthGeneration: number
  }): Promise<Either<AppError, void>> {
    const wsResult = await this.workspacesRepository.getById(params.workspaceId)
    if (wsResult.isFailure()) return wsResult.forwardFailure()
    const workspace = wsResult.success
    if (workspace === undefined) {
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))
    }
    const connection = workspace.connections.find(
      (c) => c.id === params.connectionId,
    )
    if (connection === undefined) {
      return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))
    }
    const auth = connection.authorizations.find(
      (a) => a.authorizationId === params.authorizationId,
    )
    if (auth === undefined) {
      return Either.failure(AppError.NotFound('AUTHORIZATION_NOT_FOUND'))
    }
    if (auth.generation !== params.expectedAuthGeneration) {
      return Either.success(undefined)
    }
    const markResult = workspace.markAuthorizationReauthRequired(
      params.connectionId,
      params.authorizationId,
    )
    if (markResult.isFailure()) return markResult.forwardFailure()

    const updateResult = await this.workspacesRepository.update(workspace)
    if (updateResult.isFailure()) return updateResult.forwardFailure()

    return Either.success(undefined)
  }

  public async disconnect(
    input: Parameters<IConnectionLifecycleCoordinator['disconnect']>[0],
  ): Promise<Either<AppError, void>> {
    return this.pendingWorkGuard.withNoPendingWrites(
      input.workspaceId,
      [input.connectionInstanceId],
      () => this.disconnectWithoutPendingWrites(input),
    )
  }

  private async disconnectWithoutPendingWrites(
    input: Parameters<IConnectionLifecycleCoordinator['disconnect']>[0],
  ): Promise<Either<AppError, void>> {
    const recoveryResult = await this.lifecycleRepository.inspectRecovery()
    if (recoveryResult.isFailure()) return recoveryResult.forwardFailure()
    const pendingConnect = recoveryResult.success.find(
      (entry) =>
        entry.kind === 'lifecycle' &&
        entry.intent === 'connection.connect' &&
        entry.workspaceId === input.workspaceId &&
        entry.connectionId === input.connectionInstanceId &&
        (entry.status === 'pending' || entry.status === 'recovery_required'),
    )
    if (pendingConnect !== undefined) {
      if (pendingConnect.phase !== 'intent')
        return Either.failure(AppError.Http(409, 'WORKSPACE_RECOVERY_REQUIRED'))
      const aborted = await this.lifecycleRepository.abortPending(
        pendingConnect.operationId,
      )
      if (aborted.isFailure()) return aborted.forwardFailure()
    }

    const workspaceResult = await this.workspacesRepository.getById(
      input.workspaceId,
    )
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (workspace === undefined)
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

    const connection = workspace.connections.find(
      (item) => item.id === input.connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))
    if (connection.addonId !== input.addonId)
      return Either.failure(
        AppError.Http(409, 'CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
      )

    const previousReferences: CredentialReference[] = []
    if (Array.isArray(connection.authorizations)) {
      for (const auth of connection.authorizations) {
        if (auth.credentialReferenceId !== undefined) {
          const parsed = CredentialReferenceFactory.fromId(
            auth.credentialReferenceId,
          )
          if (parsed === undefined) {
            return Either.failure(
              AppError.Internal('CORRUPTED_CREDENTIAL_REFERENCE'),
            )
          }
          previousReferences.push(parsed)
        }
      }
    }

    const disconnected = workspace.disconnectConnection(
      input.connectionInstanceId,
    )
    if (disconnected.isFailure()) return disconnected.forwardFailure()

    const operationId = crypto.randomUUID()
    const intent = await this.lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId,
      workspaceId: input.workspaceId,
      connectionId: input.connectionInstanceId,
      intent: 'connection.disconnect',
      expectedRevision: connection.generation,
      connectionGeneration: connection.generation,
      reservationId: null,
      candidateReference: null,
      previousReferences: previousReferences.map((reference) => reference.id),
    })
    if (intent.isFailure()) return intent.forwardFailure()

    const updateResult = await this.workspacesRepository.update(workspace)
    if (updateResult.isFailure()) return updateResult.forwardFailure()

    const results = await Promise.all(
      previousReferences.map((reference) =>
        this.credentialsVault.removeCredential(reference),
      ),
    )
    if (results.some((result) => result.kind === 'unavailable')) {
      const pending = await this.lifecycleRepository.advanceLifecycle(
        operationId,
        'cleanup_pending',
      )
      if (pending.isFailure()) return pending.forwardFailure()
      return Either.failure(AppError.Internal('CREDENTIALS_CLEANUP_PENDING'))
    }

    const finished = await this.lifecycleRepository.finishLifecycle(operationId)
    if (finished.isFailure()) return finished.forwardFailure()

    return Either.success(undefined)
  }

  public async archive(
    input: Parameters<IConnectionLifecycleCoordinator['archive']>[0],
  ): Promise<Either<AppError, void>> {
    return this.pendingWorkGuard.withNoPendingWrites(
      input.workspaceId,
      [input.connectionInstanceId],
      () => this.archiveWithoutPendingWrites(input),
    )
  }

  private async archiveWithoutPendingWrites(
    input: Parameters<IConnectionLifecycleCoordinator['archive']>[0],
  ): Promise<Either<AppError, void>> {
    const workspaceResult = await this.workspacesRepository.getById(
      input.workspaceId,
    )
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (workspace === undefined)
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

    const connection = workspace.connections.find(
      (item) => item.id === input.connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))
    if (connection.addonId !== input.addonId)
      return Either.failure(
        AppError.Http(409, 'CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
      )

    const reservationResult =
      await this.reservationRepository.findConnectionReservation({
        workspaceId: input.workspaceId,
        addonId: input.addonId,
        connectionProfileId: connection.connectionProfileId,
        connectionId: input.connectionInstanceId,
      })
    if (reservationResult.isFailure()) return reservationResult.forwardFailure()
    const reservation = reservationResult.success
    if (reservation === undefined || reservation.status !== 'confirmed')
      return Either.failure(
        AppError.Http(409, 'CONNECTION_RESERVATION_NOT_FOUND'),
      )

    const previousReferences: CredentialReference[] = []
    if (Array.isArray(connection.authorizations)) {
      for (const auth of connection.authorizations) {
        if (auth.credentialReferenceId !== undefined) {
          const parsed = CredentialReferenceFactory.fromId(
            auth.credentialReferenceId,
          )
          if (parsed === undefined) {
            return Either.failure(
              AppError.Internal('CORRUPTED_CREDENTIAL_REFERENCE'),
            )
          }
          previousReferences.push(parsed)
        }
      }
    }

    const archived = workspace.archiveConnection(input.connectionInstanceId)
    if (archived.isFailure()) return archived.forwardFailure()

    const operationId = crypto.randomUUID()
    const intent = await this.lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId,
      workspaceId: input.workspaceId,
      connectionId: input.connectionInstanceId,
      intent: 'connection.archive',
      expectedRevision: connection.generation,
      connectionGeneration: connection.generation,
      reservationId: reservation.reservationId,
      candidateReference: null,
      previousReferences: previousReferences.map((reference) => reference.id),
    })
    if (intent.isFailure()) return intent.forwardFailure()

    const updateResult = await this.workspacesRepository.update(workspace)
    if (updateResult.isFailure()) return updateResult.forwardFailure()

    const removals = await Promise.all(
      previousReferences.map((reference) =>
        this.credentialsVault.removeCredential(reference),
      ),
    )
    if (removals.some((result) => result.kind === 'unavailable')) {
      const pending = await this.lifecycleRepository.advanceLifecycle(
        operationId,
        'cleanup_pending',
      )
      if (pending.isFailure()) return pending.forwardFailure()
      return Either.failure(AppError.Internal('CREDENTIALS_CLEANUP_PENDING'))
    }

    const finished = await this.lifecycleRepository.finishLifecycle(operationId)
    if (finished.isFailure()) return finished.forwardFailure()

    return Either.success(undefined)
  }

  public async restore(
    input: Parameters<IConnectionLifecycleCoordinator['restore']>[0],
  ): Promise<Either<AppError, Workspace>> {
    const workspaceResult = await this.workspacesRepository.getById(
      input.workspaceId,
    )
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (workspace === undefined)
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

    const connection = workspace.connections.find(
      (item) => item.id === input.connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))
    if (connection.addonId !== input.addonId)
      return Either.failure(
        AppError.Http(409, 'CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
      )

    const reservationResult =
      await this.reservationRepository.findConnectionReservation({
        workspaceId: input.workspaceId,
        addonId: input.addonId,
        connectionProfileId: connection.connectionProfileId,
        connectionId: input.connectionInstanceId,
      })
    if (reservationResult.isFailure()) return reservationResult.forwardFailure()
    const reservation = reservationResult.success
    if (reservation === undefined || reservation.status !== 'released')
      return Either.failure(
        AppError.Http(409, 'CONNECTION_RESERVATION_NOT_FOUND'),
      )

    const restored = workspace.restoreConnection(input.connectionInstanceId)
    if (restored.isFailure()) return restored.forwardFailure()

    const operationId = crypto.randomUUID()
    const intent = await this.lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId,
      workspaceId: input.workspaceId,
      connectionId: input.connectionInstanceId,
      intent: 'connection.restore',
      expectedRevision: connection.generation,
      connectionGeneration: connection.generation,
      reservationId: reservation.reservationId,
      candidateReference: null,
      previousReferences: [],
    })
    if (intent.isFailure()) return intent.forwardFailure()

    const updateResult = await this.workspacesRepository.update(workspace)
    if (updateResult.isFailure()) return updateResult.forwardFailure()

    const finished = await this.lifecycleRepository.finishLifecycle(operationId)
    if (finished.isFailure()) return finished.forwardFailure()

    return Either.success(workspace)
  }

  private reservation(
    input: Parameters<IConnectionLifecycleCoordinator['create']>[0],
  ): ConnectionSlotReservation {
    return {
      ...input.profile,
      reservationId: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      addonId: input.addonId,
      connectionId: input.connectionInstanceId,
    }
  }

  private applyIdentity(
    workspace: Workspace,
    connectionId: string,
    result: AuthenticationResult,
    authorizationId: string,
    authorizationRole: string,
    authProfileId: string,
    credentialReferenceId: string | undefined,
    configuration: Readonly<Record<string, string | number | boolean>>,
  ): Either<AppError, void> {
    if (result.kind === 'none') {
      return workspace.connectNone(connectionId, configuration)
    }
    return workspace.connectAuthorization(
      connectionId,
      {
        authorizationRole,
        authProfileId,
        identity: result.identity,
        authorizationId,
        credentialReferenceId,
      },
      configuration,
    )
  }

  private async cleanupCandidateFailure(
    operationId: string,
    candidate: ReturnType<typeof CredentialReferenceFactory.create>,
    failure: AppError,
  ): Promise<Either<AppError, never>> {
    const cleanup = await this.credentialsVault.removeCredential(candidate)
    if (cleanup.kind === 'unavailable') {
      const pending = await this.lifecycleRepository.advanceLifecycle(
        operationId,
        'candidate_cleanup_pending',
      )
      if (pending.isFailure()) return pending.forwardFailure()
      return Either.failure(AppError.Internal('CREDENTIALS_CLEANUP_PENDING'))
    }
    const recovery = await this.lifecycleRepository.inspectRecovery()
    if (recovery.isFailure()) return recovery.forwardFailure()
    const entry = recovery.success.find(
      (candidate) => candidate.operationId === operationId,
    )
    if (entry?.status === 'aborted') return Either.failure(failure)
    const aborted = await this.lifecycleRepository.abortPending(operationId)
    if (aborted.isFailure()) return aborted.forwardFailure()
    return Either.failure(failure)
  }

  private async cleanupRefreshPostNetworkFailure(
    params: {
      workspaceId: string
      connectionInstanceId: string
      authorizationId: string
      expectedAuthGeneration: number
    },
    operationId: string,
    candidate: ReturnType<
      typeof CredentialReferenceFactory.createConnectionCandidate
    >,
    failure: AppError,
  ): Promise<Either<AppError, never>> {
    const quarantineKey = this.getQuarantineKey(
      params.workspaceId,
      params.connectionInstanceId,
      params.authorizationId,
    )
    this.quarantinedAuthorizations.set(
      quarantineKey,
      params.expectedAuthGeneration,
    )

    const markResult = await this.markAuthReauthRequired({
      workspaceId: params.workspaceId,
      connectionId: params.connectionInstanceId,
      authorizationId: params.authorizationId,
      expectedAuthGeneration: params.expectedAuthGeneration,
    })
    if (markResult.isFailure()) return markResult.forwardFailure()

    return this.cleanupCandidateFailure(operationId, candidate, failure)
  }

  private getQuarantineKey(
    workspaceId: string,
    connectionId: string,
    authorizationId: string,
  ): string {
    return `${workspaceId}:${connectionId}:${authorizationId}`
  }
}

function parseConnectionCredentialPayload(
  raw: string,
): Either<AppError, ConnectionConfigPayload> {
  try {
    const parsed: object = JSON.parse(raw)
    if (!isRecord(parsed))
      return Either.failure(
        AppError.ValidationError('CONNECTION_CREDENTIALS_INVALID'),
      )
    const credentials: Record<string, string | number | boolean> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (
        key.trim().length === 0 ||
        (typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'boolean')
      )
        return Either.failure(
          AppError.ValidationError('CONNECTION_CREDENTIALS_INVALID'),
        )
      credentials[key] = value
    }
    return Either.success(credentials)
  } catch {
    return Either.failure(
      AppError.ValidationError('CONNECTION_CREDENTIALS_INVALID'),
    )
  }
}
