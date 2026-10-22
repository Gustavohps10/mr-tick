import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  JSONAddonSettingsRepository,
  SQLiteConnectionLifecycleRepository,
  SQLiteWorkspaceCredentialReferenceRegistry,
  SQLiteWorkspacesRepository,
} from '@mr-tick/adapters/data'
import type {
  AddonVaultScope,
  IConnectionCredentialsVault,
  ICredentialsVault,
  IFileStorage,
} from '@mr-tick/application'
import {
  CredentialReferenceFactory,
  DeleteWorkspaceService,
  RecoverAddonWorkspaceCredentialWritesService,
} from '@mr-tick/application'
import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AddonScopedVault } from './AddonScopedVault'

let temporaryDirectory: string | undefined
let activeRepositories: SQLiteWorkspacesRepository[] = []

afterEach(async () => {
  for (const repo of activeRepositories) {
    await repo.close()
  }
  activeRepositories = []
  if (temporaryDirectory === undefined) return
  const directory = path.resolve(temporaryDirectory)
  const allowedPrefix = path.resolve(os.tmpdir(), 'addon-delete-race-')
  expect(directory.startsWith(allowedPrefix)).toBe(true)
  if (!directory.startsWith(allowedPrefix)) return
  await fs.rm(directory, { recursive: true, force: true })
  temporaryDirectory = undefined
})

describe('workspace addon vault write and delete coordination', () => {
  it('blocks workspace delete until an in-flight addon secret write is finalized', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'addon-delete-race-'),
    )
    const repository = new SQLiteWorkspacesRepository(temporaryDirectory)
    activeRepositories.push(repository)
    const credentialRegistry = new SQLiteWorkspaceCredentialReferenceRegistry(
      repository.db,
    )
    const lifecycleRepository = new SQLiteConnectionLifecycleRepository(
      repository.db,
    )

    const workspace = Workspace.create({ name: 'Addon workspace' }).success
    const createResult = await repository.create(workspace)
    expect(createResult.isSuccess()).toBe(true)

    const records = new Map<string, string>()
    let signalSaveStarted: () => void = () => {}
    const saveStarted = new Promise<void>((resolve) => {
      signalSaveStarted = resolve
    })
    let releaseSave: () => void = () => {}
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    const credentials: ICredentialsVault = {
      getToken: async (service, account) => {
        const token = records.get(`${service}/${account}`)
        if (token === undefined) return { kind: 'absent' }
        return { kind: 'present', token }
      },
      saveToken: async (service, account, token) => {
        records.set(`${service}/${account}`, token)
      },
      deleteToken: async (service, account) => {
        records.delete(`${service}/${account}`)
      },
      hasToken: async (service, account) =>
        records.has(`${service}/${account}`)
          ? { kind: 'present' }
          : { kind: 'absent' },
      replaceToken: async (service, account, token) => {
        records.set(`${service}/${account}`, token)
      },
    }
    const connectionVault: IConnectionCredentialsVault = {
      readCredential: async () => ({ kind: 'absent' }),
      writeCredential: async (reference, token) => {
        signalSaveStarted()
        await saveGate
        records.set(`${reference.service}/${reference.account}`, token)
        return { kind: 'completed' }
      },
      removeCredential: async (reference) => {
        records.delete(`${reference.service}/${reference.account}`)
        return { kind: 'completed' }
      },
    }
    const addonVault = new AddonScopedVault(
      'addon-race',
      credentials,
      connectionVault,
      credentialRegistry,
      new JSONAddonSettingsRepository(temporaryDirectory),
    )
    const workspaceScope: AddonVaultScope = {
      kind: 'workspace',
      workspaceId: workspace.id,
    }
    const pendingWrite = addonVault.set(workspaceScope, 'secret', 'token')
    await saveStarted
    const pendingReferences =
      await credentialRegistry.listWorkspaceCredentialReferences(workspace.id)
    expect(pendingReferences.isSuccess()).toBe(true)
    expect(
      pendingReferences.isSuccess() &&
        pendingReferences.success.some(
          (reference) => reference.status === 'write_pending',
        ),
    ).toBe(true)

    const fileStorage: IFileStorage = {
      write: async () => {},
      read: async () => new Uint8Array(),
      exists: async () => false,
      delete: async () => {},
      getPublicUrl: () => '',
    }
    const deleteWorkspace = new DeleteWorkspaceService(
      repository,
      lifecycleRepository,
      credentialRegistry,
      fileStorage,
      connectionVault,
      {
        withNoPendingWrites: (_workspaceId, _connectionIds, operation) =>
          operation(),
      },
    )
    const deleteWhileWritePending = await deleteWorkspace.execute({
      workspaceId: workspace.id,
    })

    expect(deleteWhileWritePending.isFailure()).toBe(true)
    if (deleteWhileWritePending.isSuccess())
      return expect.fail('Delete must wait for the pending secret write')
    expect(deleteWhileWritePending.failure.messageKey).toBe(
      'ADDON_CREDENTIAL_WRITE_PENDING',
    )

    releaseSave()
    expect((await pendingWrite).isSuccess()).toBe(true)
    const completedDelete = await deleteWorkspace.execute({
      workspaceId: workspace.id,
    })
    expect(completedDelete.isSuccess()).toBe(true)
    const addonReference = CredentialReferenceFactory.createAddonWorkspace(
      'addon-race',
      workspace.id,
    )
    expect(
      records.has(`${addonReference.service}/${addonReference.account}`),
    ).toBe(false)
    const finalRecord = await repository.getById(workspace.id)
    expect(finalRecord.isSuccess()).toBe(true)
    expect(finalRecord.isSuccess() && finalRecord.success).toBeUndefined()
  })

  it('recovers a failed candidate write without replacing the previous authorization', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'addon-delete-race-'),
    )
    const repository = new SQLiteWorkspacesRepository(temporaryDirectory)
    activeRepositories.push(repository)
    const credentialRegistry = new SQLiteWorkspaceCredentialReferenceRegistry(
      repository.db,
    )
    const workspace = Workspace.create({ name: 'Addon recovery' }).success
    const createResult = await repository.create(workspace)
    expect(createResult.isSuccess()).toBe(true)

    const records = new Map<string, string>()
    const previous = CredentialReferenceFactory.createAddonWorkspace(
      'addon-recovery',
      workspace.id,
    )
    records.set(`${previous.service}/${previous.account}`, '{"token":"old"}')
    const previousReservation = {
      workspaceId: workspace.id,
      ownerId: 'addon-recovery',
      logicalReferenceId: previous.id,
      candidateReferenceId: previous.id,
      previousReferenceId: null,
    }
    expect(
      (
        await credentialRegistry.reserveWorkspaceCredentialWrite(
          previousReservation,
        )
      ).isSuccess(),
    ).toBe(true)
    expect(
      (
        await credentialRegistry.commitWorkspaceCredentialWrite(
          previousReservation,
        )
      ).isSuccess(),
    ).toBe(true)
    expect(
      (
        await credentialRegistry.finishWorkspaceCredentialWrite(
          previousReservation,
        )
      ).isSuccess(),
    ).toBe(true)
    let writeResult: 'completed' | 'unavailable' = 'unavailable'
    const credentials: ICredentialsVault = {
      getToken: async (service, account) => {
        const token = records.get(`${service}/${account}`)
        if (token === undefined) return { kind: 'absent' }
        return { kind: 'present', token }
      },
      saveToken: async () => {},
      deleteToken: async () => {},
      hasToken: async (service, account) =>
        records.has(`${service}/${account}`)
          ? { kind: 'present' }
          : { kind: 'absent' },
      replaceToken: async () => {},
    }
    const connectionVault: IConnectionCredentialsVault = {
      readCredential: async () => ({ kind: 'absent' }),
      writeCredential: async (reference, token) => {
        if (writeResult === 'unavailable') return { kind: 'unavailable' }
        records.set(`${reference.service}/${reference.account}`, token)
        return { kind: 'completed' }
      },
      removeCredential: async (reference) => {
        records.delete(`${reference.service}/${reference.account}`)
        return { kind: 'completed' }
      },
    }
    const addonVault = new AddonScopedVault(
      'addon-recovery',
      credentials,
      connectionVault,
      credentialRegistry,
      new JSONAddonSettingsRepository(temporaryDirectory),
    )
    const scope: AddonVaultScope = {
      kind: 'workspace',
      workspaceId: workspace.id,
    }
    const failedWrite = await addonVault.set(scope, 'token', 'new')
    expect(failedWrite.isFailure()).toBe(true)
    expect(records.get(`${previous.service}/${previous.account}`)).toBe(
      '{"token":"old"}',
    )
    const pending =
      await credentialRegistry.listPendingWorkspaceCredentialReferences()
    expect(pending.isSuccess()).toBe(true)
    expect(pending.isSuccess() && pending.success).toHaveLength(1)

    writeResult = 'completed'
    const recovery = new RecoverAddonWorkspaceCredentialWritesService(
      credentialRegistry,
      credentials,
      connectionVault,
    )
    const recovered = await recovery.execute()
    expect(recovered.isSuccess()).toBe(true)
    const repeatedRecovery = await recovery.execute()
    expect(repeatedRecovery.isSuccess()).toBe(true)
    const settings = await addonVault.getSettings(scope)
    expect(settings.isSuccess()).toBe(true)
    expect(records.get(`${previous.service}/${previous.account}`)).toBe(
      '{"token":"old"}',
    )
  })

  it('recovers an opaque workspace token after interruption before reference commit', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'addon-delete-race-'),
    )
    const repository = new SQLiteWorkspacesRepository(temporaryDirectory)
    activeRepositories.push(repository)
    const credentialRegistry = new SQLiteWorkspaceCredentialReferenceRegistry(
      repository.db,
    )
    const workspace = Workspace.create({
      name: 'Opaque token recovery',
    }).success
    const createResult = await repository.create(workspace)
    expect(createResult.isSuccess()).toBe(true)

    const scope: AddonVaultScope = {
      kind: 'workspace',
      workspaceId: workspace.id,
    }
    const previous = CredentialReferenceFactory.createAddonSecret(
      'addon-opaque',
      scope,
      'token',
    )
    const reservation = {
      workspaceId: workspace.id,
      ownerId: 'addon-opaque',
      logicalReferenceId: previous.id,
      candidateReferenceId: previous.id,
      previousReferenceId: null,
    }
    expect(
      (
        await credentialRegistry.reserveWorkspaceCredentialWrite(reservation)
      ).isSuccess(),
    ).toBe(true)
    expect(
      (
        await credentialRegistry.commitWorkspaceCredentialWrite(reservation)
      ).isSuccess(),
    ).toBe(true)
    expect(
      (
        await credentialRegistry.finishWorkspaceCredentialWrite(reservation)
      ).isSuccess(),
    ).toBe(true)

    const records = new Map<string, string>([
      [`${previous.service}/${previous.account}`, 'opaque-old-token'],
    ])
    let signalCandidateWritten: () => void = () => {}
    const candidateWritten = new Promise<void>((resolve) => {
      signalCandidateWritten = resolve
    })
    const credentials: ICredentialsVault = {
      getToken: async (service, account) => {
        const token = records.get(`${service}/${account}`)
        if (token === undefined) return { kind: 'absent' }
        return { kind: 'present', token }
      },
      saveToken: async () => {},
      deleteToken: async () => {},
      hasToken: async (service, account) =>
        records.has(`${service}/${account}`)
          ? { kind: 'present' }
          : { kind: 'absent' },
      replaceToken: async () => {},
    }
    const connectionVault: IConnectionCredentialsVault = {
      readCredential: async () => ({ kind: 'absent' }),
      writeCredential: async (reference, token) => {
        records.set(`${reference.service}/${reference.account}`, token)
        signalCandidateWritten()
        return { kind: 'completed' }
      },
      removeCredential: async (reference) => {
        records.delete(`${reference.service}/${reference.account}`)
        return { kind: 'completed' }
      },
    }
    const settingsRepository = new JSONAddonSettingsRepository(
      temporaryDirectory,
    )
    const addonVault = new AddonScopedVault(
      'addon-opaque',
      credentials,
      connectionVault,
      credentialRegistry,
      settingsRepository,
    )
    vi.spyOn(
      credentialRegistry,
      'commitWorkspaceCredentialWrite',
    ).mockImplementation(async () =>
      Either.failure(AppError.Internal('SIMULATED_INTERRUPTION_BEFORE_COMMIT')),
    )

    const pendingWrite = addonVault.set(scope, 'token', 'opaque-new-token')
    await candidateWritten
    const interrupted = await pendingWrite

    expect(interrupted.isFailure()).toBe(true)
    const pending =
      await credentialRegistry.listPendingWorkspaceCredentialReferences()
    expect(pending.isSuccess()).toBe(true)
    if (pending.isFailure()) return expect.fail(pending.failure.messageKey)
    const pendingReference = pending.success.find(
      (reference) => reference.ownerId === 'addon-opaque',
    )
    expect(pendingReference).toBeDefined()
    if (pendingReference === undefined)
      return expect.fail('Expected pending opaque token reference')
    if (pendingReference.candidateReferenceId === null)
      return expect.fail('Expected candidate reference after interrupted write')

    const restartedRepository = new SQLiteWorkspacesRepository(
      temporaryDirectory,
    )
    activeRepositories.push(restartedRepository)
    const restartedRegistry = new SQLiteWorkspaceCredentialReferenceRegistry(
      restartedRepository.db,
    )
    const recovery = new RecoverAddonWorkspaceCredentialWritesService(
      restartedRegistry,
      credentials,
      connectionVault,
    )
    const recovered = await recovery.execute()
    expect(recovered.isSuccess()).toBe(true)
    const repeatedRecovery = await recovery.execute()
    expect(repeatedRecovery.isSuccess()).toBe(true)

    const recoveredVault = new AddonScopedVault(
      'addon-opaque',
      credentials,
      connectionVault,
      restartedRegistry,
      settingsRepository,
    )
    const token = await recoveredVault.get(scope, 'token')
    expect(token.isSuccess()).toBe(true)
    if (token.isFailure()) return expect.fail(token.failure.messageKey)
    expect(token.success).toBe('opaque-new-token')
    expect(records.has(`${previous.service}/${previous.account}`)).toBe(false)

    const references =
      await restartedRegistry.listWorkspaceCredentialReferences(workspace.id)
    expect(references.isSuccess()).toBe(true)
    if (references.isFailure())
      return expect.fail(references.failure.messageKey)
    const activeReference = references.success.find(
      (reference) => reference.logicalReferenceId === previous.id,
    )
    expect(activeReference).toBeDefined()
    if (activeReference === undefined)
      return expect.fail('Expected recovered opaque token reference')
    expect(activeReference.status).toBe('active')
    expect(activeReference.activeReferenceId).toBe(
      pendingReference.candidateReferenceId,
    )
    expect(activeReference.candidateReferenceId).toBeNull()
  })
})
