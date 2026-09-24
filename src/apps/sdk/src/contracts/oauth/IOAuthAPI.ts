export interface PKCEPair {
  codeVerifier: string
  codeChallenge: string
}

export interface OAuthAuthorizeOptions {
  authUrl: string
  state?: string
  timeoutMs?: number
}

export interface OAuthResult {
  code: string
  state?: string
  [param: string]: string | undefined
}

export interface OAuthTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  [key: string]: string | number | boolean | undefined | null
}

export interface OAuthStoredToken {
  accessToken: string
  refreshToken?: string
  tokenType?: string
  expiresAt?: string
  scope?: string
}

export interface IOAuthAPI {
  generatePKCE(): PKCEPair
  generateState(prefix?: string): string
  authorize(options: OAuthAuthorizeOptions): Promise<OAuthResult>
}
