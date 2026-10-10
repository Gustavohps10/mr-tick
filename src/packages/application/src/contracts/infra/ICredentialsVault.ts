export interface ICredentialsVault {
  saveToken(service: string, account: string, token: string): Promise<void>
  getToken(service: string, account: string): Promise<string | undefined>
  deleteToken(service: string, account: string): Promise<void>
  hasToken(service: string, account: string): Promise<boolean>
  replaceToken(
    service: string,
    account: string,
    newToken: string,
  ): Promise<void>
}
