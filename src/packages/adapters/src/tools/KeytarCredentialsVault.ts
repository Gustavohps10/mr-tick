import {
  CredentialVaultMutationResult,
  CredentialVaultPresenceResult,
  CredentialVaultReadResult,
  IConnectionCredentialsVault,
  ICredentialsVault,
} from '@mr-tick/application'
import keytar from 'keytar'

export class KeytarCredentialsVault
  implements ICredentialsVault, IConnectionCredentialsVault
{
  async readCredential(
    reference: import('@mr-tick/application').CredentialReference,
  ): Promise<CredentialVaultReadResult> {
    try {
      const token = await keytar.getPassword(
        reference.service,
        reference.account,
      )
      if (token === null) return { kind: 'absent' }
      return { kind: 'present', token }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  async writeCredential(
    reference: import('@mr-tick/application').CredentialReference,
    token: string,
  ): Promise<CredentialVaultMutationResult> {
    try {
      await keytar.setPassword(reference.service, reference.account, token)
      return { kind: 'completed' }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  async removeCredential(
    reference: import('@mr-tick/application').CredentialReference,
  ): Promise<CredentialVaultMutationResult> {
    try {
      await keytar.deletePassword(reference.service, reference.account)
      return { kind: 'completed' }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  async saveToken(
    service: string,
    account: string,
    token: string,
  ): Promise<void> {
    await keytar.setPassword(service, account, token)
  }

  async getToken(
    service: string,
    account: string,
  ): Promise<CredentialVaultReadResult> {
    try {
      const token = await keytar.getPassword(service, account)
      if (token === null) return { kind: 'absent' }
      return { kind: 'present', token }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  async deleteToken(service: string, account: string): Promise<void> {
    await keytar.deletePassword(service, account)
  }

  async hasToken(
    service: string,
    account: string,
  ): Promise<CredentialVaultPresenceResult> {
    const result = await this.getToken(service, account)
    if (result.kind === 'present') return { kind: 'present' }
    if (result.kind === 'unavailable') return { kind: 'unavailable' }
    return { kind: 'absent' }
  }

  async replaceToken(
    service: string,
    account: string,
    newToken: string,
  ): Promise<void> {
    await this.saveToken(service, account, newToken)
  }
}
