import { ICredentialsStorage, ILocalRuntimeAPI } from '@mr-tick/application'
import {
  exchangeAuthorizationCode,
  formatStoredToken,
  generateOAuthState,
  generatePKCE,
} from '@mr-tick/sdk'
import { shell } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AddonLoader } from './AddonLoader'

const unavailableRuntime: ILocalRuntimeAPI = {
  request: async () => ({
    ok: false,
    error: { messageKey: 'RUNTIME_UNAVAILABLE', statusCode: 503 },
  }),
}

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

describe('OAuth 2.0 PKCE Flow in AddonLoader', () => {
  let addonLoader: AddonLoader
  let fakeCredentialsStorage: ICredentialsStorage

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    fakeCredentialsStorage = {
      getToken: vi.fn().mockResolvedValue(null),
      saveToken: vi.fn().mockResolvedValue(undefined),
      deleteToken: vi.fn().mockResolvedValue(undefined),
      hasToken: vi.fn().mockResolvedValue(false),
      replaceToken: vi.fn().mockResolvedValue(undefined),
    }

    addonLoader = new AddonLoader(
      fakeCredentialsStorage,
      unavailableRuntime,
      '1.4.0',
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('1. State Generation & Authority', () => {
    it('gera state automático criptograficamente seguro quando não fornecido', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/oauth2/authorize?client_id=123',
      })

      expect(shell.openExternal).toHaveBeenCalledTimes(1)
      const openedUrl = vi.mocked(shell.openExternal).mock.calls[0][0]
      const parsedUrl = new URL(openedUrl)
      const generatedState = parsedUrl.searchParams.get('state')

      expect(generatedState).toBeDefined()
      expect(generatedState).toMatch(/^test-addon_[0-9a-f-]{36}$/)

      // Clean up
      addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?code=abc&state=${generatedState}`,
      )
      await authPromise
    })

    it('utiliza o state fornecido em options.state', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const customState = 'custom-secure-state-12345'
      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/oauth2/authorize?client_id=123',
        state: customState,
      })

      const openedUrl = vi.mocked(shell.openExternal).mock.calls[0][0]
      const parsedUrl = new URL(openedUrl)
      expect(parsedUrl.searchParams.get('state')).toBe(customState)

      addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?code=auth-code-123&state=${customState}`,
      )
      const result = await authPromise
      expect(result.code).toBe('auth-code-123')
      expect(result.state).toBe(customState)
    })

    it('rejeita quando state da URL for diferente do state esperado', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const authPromise = context.oauth.authorize({
        authUrl:
          'https://auth.example.com/authorize?client_id=123&state=state-in-url',
        state: 'different-state-in-options',
      })

      await expect(authPromise).rejects.toThrow(
        'Inconsistência de state: o state da authUrl não corresponde ao state esperado.',
      )
      expect(shell.openExternal).not.toHaveBeenCalled()
    })

    it('funciona quando state da URL for igual ao esperado', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const matchingState = 'matching-state-123'
      const authPromise = context.oauth.authorize({
        authUrl: `https://auth.example.com/authorize?client_id=123&state=${matchingState}`,
        state: matchingState,
      })

      expect(shell.openExternal).toHaveBeenCalledTimes(1)
      addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?code=code-ok&state=${matchingState}`,
      )
      const result = await authPromise
      expect(result.code).toBe('code-ok')
    })

    it('generateOAuthState produz UUID seguro sem Math.random', () => {
      const state1 = generateOAuthState('myprefix')
      const state2 = generateOAuthState('myprefix')
      expect(state1).toMatch(/^myprefix_[0-9a-f-]{36}$/)
      expect(state2).toMatch(/^myprefix_[0-9a-f-]{36}$/)
      expect(state1).not.toBe(state2)
    })

    it('context.oauth.generateState gera state prefixado corretamente', () => {
      const context = addonLoader.createContext('discord-addon')
      const state = context.oauth.generateState('discord')
      expect(state).toMatch(/^discord_[0-9a-f-]{36}$/)
    })
  })

  describe('2. URL & Protocol Restrictions', () => {
    it('permite HTTPS', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const authPromise = context.oauth.authorize({
        authUrl: 'https://secure-provider.com/authorize',
        state: 'https-state',
      })

      expect(shell.openExternal).toHaveBeenCalledTimes(1)
      addonLoader.handleOAuthCallbackUrl(
        'mr-tick-app://oauth/callback?code=ok&state=https-state',
      )
      await authPromise
    })

    it('rejeita HTTP externo não local', async () => {
      const context = addonLoader.createContext('test-addon')

      const authPromise = context.oauth.authorize({
        authUrl: 'http://insecure-provider.com/authorize',
      })

      await expect(authPromise).rejects.toThrow(
        'Protocolo de URL inválido. Utilize HTTPS ou HTTP somente para localhost/127.0.0.1 em desenvolvimento.',
      )
      expect(shell.openExternal).not.toHaveBeenCalled()
    })

    it('permite HTTP localhost em desenvolvimento', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const authPromise = context.oauth.authorize({
        authUrl: 'http://localhost:8080/authorize',
        state: 'localhost-state',
      })

      expect(shell.openExternal).toHaveBeenCalledTimes(1)
      addonLoader.handleOAuthCallbackUrl(
        'mr-tick-app://oauth/callback?code=ok&state=localhost-state',
      )
      await authPromise
    })

    it('permite HTTP 127.0.0.1 em desenvolvimento', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const authPromise = context.oauth.authorize({
        authUrl: 'http://127.0.0.1:8080/authorize',
        state: 'ip-state',
      })

      expect(shell.openExternal).toHaveBeenCalledTimes(1)
      addonLoader.handleOAuthCallbackUrl(
        'mr-tick-app://oauth/callback?code=ok&state=ip-state',
      )
      await authPromise
    })

    it('rejeita protocolos inseguros como file:, javascript:, data:, ftp:', async () => {
      const context = addonLoader.createContext('test-addon')

      await expect(
        context.oauth.authorize({ authUrl: 'file:///etc/passwd' }),
      ).rejects.toThrow('Protocolo de URL inválido')

      await expect(
        context.oauth.authorize({ authUrl: 'javascript:alert(1)' }),
      ).rejects.toThrow('Protocolo de URL inválido')

      await expect(
        context.oauth.authorize({ authUrl: 'data:text/html,test' }),
      ).rejects.toThrow('Protocolo de URL inválido')

      await expect(
        context.oauth.authorize({ authUrl: 'ftp://ftp.example.com' }),
      ).rejects.toThrow('Protocolo de URL inválido')
    })

    it('rejeita URL malformada', async () => {
      const context = addonLoader.createContext('test-addon')

      await expect(
        context.oauth.authorize({ authUrl: 'invalid-url' }),
      ).rejects.toThrow('URL de autorização inválida')
    })
  })

  describe('3. Callback Processing, Deep Linking & Replay Protection', () => {
    it('resolve Promise em callback válido com code e state', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const state = 'state-valid-3'
      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/authorize',
        state,
      })

      const handled = addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?code=my-secret-code&state=${state}&custom_param=extra`,
      )
      expect(handled).toBe(true)

      const result = await authPromise
      expect(result.code).toBe('my-secret-code')
      expect(result.state).toBe(state)
      expect(result.custom_param).toBe('extra')
    })

    it('ignora callback sem state e encerra a Promise pendente por timeout sem vazamento', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/authorize',
        state: 'valid-state',
        timeoutMs: 5000,
      })

      const handled = addonLoader.handleOAuthCallbackUrl(
        'mr-tick-app://oauth/callback?code=some-code',
      )
      expect(handled).toBe(false)

      vi.advanceTimersByTime(5001)
      await expect(authPromise).rejects.toThrow(
        'Tempo limite de autenticação esgotado.',
      )
    })

    it('ignora callback com state desconhecido e encerra a Promise pendente por timeout sem vazamento', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/authorize',
        state: 'known-state',
        timeoutMs: 5000,
      })

      const handled = addonLoader.handleOAuthCallbackUrl(
        'mr-tick-app://oauth/callback?code=attacker-code&state=unknown-state',
      )
      expect(handled).toBe(false)

      vi.advanceTimersByTime(5001)
      await expect(authPromise).rejects.toThrow(
        'Tempo limite de autenticação esgotado.',
      )
    })

    it('rejeita Promise quando callback contiver error', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const state = 'state-error-test'
      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/authorize',
        state,
      })

      const handled = addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?error=access_denied&error_description=User+denied+access&state=${state}`,
      )
      expect(handled).toBe(true)

      await expect(authPromise).rejects.toThrow(
        'access_denied: User denied access',
      )
    })

    it('rejeita Promise quando callback não contiver code', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const state = 'state-no-code'
      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/authorize',
        state,
      })

      const handled = addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?state=${state}`,
      )
      expect(handled).toBe(true)

      await expect(authPromise).rejects.toThrow(
        'Código de autorização não retornado.',
      )
    })

    it('impede replay: callback recebido duas vezes não resolve duas vezes', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const state = 'state-replay-test'
      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/authorize',
        state,
      })

      const firstHandled = addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?code=valid-code&state=${state}`,
      )
      expect(firstHandled).toBe(true)

      const secondHandled = addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?code=valid-code&state=${state}`,
      )
      expect(secondHandled).toBe(false)

      const result = await authPromise
      expect(result.code).toBe('valid-code')
    })

    it('rejeita deep link com rota ou protocolo inválido', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const state = 'state-route-test'
      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/authorize',
        state,
        timeoutMs: 5000,
      })

      expect(
        addonLoader.handleOAuthCallbackUrl(
          `https://mr-tickapp.com.br/oauth/callback?code=abc&state=${state}`,
        ),
      ).toBe(false)

      expect(
        addonLoader.handleOAuthCallbackUrl(
          `mr-tick-app://outro-endpoint?code=abc&state=${state}`,
        ),
      ).toBe(false)

      expect(
        addonLoader.handleOAuthCallbackUrl(
          `mr-tick-app://oauth/outro?code=abc&state=${state}`,
        ),
      ).toBe(false)

      vi.advanceTimersByTime(5001)
      await expect(authPromise).rejects.toThrow(
        'Tempo limite de autenticação esgotado.',
      )
    })

    it('timeout remove a requisição pendente e rejeita a Promise', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const state = 'state-timeout-test'
      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/authorize',
        state,
        timeoutMs: 5000,
      })

      vi.advanceTimersByTime(5001)

      await expect(authPromise).rejects.toThrow(
        'Tempo limite de autenticação esgotado.',
      )

      const handled = addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?code=late-code&state=${state}`,
      )
      expect(handled).toBe(false)
    })

    it('callback válido cancela o timer de timeout', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const state = 'state-cancel-timeout'
      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/authorize',
        state,
        timeoutMs: 10000,
      })

      addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?code=code-123&state=${state}`,
      )
      const result = await authPromise
      expect(result.code).toBe('code-123')

      vi.advanceTimersByTime(15000)
    })
  })

  describe('4. Browser & External Shell Handling', () => {
    it('chama shell.openExternal com a URL final contendo state', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/authorize?client_id=myclient',
        state: 'my-state-open',
      })

      expect(shell.openExternal).toHaveBeenCalledWith(
        'https://auth.example.com/authorize?client_id=myclient&state=my-state-open',
      )

      addonLoader.handleOAuthCallbackUrl(
        'mr-tick-app://oauth/callback?code=123&state=my-state-open',
      )
      await authPromise
    })

    it('falha em shell.openExternal() limpa timeout, remove pending request e rejeita Promise', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockRejectedValue(
        new Error('Browser not found'),
      )

      const state = 'state-browser-fail'
      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/authorize',
        state,
      })

      await expect(authPromise).rejects.toThrow(
        'Falha ao abrir navegador para autorização: Browser not found',
      )

      const handled = addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?code=code-123&state=${state}`,
      )
      expect(handled).toBe(false)
    })

    it('desativação do addon cancela e limpa requisições pendentes daquele addon', async () => {
      const context = addonLoader.createContext('addon-to-deactivate')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const state = 'state-deactivate'
      const authPromise = context.oauth.authorize({
        authUrl: 'https://auth.example.com/authorize',
        state,
      })

      await addonLoader.deactivateAddon('addon-to-deactivate')

      await expect(authPromise).rejects.toThrow(
        "Addon 'addon-to-deactivate' desativado durante a autenticação.",
      )

      const handled = addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?code=123&state=${state}`,
      )
      expect(handled).toBe(false)
    })
  })

  describe('5. Concurrency & Isolation', () => {
    it('múltiplas autenticações simultâneas funcionam independentemente sem interferência', async () => {
      const context1 = addonLoader.createContext('addon-1')
      const context2 = addonLoader.createContext('addon-2')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const state1 = 'state-concurrent-1'
      const state2 = 'state-concurrent-2'

      const authPromise1 = context1.oauth.authorize({
        authUrl: 'https://auth.example.com/addon1',
        state: state1,
      })
      const authPromise2 = context2.oauth.authorize({
        authUrl: 'https://auth.example.com/addon2',
        state: state2,
      })

      // Resolve addon 2 first
      addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?code=code-for-2&state=${state2}`,
      )
      const result2 = await authPromise2
      expect(result2.code).toBe('code-for-2')
      expect(result2.state).toBe(state2)

      // Resolve addon 1 second
      addonLoader.handleOAuthCallbackUrl(
        `mr-tick-app://oauth/callback?code=code-for-1&state=${state1}`,
      )
      const result1 = await authPromise1
      expect(result1.code).toBe('code-for-1')
      expect(result1.state).toBe(state1)
    })
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
})
