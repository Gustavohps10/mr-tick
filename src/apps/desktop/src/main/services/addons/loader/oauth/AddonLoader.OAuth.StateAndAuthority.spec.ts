import {
  type IConnectionCredentialsVault,
  type ICredentialsVault,
} from '@mr-tick/application'
import { generateOAuthState } from '@mr-tick/sdk'
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

describe('OAuth 2.0 PKCE Flow in AddonLoader - State & Authority', () => {
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

  describe('1. State Generation & Authority', () => {
    it('gera state automático criptograficamente seguro quando não fornecido', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const authPromise = context.host.oauth.authorize({
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
        `mr-tick://oauth/callback?code=abc&state=${generatedState}`,
      )
      await authPromise
    })

    it('utiliza o state fornecido em options.state', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const customState = 'custom-secure-state-12345'
      const authPromise = context.host.oauth.authorize({
        authUrl: 'https://auth.example.com/oauth2/authorize?client_id=123',
        state: customState,
      })

      const openedUrl = vi.mocked(shell.openExternal).mock.calls[0][0]
      const parsedUrl = new URL(openedUrl)
      expect(parsedUrl.searchParams.get('state')).toBe(customState)

      addonLoader.handleOAuthCallbackUrl(
        `mr-tick://oauth/callback?code=auth-code-123&state=${customState}`,
      )
      const result = await authPromise
      expect(result.code).toBe('auth-code-123')
      expect(result.state).toBe(customState)
    })

    it('rejeita quando state da URL for diferente do state esperado', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const authPromise = context.host.oauth.authorize({
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
      const authPromise = context.host.oauth.authorize({
        authUrl: `https://auth.example.com/authorize?client_id=123&state=${matchingState}`,
        state: matchingState,
      })

      expect(shell.openExternal).toHaveBeenCalledTimes(1)
      addonLoader.handleOAuthCallbackUrl(
        `mr-tick://oauth/callback?code=code-ok&state=${matchingState}`,
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

    it('context.host.oauth.generateState gera state prefixado corretamente', () => {
      const context = addonLoader.createContext('discord-addon')
      const state = context.host.oauth.generateState('discord')
      expect(state).toMatch(/^discord_[0-9a-f-]{36}$/)
    })
  })

  describe('2. URL & Protocol Restrictions', () => {
    it('permite HTTPS', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const authPromise = context.host.oauth.authorize({
        authUrl: 'https://secure-provider.com/authorize',
        state: 'https-state',
      })

      expect(shell.openExternal).toHaveBeenCalledTimes(1)
      addonLoader.handleOAuthCallbackUrl(
        'mr-tick://oauth/callback?code=ok&state=https-state',
      )
      await authPromise
    })

    it('rejeita HTTP externo não local', async () => {
      const context = addonLoader.createContext('test-addon')

      const authPromise = context.host.oauth.authorize({
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

      const authPromise = context.host.oauth.authorize({
        authUrl: 'http://localhost:8080/authorize',
        state: 'localhost-state',
      })

      expect(shell.openExternal).toHaveBeenCalledTimes(1)
      addonLoader.handleOAuthCallbackUrl(
        'mr-tick://oauth/callback?code=ok&state=localhost-state',
      )
      await authPromise
    })

    it('permite HTTP 127.0.0.1 em desenvolvimento', async () => {
      const context = addonLoader.createContext('test-addon')
      vi.mocked(shell.openExternal).mockResolvedValue(undefined)

      const authPromise = context.host.oauth.authorize({
        authUrl: 'http://127.0.0.1:8080/authorize',
        state: 'ip-state',
      })

      expect(shell.openExternal).toHaveBeenCalledTimes(1)
      addonLoader.handleOAuthCallbackUrl(
        'mr-tick://oauth/callback?code=ok&state=ip-state',
      )
      await authPromise
    })

    it('rejeita protocolos inseguros como file:, javascript:, data:, ftp:', async () => {
      const context = addonLoader.createContext('test-addon')

      await expect(
        context.host.oauth.authorize({ authUrl: 'file:///etc/passwd' }),
      ).rejects.toThrow('Protocolo de URL inválido')

      await expect(
        context.host.oauth.authorize({ authUrl: 'javascript:alert(1)' }),
      ).rejects.toThrow('Protocolo de URL inválido')

      await expect(
        context.host.oauth.authorize({ authUrl: 'data:text/html,test' }),
      ).rejects.toThrow('Protocolo de URL inválido')

      await expect(
        context.host.oauth.authorize({ authUrl: 'ftp://ftp.example.com' }),
      ).rejects.toThrow('Protocolo de URL inválido')
    })

    it('rejeita URL malformada', async () => {
      const context = addonLoader.createContext('test-addon')

      await expect(
        context.host.oauth.authorize({ authUrl: 'invalid-url' }),
      ).rejects.toThrow('URL de autorização inválida')
    })
  })
})
