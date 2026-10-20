import { CredentialReference } from '@/utils/credential-reference'

import type { CredentialVaultReadResult } from './ICredentialsVault'

export type CredentialVaultMutationResult =
  { kind: 'completed' } | { kind: 'unavailable' }

export interface IConnectionCredentialsVault {
  readCredential(
    reference: CredentialReference,
  ): Promise<CredentialVaultReadResult>
  writeCredential(
    reference: CredentialReference,
    token: string,
  ): Promise<CredentialVaultMutationResult>
  removeCredential(
    reference: CredentialReference,
  ): Promise<CredentialVaultMutationResult>
}
