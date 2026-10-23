import {
  type IConnectionCredentialsVault,
  type ICredentialsVault,
} from '@mr-tick/application'
import {
  exchangeAuthorizationCode,
  formatStoredToken,
  generatePKCE,
} from '@mr-tick/sdk'
import { shell } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AddonLoader } from '../AddonLoader'
import { createOAuthTestSetup } from './AddonLoader.OAuth.fixture'

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

describe('OAuth 2.0 PKCE Flow in AddonLoader - Token Exchange', () => {
  let addonLoader: AddonLoader
  let fakeCredentialsVault: ICredentialsVault & IConnectionCredentialsVault

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    const setup = createOAuthTestSetup()
    addonLoader = setup.addonLoader
    fakeCredentialsVault = setup.fakeCredentialsVault
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('6. Token Exchange & Storage Normalization', () => {
    it('troca de token valida response HTTP 2xx e retorna token estruturado', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'valid-access-token',
          refresh_token: 'valid-refresh-token',
          token_type: 'Bearer',
          expires_in: 7200,
          scope: 'identify rpc',
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await exchangeAuthorizationCode({
        tokenUrl: 'https://oauth.example.com/token',
        clientId: 'client-123',
        code: 'auth-code',
        codeVerifier: 'verifier-123',
        redirectUri: 'https://mr-tickapp.com.br/oauth/callback',
      })

      expect(result.accessToken).toBe('valid-access-token')
      expect(result.refreshToken).toBe('valid-refresh-token')
      expect(result.tokenType).toBe('Bearer')
      expect(result.scope).toBe('identify rpc')
      expect(result.expiresAt).toBeDefined()
    })

    it('troca de token valida HTTP 400 e trata error_description', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Code verifier is invalid',
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await expect(
        exchangeAuthorizationCode({
          tokenUrl: 'https://oauth.example.com/token',
          clientId: 'client-123',
          code: 'auth-code',
          codeVerifier: 'verifier-123',
          redirectUri: 'https://mr-tickapp.com.br/oauth/callback',
        }),
      ).rejects.toThrow(
        'Falha na troca de código OAuth: Code verifier is invalid',
      )
    })

    it('troca de token valida HTTP 401 e rejeita', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'unauthorized_client',
          error_description: 'Client is not authorized',
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await expect(
        exchangeAuthorizationCode({
          tokenUrl: 'https://oauth.example.com/token',
          clientId: 'client-123',
          code: 'auth-code',
          codeVerifier: 'verifier-123',
          redirectUri: 'https://mr-tickapp.com.br/oauth/callback',
        }),
      ).rejects.toThrow(
        'Falha na troca de código OAuth: Client is not authorized',
      )
    })

    it('formatStoredToken rejeita payload vazio ou access_token ausente', () => {
      expect(() => formatStoredToken({ access_token: '' })).toThrow(
        'Resposta de token inválida: access_token não encontrado ou inválido.',
      )

      expect(() => formatStoredToken({} as any)).toThrow(
        'Resposta de token inválida: access_token não encontrado ou inválido.',
      )

      expect(() => formatStoredToken(null as any)).toThrow(
        'Resposta de token inválida: payload vazio ou nulo.',
      )
    })

    it('formatStoredToken preserva refresh_token, calcula expiresAt e preserva scope', () => {
      const mockNow = 1700000000000
      vi.setSystemTime(mockNow)

      const formatted = formatStoredToken({
        access_token: 'access-token-xyz',
        refresh_token: 'refresh-token-abc',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'identify email',
      })

      expect(formatted.accessToken).toBe('access-token-xyz')
      expect(formatted.refreshToken).toBe('refresh-token-abc')
      expect(formatted.tokenType).toBe('Bearer')
      expect(formatted.scope).toBe('identify email')
      expect(formatted.expiresAt).toBe(
        new Date(mockNow + 3600 * 1000).toISOString(),
      )
    })
  })

  describe('7. PKCE Pair Generation', () => {
    it('generatePKCE produz codeVerifier e codeChallenge no padrão RFC 7636', () => {
      const { codeVerifier, codeChallenge } = generatePKCE()
      expect(codeVerifier).toBeDefined()
      expect(codeVerifier.length).toBeGreaterThanOrEqual(43)
      expect(codeChallenge).toBeDefined()
      expect(codeChallenge.length).toBeGreaterThanOrEqual(43)
      expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/)
    })
  })

  describe('8. DataSourceContext OAuth Injection', () => {
    it('injeta oauth no DataSourceContext permitindo que um DataSource autentique via OAuth 2.0 PKCE', async () => {
      addonLoader.registerManifestCapabilities('oauth-datasource-addon', [
        'dataSource',
      ])
      const addonContext = addonLoader.createContext('oauth-datasource-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      let capturedOAuthState = ''
      let executeOAuthAuth: () => Promise<{
        credentials: { accessToken: string }
      }>
      addonContext.contributions.dataSources.register({
        getConnectionSchema: () => [],
        createInstance: (dsContext) => {
          expect(dsContext.oauth).toBeDefined()
          executeOAuthAuth = async () => {
            if (!dsContext.oauth) {
              throw new Error('oauth ausente no DataSourceContext')
            }
            capturedOAuthState = dsContext.oauth.generateState('oauth-ds')
            const res = await dsContext.oauth.authorize({
              authUrl:
                'https://provider.example.com/oauth/authorize?client_id=ds-client',
              state: capturedOAuthState,
            })
            return {
              credentials: {
                accessToken: `token-for-${res.code}`,
              },
            }
          }
          return {
            tasksProvider: {} as any,
            timeEntriesProvider: {} as any,
            membersProvider: {} as any,
            metadataProvider: {} as any,
          }
        },
      })

      const registeredDs = addonLoader.getDataSource('oauth-datasource-addon')
      expect(registeredDs).toBeDefined()

      registeredDs!.createInstance({
        httpClient: {} as any,
        config: { baseUrl: 'https://provider.example.com' },
        scope: {
          workspaceId: 'ws-oauth-test',
          connectionInstanceId: 'conn-oauth-test',
        },
      })

      const authPromise = executeOAuthAuth!()

      expect(capturedOAuthState).toMatch(/^oauth-ds_[0-9a-f-]{36}$/)
      addonLoader.handleOAuthCallbackUrl(
        `mr-tick://oauth/callback?code=ds-oauth-code-777&state=${capturedOAuthState}`,
      )

      const authResult = await authPromise
      expect(authResult.credentials).toEqual({
        accessToken: 'token-for-ds-oauth-code-777',
      })
    })
  })
})
