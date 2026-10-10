import { createHash, randomBytes, randomUUID } from 'node:crypto'

import {
  OAuthStoredToken,
  OAuthTokenResponse,
  PKCEPair,
} from '../contracts/host/oauth/IAddonOAuthAPI'

/**
 * Generate a cryptographically random PKCE code_verifier and SHA-256 code_challenge (RFC 7636).
 */
export function generatePKCE(): PKCEPair {
  // Generate 32 random bytes -> 43 characters base64url string
  const codeVerifier = randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return {
    codeVerifier,
    codeChallenge,
  }
}

/**
 * Generate a cryptographically secure random state parameter for OAuth 2.0 requests.
 */
export function generateOAuthState(prefix?: string): string {
  const uuid =
    typeof crypto !== 'undefined' &&
    'randomUUID' in crypto &&
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : randomUUID()
  return prefix ? `${prefix}_${uuid}` : uuid
}

/**
 * Formats a raw OAuth 2.0 token response into a standardized OAuthStoredToken structure.
 * Calculates `expiresAt` (ISO 8601 string) when `expires_in` (in seconds) is provided.
 */
export function formatStoredToken(
  tokenResponse: OAuthTokenResponse,
): OAuthStoredToken {
  if (!tokenResponse || typeof tokenResponse !== 'object') {
    throw new Error('Resposta de token inválida: payload vazio ou nulo.')
  }

  if (
    !tokenResponse.access_token ||
    typeof tokenResponse.access_token !== 'string'
  ) {
    throw new Error(
      'Resposta de token inválida: access_token não encontrado ou inválido.',
    )
  }

  let expiresAt: string | undefined
  if (
    typeof tokenResponse.expires_in === 'number' &&
    Number.isFinite(tokenResponse.expires_in) &&
    tokenResponse.expires_in > 0
  ) {
    expiresAt = new Date(
      Date.now() + tokenResponse.expires_in * 1000,
    ).toISOString()
  }

  return {
    accessToken: tokenResponse.access_token,
    refreshToken:
      typeof tokenResponse.refresh_token === 'string'
        ? tokenResponse.refresh_token
        : undefined,
    tokenType:
      typeof tokenResponse.token_type === 'string'
        ? tokenResponse.token_type
        : undefined,
    expiresAt,
    scope:
      typeof tokenResponse.scope === 'string' ? tokenResponse.scope : undefined,
  }
}

export interface ExchangeAuthorizationCodeOptions {
  tokenUrl: string
  clientId: string
  code: string
  codeVerifier: string
  redirectUri: string
  extraParams?: Record<string, string>
  headers?: Record<string, string>
}

/**
 * Generic helper for exchanging an OAuth 2.0 authorization code with PKCE for tokens.
 * Handles HTTP status validation and formats the response safely.
 */
export async function exchangeAuthorizationCode(
  options: ExchangeAuthorizationCodeOptions,
): Promise<OAuthStoredToken> {
  const {
    tokenUrl,
    clientId,
    code,
    codeVerifier,
    redirectUri,
    extraParams,
    headers,
  } = options

  const bodyParams = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    ...extraParams,
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      ...headers,
    },
    body: bodyParams.toString(),
  })

  let rawData: unknown
  try {
    rawData = await response.json()
  } catch {
    throw new Error(
      `Falha na troca do token OAuth: resposta não pôde ser interpretada (HTTP ${response.status}).`,
    )
  }

  if (!response.ok) {
    const errorPayload = rawData as Record<string, unknown> | null
    const errorDescription =
      errorPayload &&
      (errorPayload.error_description ||
        errorPayload.error ||
        errorPayload.message)
    const sanitizedError =
      typeof errorDescription === 'string'
        ? errorDescription
        : `Erro na obtenção do token (HTTP ${response.status})`
    throw new Error(`Falha na troca de código OAuth: ${sanitizedError}`)
  }

  return formatStoredToken(rawData as OAuthTokenResponse)
}
