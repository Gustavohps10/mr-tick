import {
  type IConnectionCredentialsVault,
  type ICredentialsVault,
} from '@mr-tick/application'
import { shell } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AddonLoader } from './AddonLoader'
import { createOAuthTestSetup } from './AddonLoader.OAuth.fixture'

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

describe('OAuth 2.0 PKCE Flow in AddonLoader - Callbacks & Concurrency', () => {
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

  describe('3. Callback Processing, Deep Linking & Replay Protection', () => {
    it('resolve Promise em callback válido com code e state', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const state = 'state-valid-3'
      const authPromise = context.host.oauth.authorize({
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

      const authPromise = context.host.oauth.authorize({
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

      const authPromise = context.host.oauth.authorize({
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
      const authPromise = context.host.oauth.authorize({
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
      const authPromise = context.host.oauth.authorize({
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
      const authPromise = context.host.oauth.authorize({
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
      const authPromise = context.host.oauth.authorize({
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
      const authPromise = context.host.oauth.authorize({
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
      const authPromise = context.host.oauth.authorize({
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

      const authPromise = context.host.oauth.authorize({
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
      const authPromise = context.host.oauth.authorize({
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
      const authPromise = context.host.oauth.authorize({
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

      const authPromise1 = context1.host.oauth.authorize({
        authUrl: 'https://auth.example.com/addon1',
        state: state1,
      })
      const authPromise2 = context2.host.oauth.authorize({
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
})
