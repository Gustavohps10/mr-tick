import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  SQLiteConnectionLifecycleRepository,
  SQLiteConnectionLifecycleTransactionBoundary,
  SQLiteConnectionReservationRepository,
  SQLiteWorkspaceCredentialReferenceRegistry,
  SQLiteWorkspacesRepository,
} from '@mr-tick/adapters/data'
import type {
  IConnectionCredentialsVault,
  ICredentialsVault,
} from '@mr-tick/application'
import { CredentialReferenceFactory } from '@mr-tick/application'
import { Workspace } from '@mr-tick/domain'
import { afterEach, describe, expect, it } from 'vitest'

import { DesktopCredentialRecovery } from './DesktopCredentialRecovery'

let temporaryDirectory: string | undefined
let activeRepository: SQLiteWorkspacesRepository | undefined

afterEach(cleanup)

async function cleanup(): Promise<void> {
  if (activeRepository !== undefined) {
    await activeRepository.close()
    activeRepository = undefined
  }
  if (temporaryDirectory === undefined) return
  const directory = path.resolve(temporaryDirectory)
  const allowedPrefix = path.resolve(
    os.tmpdir(),
    'desktop-credential-recovery-',
  )
  expect(path.isAbsolute(directory)).toBe(true)
  expect(directory.startsWith(allowedPrefix)).toBe(true)
  if (!path.isAbsolute(directory)) return
  if (!directory.startsWith(allowedPrefix)) return
  await fs.rm(directory, { recursive: true, force: true })
  temporaryDirectory = undefined
}

describe('desktop credential recovery before handler startup', () => {
  it('executes startup recovery cleanly without storing credential payloads', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'desktop-credential-recovery-'),
    )
    const repository = new SQLiteWorkspacesRepository(temporaryDirectory)
    activeRepository = repository
    const credentialRegistry = new SQLiteWorkspaceCredentialReferenceRegistry(
      repository.db,
    )
    const lifecycleRepository = new SQLiteConnectionLifecycleRepository(
      repository.db,
    )
    const reservationRepository = new SQLiteConnectionReservationRepository(
      repository.db,
    )

    const workspace = Workspace.create({ name: 'Seed workspace' }).success
    const created = await repository.create(workspace)
    expect(created.isSuccess()).toBe(true)

    const recovery = new DesktopCredentialRecovery(
      credentialRegistry,
      lifecycleRepository,
      reservationRepository,
      new EmptyCredentialVault(),
      repository,
      new SQLiteConnectionLifecycleTransactionBoundary(repository.db),
    )

    const result = await recovery.execute()
    expect(result.isSuccess()).toBe(true)

    const dbFile = path.join(temporaryDirectory, 'workspaces.sqlite')
    const storedDocument = await fs.readFile(dbFile, 'utf8')
    expect(storedDocument).not.toContain('secret')
    expect(storedDocument).not.toContain('token')
  })

  it('fails startup while the vault is unavailable and retries the pending addon reference', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'desktop-credential-recovery-'),
    )
    const repository = new SQLiteWorkspacesRepository(temporaryDirectory)
    activeRepository = repository
    const credentialRegistry = new SQLiteWorkspaceCredentialReferenceRegistry(
      repository.db,
    )
    const lifecycleRepository = new SQLiteConnectionLifecycleRepository(
      repository.db,
    )
    const reservationRepository = new SQLiteConnectionReservationRepository(
      repository.db,
    )

    const workspace = Workspace.create({ name: 'Recovery workspace' }).success
    const created = await repository.create(workspace)
    expect(created.isSuccess()).toBe(true)

    const logicalReference = CredentialReferenceFactory.createAddonWorkspace(
      'addon-recovery',
      workspace.id,
    )
    const candidate = CredentialReferenceFactory.createAddonWorkspaceCandidate(
      'addon-recovery',
      workspace.id,
      'desktop-recovery-candidate',
    )
    const reservation = {
      workspaceId: workspace.id,
      ownerId: 'addon-recovery',
      logicalReferenceId: logicalReference.id,
      candidateReferenceId: candidate.id,
      previousReferenceId: null,
    }
    const reserved =
      await credentialRegistry.reserveWorkspaceCredentialWrite(reservation)
    expect(reserved.isSuccess()).toBe(true)

    const records = new Map<string, string>([
      [`${candidate.service}/${candidate.account}`, '{"token":"ready"}'],
    ])
    let vaultAvailable = false
    const credentialsVault: ICredentialsVault & IConnectionCredentialsVault = {
      readCredential: async () => ({ kind: 'absent' }),
      getToken: async (service, account) => {
        if (!vaultAvailable) return { kind: 'unavailable' }
        const token = records.get(`${service}/${account}`)
        if (token === undefined) return { kind: 'absent' }
        return { kind: 'present', token }
      },
      hasToken: async (service, account) => {
        if (!vaultAvailable) return { kind: 'unavailable' }
        if (records.has(`${service}/${account}`)) return { kind: 'present' }
        return { kind: 'absent' }
      },
      saveToken: async (service, account, token) => {
        records.set(`${service}/${account}`, token)
      },
      deleteToken: async (service, account) => {
        records.delete(`${service}/${account}`)
      },
      replaceToken: async (service, account, token) => {
        records.set(`${service}/${account}`, token)
      },
      writeCredential: async (reference, token) => {
        records.set(`${reference.service}/${reference.account}`, token)
        return { kind: 'completed' }
      },
      removeCredential: async (reference) => {
        if (!vaultAvailable) return { kind: 'unavailable' }
        records.delete(`${reference.service}/${reference.account}`)
        return { kind: 'completed' }
      },
    }

    const recovery = new DesktopCredentialRecovery(
      credentialRegistry,
      lifecycleRepository,
      reservationRepository,
      credentialsVault,
      repository,
      new SQLiteConnectionLifecycleTransactionBoundary(repository.db),
    )
    const unavailable = await recovery.execute()
    expect(unavailable.isFailure()).toBe(true)
    const pending =
      await credentialRegistry.listPendingWorkspaceCredentialReferences()
    expect(pending.isSuccess()).toBe(true)
    expect(pending.isSuccess() && pending.success).toHaveLength(1)

    vaultAvailable = true
    const recovered = await recovery.execute()
    expect(recovered.isSuccess()).toBe(true)
    const repeated = await recovery.execute()
    expect(repeated.isSuccess()).toBe(true)
    const references =
      await credentialRegistry.listWorkspaceCredentialReferences(workspace.id)
    expect(references.isSuccess()).toBe(true)
    expect(references.isSuccess() && references.success).toHaveLength(1)
    expect(
      references.isSuccess() && references.success[0].activeReferenceId,
    ).toBe(candidate.id)
  })
})

class EmptyCredentialVault
  implements ICredentialsVault, IConnectionCredentialsVault
{
  async readCredential(): Promise<{ kind: 'absent' }> {
    return { kind: 'absent' }
  }

  async getToken(): Promise<{ kind: 'absent' }> {
    return { kind: 'absent' }
  }

  async hasToken(): Promise<{ kind: 'absent' }> {
    return { kind: 'absent' }
  }

  async saveToken(): Promise<void> {}

  async deleteToken(): Promise<void> {}

  async replaceToken(): Promise<void> {}

  async writeCredential(): Promise<{ kind: 'completed' }> {
    return { kind: 'completed' }
  }

  async removeCredential(): Promise<{ kind: 'completed' }> {
    return { kind: 'completed' }
  }
}
