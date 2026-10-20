import {
  type AddonConnectionAuthenticator,
  CredentialReference,
  CredentialVaultMutationResult,
  CredentialVaultReadResult,
  IAddonAuthenticatorRegistry,
  IConnectionCredentialsVault,
} from '@mr-tick/application'
import { ConnectionProfileDescriptor } from '@mr-tick/domain'

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

export {
  ControlledCredentialsVault,
  dummyAuthenticatorRegistry,
  TestAuthenticatorRegistry,
}

export const boundaryProfile: ConnectionProfileDescriptor = {
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

export function createBoundaryTestSetup(): {
  repository: SQLiteWorkspacesRepository
  lifecycleRepository: SQLiteConnectionLifecycleRepository
  reservationRepository: SQLiteConnectionReservationRepository
  transactionBoundary: SQLiteConnectionLifecycleTransactionBoundary
  vault: ControlledCredentialsVault
  profile: ConnectionProfileDescriptor
} {
  const repository = new SQLiteWorkspacesRepository(':memory:')
  const lifecycleRepository = new SQLiteConnectionLifecycleRepository(
    repository.db,
  )
  const reservationRepository = new SQLiteConnectionReservationRepository(
    repository.db,
  )
  const transactionBoundary = new SQLiteConnectionLifecycleTransactionBoundary(
    repository.db,
  )
  const vault = new ControlledCredentialsVault()

  return {
    repository,
    lifecycleRepository,
    reservationRepository,
    transactionBoundary,
    vault,
    profile: boundaryProfile,
  }
}
