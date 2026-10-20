export type CredentialVaultReadResult =
  | { kind: 'present'; token: string }
  | { kind: 'absent' }
  | { kind: 'unavailable' }

export type CredentialVaultPresenceResult =
  { kind: 'present' } | { kind: 'absent' } | { kind: 'unavailable' }

export interface ICredentialsVault {
  saveToken(service: string, account: string, token: string): Promise<void>
  getToken(service: string, account: string): Promise<CredentialVaultReadResult>
  deleteToken(service: string, account: string): Promise<void>
  hasToken(
    service: string,
    account: string,
  ): Promise<CredentialVaultPresenceResult>
  replaceToken(
    service: string,
    account: string,
    newToken: string,
  ): Promise<void>
}
