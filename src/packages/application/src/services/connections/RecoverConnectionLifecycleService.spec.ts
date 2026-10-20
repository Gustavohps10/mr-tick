import type { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { beforeEach, describe, expect, it } from 'vitest'

import type {
  CredentialReference,
  CredentialVaultMutationResult,
  CredentialVaultReadResult,
  IConnectionCredentialsVault,
  IConnectionLifecycleRepository,
  IConnectionLifecycleTransactionBoundary,
  IWorkspacesRepository,
  WorkspaceJournalEntry,
  WorkspaceLifecycleOperation,
} from '@/contracts'
import { CredentialReferenceFactory } from '@/utils/credential-reference'

import { RecoverConnectionLifecycleService } from './RecoverConnectionLifecycleService'

class FakeTransactionBoundary implements IConnectionLifecycleTransactionBoundary {
  constructor(
    private readonly workspaces: FakeWorkspacesRepository,
    private readonly lifecycle: FakeConnectionLifecycleRepository,
  ) {}

  public async runInTransaction<T>(
    operation: (repos: {
      workspaces: IWorkspacesRepository
      lifecycle: IConnectionLifecycleRepository
    }) => Promise<Either<AppError, T>>,
  ): Promise<Either<AppError, T>> {
    return operation({
      workspaces: this.workspaces,
      lifecycle: this.lifecycle,
    })
  }
}

class FakeWorkspacesRepository implements IWorkspacesRepository {
  public workspaceToReturn: Workspace | undefined = undefined

  public async create(): Promise<Either<AppError, void>> {
    return Either.success()
  }

  public async getById(
    _id: string,
  ): Promise<Either<AppError, Workspace | undefined>> {
    return Either.success(this.workspaceToReturn)
  }

  public async list(): Promise<
    Either<
      AppError,
      { items: Workspace[]; total: number; page: number; pageSize: number }
    >
  > {
    return Either.success({ items: [], total: 0, page: 1, pageSize: 0 })
  }

  public async update(): Promise<Either<AppError, void>> {
    return Either.success()
  }

  public async remove(): Promise<Either<AppError, void>> {
    return Either.success()
  }
}

class FakeConnectionLifecycleRepository implements IConnectionLifecycleRepository {
  public entriesToRecover: WorkspaceJournalEntry[] = []
  public readonly finishLifecycleCalls: string[] = []
  public readonly advanceLifecycleCalls: Array<{
    operationId: string
    phase: string
  }> = []

  public async inspectRecovery(): Promise<
    Either<AppError, WorkspaceJournalEntry[]>
  > {
    return Either.success(this.entriesToRecover)
  }

  public async finishLifecycle(
    operationId: string,
  ): Promise<Either<AppError, void>> {
    this.finishLifecycleCalls.push(operationId)
    return Either.success()
  }

  public async advanceLifecycle(
    operationId: string,
    phase:
      'candidate_written' | 'cleanup_pending' | 'candidate_cleanup_pending',
  ): Promise<Either<AppError, void>> {
    this.advanceLifecycleCalls.push({ operationId, phase })
    return Either.success()
  }

  public async abortPending(
    _operationId: string,
  ): Promise<Either<AppError, void>> {
    return Either.success()
  }

  public async beginLifecycle(
    _operation: WorkspaceLifecycleOperation,
  ): Promise<Either<AppError, void>> {
    return Either.success()
  }
}

class FakeConnectionCredentialsVault implements IConnectionCredentialsVault {
  public vaultAvailable = true
  public readonly removedReferences: CredentialReference[] = []

  public async readCredential(
    _reference: CredentialReference,
  ): Promise<CredentialVaultReadResult> {
    if (!this.vaultAvailable) {
      return { kind: 'unavailable' }
    }
    return { kind: 'absent' }
  }

  public async writeCredential(
    _reference: CredentialReference,
    _token: string,
  ): Promise<CredentialVaultMutationResult> {
    if (!this.vaultAvailable) {
      return { kind: 'unavailable' }
    }
    return { kind: 'completed' }
  }

  public async removeCredential(
    reference: CredentialReference,
  ): Promise<CredentialVaultMutationResult> {
    if (!this.vaultAvailable) {
      return { kind: 'unavailable' }
    }
    this.removedReferences.push(reference)
    return { kind: 'completed' }
  }
}

describe('RecoverConnectionLifecycleService', () => {
  let sut: RecoverConnectionLifecycleService
  let repository: FakeConnectionLifecycleRepository
  let vault: FakeConnectionCredentialsVault
  let workspacesRepository: FakeWorkspacesRepository

  beforeEach(() => {
    repository = new FakeConnectionLifecycleRepository()
    vault = new FakeConnectionCredentialsVault()
    workspacesRepository = new FakeWorkspacesRepository()
    sut = new RecoverConnectionLifecycleService(
      repository,
      vault,
      workspacesRepository,
      new FakeTransactionBoundary(workspacesRepository, repository),
    )
  })

  it('retries vault cleanup for an entry in cleanup_pending and finishes lifecycle upon success', async () => {
    const reference = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'addon-1',
      workspaceId: 'ws-1',
      connectionId: 'conn-1',
      authorizationId: 'auth-1',
      operationId: 'op-1',
    })

    const journalEntry: WorkspaceJournalEntry = {
      kind: 'lifecycle',
      operationId: 'op-retry-1',
      workspaceId: 'ws-1',
      connectionId: 'conn-1',
      intent: 'connection.unlink',
      phase: 'cleanup_pending',
      reservationId: null,
      candidateReference: null,
      previousReferences: [reference.id],
      expectedRevision: 1,
      attempts: 1,
      cleanupPending: true,
      status: 'pending',
    }

    repository.entriesToRecover = [journalEntry]
    vault.vaultAvailable = true

    const result = await sut.execute()

    expect(result.isSuccess()).toBe(true)
    expect(vault.removedReferences).toHaveLength(1)
    expect(vault.removedReferences[0].id).toBe(reference.id)
    expect(repository.finishLifecycleCalls).toEqual(['op-retry-1'])
    expect(repository.advanceLifecycleCalls).toHaveLength(0)
  })

  it('keeps entry in cleanup_pending when vault remains unavailable during retry', async () => {
    const reference = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'addon-1',
      workspaceId: 'ws-1',
      connectionId: 'conn-1',
      authorizationId: 'auth-1',
      operationId: 'op-1',
    })

    const journalEntry: WorkspaceJournalEntry = {
      kind: 'lifecycle',
      operationId: 'op-retry-2',
      workspaceId: 'ws-1',
      connectionId: 'conn-1',
      intent: 'delete',
      phase: 'cleanup_pending',
      reservationId: null,
      candidateReference: null,
      previousReferences: [reference.id],
      expectedRevision: 1,
      attempts: 1,
      cleanupPending: true,
      status: 'pending',
    }

    repository.entriesToRecover = [journalEntry]
    vault.vaultAvailable = false

    const result = await sut.execute()

    expect(result.isSuccess()).toBe(true)
    expect(vault.removedReferences).toHaveLength(0)
    expect(repository.advanceLifecycleCalls).toEqual([
      { operationId: 'op-retry-2', phase: 'cleanup_pending' },
    ])
    expect(repository.finishLifecycleCalls).toHaveLength(0)
  })
})
