import { createServer, Server } from 'node:http'

import {
  EMPTY_HTTP_CONFIG,
  HttpResponseValidator,
  IHttpRequestOptions,
  JsonValue,
} from '@mr-tick/adapters/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ElectronHttpClient,
  ElectronHttpClientFactory,
  IFetchTransport,
  NodeFetchTransport,
  safeElectronNetworkErrorCode,
  sanitizeUrlForLogging,
} from './ElectronHttpClient'

function isJsonRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isSource: HttpResponseValidator<{ source: string }> = (
  value,
): value is { source: string } =>
  isJsonRecord(value) && typeof value.source === 'string'

const isSourceAndDestination: HttpResponseValidator<{
  source: string
  destination: string
}> = (value): value is { source: string; destination: string } =>
  isJsonRecord(value) &&
  typeof value.source === 'string' &&
  typeof value.destination === 'string'

const isOk: HttpResponseValidator<{ ok: boolean }> = (
  value,
): value is { ok: boolean } =>
  isJsonRecord(value) && typeof value.ok === 'boolean'

function responseOptions<T extends JsonValue>(
  responseValidator: HttpResponseValidator<T>,
): IHttpRequestOptions<T> {
  return { responseValidator }
}

describe('T01 / T21 / Seção 8.1: Isolamento HTTP por Conexão, Origem Cruzada, Redirects 302 e Logs no Host Electron', () => {
  const testTransport = new NodeFetchTransport()
  let serverA: Server
  let serverB: Server
  let portA = 0
  let portB = 0
  const requestsA: Array<{
    method: string
    url: string
    headers: Record<string, string | string[] | undefined>
  }> = []
  const requestsB: Array<{
    method: string
    url: string
    headers: Record<string, string | string[] | undefined>
  }> = []

  beforeEach(async () => {
    requestsA.length = 0
    requestsB.length = 0

    serverA = createServer((req, res) => {
      let method = ''
      if (req.method) {
        method = req.method
      }
      let url = ''
      if (req.url) {
        url = req.url
      }
      requestsA.push({
        method,
        url,
        headers: req.headers,
      })
      if (url === '/worklog-no-content') {
        res.writeHead(204).end()
        return
      }
      if (url === '/malformed-json') {
        res
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end('not-json')
        return
      }
      if (url === '/provider-validation-error') {
        res.setHeader('Content-Type', 'application/json')
        res.writeHead(422).end(
          JSON.stringify({
            messageKey: 'WORKLOG_NOT_ALLOWED',
            accessToken: 'must-not-be-exposed',
          }),
        )
        return
      }

      if (url.includes('/redirect-same-origin')) {
        res.writeHead(302, {
          Location: `http://127.0.0.1:${portA}/redirected-target-same`,
        })
        res.end()
        return
      }

      if (url.includes('/redirect-cross-origin')) {
        res.writeHead(302, {
          Location: `http://127.0.0.1:${portB}/redirected-target-B`,
        })
        res.end()
        return
      }

      if (url.includes('/redirected-target-same')) {
        res.setHeader('Content-Type', 'application/json')
        res.writeHead(200).end(
          JSON.stringify({
            source: 'serverA',
            destination: 'same-origin-target',
          }),
        )
        return
      }

      if (url.includes('/error-with-secret')) {
        res.setHeader('Content-Type', 'application/json')
        res.writeHead(500).end(
          JSON.stringify({
            error: 'sentinel-super-confidential-leak-1234567890',
          }),
        )
        return
      }

      res.setHeader('Content-Type', 'application/json')
      res
        .writeHead(200)
        .end(JSON.stringify({ source: 'serverA', status: 'ok' }))
    })

    serverB = createServer((req, res) => {
      let method = ''
      if (req.method) {
        method = req.method
      }
      let url = ''
      if (req.url) {
        url = req.url
      }
      requestsB.push({
        method,
        url,
        headers: req.headers,
      })

      if (url.includes('/redirected-target-B')) {
        res.setHeader('Content-Type', 'application/json')
        res.writeHead(200).end(
          JSON.stringify({
            source: 'serverB',
            destination: 'cross-origin-target',
          }),
        )
        return
      }

      res.setHeader('Content-Type', 'application/json')
      res
        .writeHead(200)
        .end(JSON.stringify({ source: 'serverB', status: 'ok' }))
    })

    await new Promise<void>((resolve) =>
      serverA.listen(0, '127.0.0.1', resolve),
    )
    await new Promise<void>((resolve) =>
      serverB.listen(0, '127.0.0.1', resolve),
    )

    const addrA = serverA.address()
    const addrB = serverB.address()
    if (addrA && typeof addrA !== 'string') {
      portA = addrA.port
    }
    if (addrB && typeof addrB !== 'string') {
      portB = addrB.port
    }
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => serverA.close(() => resolve()))
    await new Promise<void>((resolve) => serverB.close(() => resolve()))
  })

  it('deve isolar completamente requisições entre conexões A e B criadas pela Factory do host (T01)', async () => {
    const factory = new ElectronHttpClientFactory(
      EMPTY_HTTP_CONFIG,
      testTransport,
    )

    const clientA = factory.createClient({
      baseURL: `http://127.0.0.1:${portA}/prefixA`,
      headers: {
        'X-Connection-Secret': 'secret-key-A',
      },
      sensitiveHeaders: ['X-Connection-Secret'],
    })

    const clientB = factory.createClient({
      baseURL: `http://127.0.0.1:${portB}/prefixB`,
      headers: {
        'X-Connection-Secret': 'secret-key-B',
      },
      sensitiveHeaders: ['X-Connection-Secret'],
    })

    const resA1 = await clientA.get('/resource', responseOptions(isSource))
    expect(resA1.isSuccess()).toBe(true)

    const resB1 = await clientB.get('/resource', responseOptions(isSource))
    expect(resB1.isSuccess()).toBe(true)

    const resA2 = await clientA.get('/resource', responseOptions(isSource))
    expect(resA2.isSuccess()).toBe(true)

    expect(requestsA).toHaveLength(2)
    for (const req of requestsA) {
      expect(req.headers['x-connection-secret']).toBe('secret-key-A')
      expect(req.url).toBe('/prefixA/resource')
    }

    expect(requestsB).toHaveLength(1)
    for (const req of requestsB) {
      expect(req.headers['x-connection-secret']).toBe('secret-key-B')
      expect(req.url).toBe('/prefixB/resource')
    }
  })

  it('deve impedir vazamento de headers de autenticação/cookies para outra origem quando requisitada URL absoluta (Seção 8.1)', async () => {
    const factory = new ElectronHttpClientFactory(
      EMPTY_HTTP_CONFIG,
      testTransport,
    )

    const clientA = factory.createClient({
      baseURL: `http://127.0.0.1:${portA}/base`,
      headers: {
        'X-Connection-Secret': 'confidential-key-A',
        Cookie: 'session=secret-session-token',
        'Custom-Header': 'public-client-info',
      },
      sensitiveHeaders: ['X-Connection-Secret'],
    })

    // Requisita URL absoluta apontando para o Server B (origem diferente)
    const crossOriginUrl = `http://127.0.0.1:${portB}/external-webhook`
    const res = await clientA.get(crossOriginUrl, responseOptions(isSource))
    expect(res.isSuccess()).toBe(true)

    expect(requestsB).toHaveLength(1)
    const receivedHeaders = requestsB[0].headers

    // Headers secretos NÃO devem vazar para a outra origem
    expect(receivedHeaders['x-connection-secret']).toBeUndefined()
    expect(receivedHeaders['cookie']).toBeUndefined()

    // Headers comuns são preservados
    expect(receivedHeaders['custom-header']).toBe('public-client-info')
  })

  it('deve seguir redirect 302 para mesma origem mantendo credenciais e retornando o recurso final (Seção 8.1)', async () => {
    const factory = new ElectronHttpClientFactory(
      EMPTY_HTTP_CONFIG,
      testTransport,
    )

    const clientA = factory.createClient({
      baseURL: `http://127.0.0.1:${portA}`,
      headers: {
        'X-Connection-Secret': 'same-origin-secret-key',
        Cookie: 'session=authenticated-user-session',
      },
      sensitiveHeaders: ['X-Connection-Secret'],
    })

    const res = await clientA.get(
      '/redirect-same-origin',
      responseOptions(isSourceAndDestination),
    )
    expect(res.isSuccess()).toBe(true)
    if (res.isSuccess()) {
      expect(res.success.destination).toBe('same-origin-target')
    }

    // Deve ter chamado a rota inicial de redirect e em seguida a rota destino
    expect(requestsA.length).toBeGreaterThanOrEqual(2)
    const lastRequest = requestsA[requestsA.length - 1]
    expect(lastRequest.url).toBe('/redirected-target-same')
    expect(lastRequest.headers['x-connection-secret']).toBe(
      'same-origin-secret-key',
    )
    expect(lastRequest.headers['cookie']).toBe(
      'session=authenticated-user-session',
    )
  })

  it('deve seguir redirect 302 cross-origin (A -> B) sem enviar headers sensíveis (Seção 8.1)', async () => {
    const factory = new ElectronHttpClientFactory(
      EMPTY_HTTP_CONFIG,
      testTransport,
    )

    const clientA = factory.createClient({
      baseURL: `http://127.0.0.1:${portA}`,
      headers: {
        'X-Connection-Secret': 'leak-sensitive-key-A',
        Cookie: 'session=sensitive-cookie-A',
        'X-Public-App': 'mr-tick-desktop',
      },
      sensitiveHeaders: ['X-Connection-Secret'],
    })

    const res = await clientA.get(
      '/redirect-cross-origin',
      responseOptions(isSourceAndDestination),
    )
    expect(res.isSuccess()).toBe(true)
    if (res.isSuccess()) {
      expect(res.success.destination).toBe('cross-origin-target')
    }

    // Server A processou a requisição inicial e retornou 302 apontando para Server B
    expect(requestsA.length).toBeGreaterThanOrEqual(1)
    expect(requestsA[0].url).toBe('/redirect-cross-origin')

    // Server B recebeu a requisição redirecionada
    expect(requestsB.length).toBeGreaterThanOrEqual(1)
    const reqB = requestsB[requestsB.length - 1]
    expect(reqB.url).toBe('/redirected-target-B')

    // Prova de que os headers secretos de A NÃO vazaram para B após o redirect 302
    expect(reqB.headers['x-connection-secret']).toBeUndefined()
    expect(reqB.headers['cookie']).toBeUndefined()

    // Headers comuns permitidos foram preservados
    expect(reqB.headers['x-public-app']).toBe('mr-tick-desktop')
  })

  it('deve impedir vazamento de headers auth/cookies passados via requestHeaders para outra origem em URL absoluta e redirect 302 cross-origin (Seção 8.1)', async () => {
    const factory = new ElectronHttpClientFactory(
      EMPTY_HTTP_CONFIG,
      testTransport,
    )
    const client = factory.createClient({
      baseURL: `http://127.0.0.1:${portA}`,
    })

    // Caso 1: URL absoluta cross-origin com headers sensíveis na requisição
    const crossOriginUrl = `http://127.0.0.1:${portB}/webhook-request-headers`
    await client.get(crossOriginUrl, {
      headers: {
        'X-Connection-Secret': 'per-request-secret-key',
        'X-API-Key': 'per-request-api-key',
        Authorization: 'Bearer per-request-token',
        Cookie: 'session=per-request-session',
        'X-Allowed-Header': 'safe-request-info',
      },
      sensitiveHeaders: ['X-Connection-Secret', 'X-API-Key'],
      responseValidator: isSource,
    })

    expect(requestsB).toHaveLength(1)
    const req1Headers = requestsB[0].headers
    expect(req1Headers['x-connection-secret']).toBeUndefined()
    expect(req1Headers['x-api-key']).toBeUndefined()
    expect(req1Headers['authorization']).toBeUndefined()
    expect(req1Headers['cookie']).toBeUndefined()
    expect(req1Headers['x-allowed-header']).toBe('safe-request-info')

    // Caso 2: Redirect 302 cross-origin com headers sensíveis passados via config da requisição
    requestsB.length = 0
    await client.get('/redirect-cross-origin', {
      headers: {
        'X-Connection-Secret': 'per-request-secret-redirect',
        Cookie: 'session=per-request-cookie-redirect',
        Authorization: 'Bearer per-request-bearer-redirect',
        'X-Allowed-Custom': 'safe-redirect-info',
      },
      sensitiveHeaders: ['X-Connection-Secret'],
      responseValidator: isSourceAndDestination,
    })

    expect(requestsB).toHaveLength(1)
    const req2Headers = requestsB[0].headers
    expect(req2Headers['x-connection-secret']).toBeUndefined()
    expect(req2Headers['cookie']).toBeUndefined()
    expect(req2Headers['authorization']).toBeUndefined()
    expect(req2Headers['x-allowed-custom']).toBe('safe-redirect-info')
  })

  it('deve aplicar credentials: omit em toda requisição para evitar o cookie jar compartilhado (Seção 8.1)', async () => {
    const capturedCredentials: string[] = []

    const spyTransport: IFetchTransport = {
      async fetch(input, init) {
        if (init.credentials) {
          capturedCredentials.push(init.credentials)
        }
        return globalThis.fetch(input, init)
      },
    }

    const factory = new ElectronHttpClientFactory(
      EMPTY_HTTP_CONFIG,
      spyTransport,
    )
    const client = factory.createClient({
      baseURL: `http://127.0.0.1:${portA}`,
    })

    // Requisição mesma origem
    await client.get('/resource', responseOptions(isSource))
    expect(capturedCredentials).toHaveLength(1)
    expect(capturedCredentials[0]).toBe('omit')

    // Requisição origem cruzada
    await client.get(
      `http://127.0.0.1:${portB}/resource`,
      responseOptions(isSource),
    )
    expect(capturedCredentials).toHaveLength(2)
    expect(capturedCredentials[1]).toBe('omit')

    // Redirecionamento 302 origem cruzada (primeiro hop same-origin -> segundo hop cross-origin)
    capturedCredentials.length = 0
    await client.get(
      '/redirect-cross-origin',
      responseOptions(isSourceAndDestination),
    )
    expect(capturedCredentials).toHaveLength(2)
    expect(capturedCredentials[0]).toBe('omit')
    expect(capturedCredentials[1]).toBe('omit')
  })

  it('deve mascarar parâmetros sensíveis em logs e sanitizar mensagens de diagnóstico (T21)', () => {
    const sensitiveUrl = `http://127.0.0.1:${portA}/atom?key=superSecretAtom123&apiKey=topSecretApi456&token=bearer789&user=dev`
    const sanitized = sanitizeUrlForLogging(sensitiveUrl)

    expect(sanitized).not.toContain('superSecretAtom123')
    expect(sanitized).not.toContain('topSecretApi456')
    expect(sanitized).not.toContain('bearer789')
    expect(sanitized).toContain('key=%5BREDACTED%5D')
    expect(sanitized).toContain('apiKey=%5BREDACTED%5D')
    expect(sanitized).toContain('token=%5BREDACTED%5D')
    expect(sanitized).toContain('user=dev')
  })

  it('deve capturar saída do console e comprovar que nenhuma API key aparece em texto claro durante requisição (T21)', async () => {
    const loggedMessages: string[] = []
    const originalConsoleLog = console.log
    console.log = (...args: string[]) => {
      loggedMessages.push(args.join(' '))
    }

    try {
      const client = new ElectronHttpClient(
        {
          baseURL: `http://127.0.0.1:${portA}`,
        },
        testTransport,
      )

      const rawSecret = 'strictlyConfidentialKey987654'
      await client.get(
        `/test?key=${rawSecret}&param=safe`,
        responseOptions(isSource),
      )

      const combinedLog = loggedMessages.join('\n')
      expect(combinedLog).not.toContain(rawSecret)
      expect(combinedLog).toContain('REDACTED')
    } finally {
      console.log = originalConsoleLog
    }
  })

  it('accepts a real HTTP DELETE 204 as null for a JSON request', async () => {
    const client = new ElectronHttpClient(
      { baseURL: `http://127.0.0.1:${portA}` },
      testTransport,
    )
    const result = await client.delete('/worklog-no-content', {
      responseValidator: (value: JsonValue): value is null => value === null,
    })
    expect(result.isSuccess()).toBe(true)
    expect(result.success).toBeNull()
    expect(requestsA.map((request) => request.method)).toEqual(['DELETE'])
  })

  it('allows an explicit provider error decoder without exposing other payload fields', async () => {
    const client = new ElectronHttpClient(
      { baseURL: `http://127.0.0.1:${portA}` },
      testTransport,
    )
    const options = {
      responseValidator: isSource,
      readErrorMessage: (payload: JsonValue): string | undefined => {
        if (isJsonRecord(payload) && typeof payload.messageKey === 'string')
          return payload.messageKey
        return undefined
      },
    }
    const result = await client.get('/provider-validation-error', options)
    expect(result.failure.statusCode).toBe(422)
    expect(result.failure.messageKey).toBe('WORKLOG_NOT_ALLOWED')
    expect(result.failure.messageKey).not.toContain('must-not-be-exposed')
  })
  it('preserves an explicitly requested empty text response', async () => {
    const client = new ElectronHttpClient(
      { baseURL: `http://127.0.0.1:${portA}` },
      testTransport,
    )
    const result = await client.delete('/worklog-no-content', {
      responseType: 'text',
      responseValidator: (value: JsonValue): value is string =>
        typeof value === 'string',
    })
    expect(result.isSuccess()).toBe(true)
    expect(result.success).toBe('')
  })
  it('does not accept malformed JSON as a bodyless success', async () => {
    const client = new ElectronHttpClient(
      { baseURL: `http://127.0.0.1:${portA}` },
      testTransport,
    )
    const result = await client.get(
      '/malformed-json',
      responseOptions(isSource),
    )
    expect(result.failure.messageKey).toBe('HTTP_RESPONSE_INVALID_JSON')
  })

  it('deve garantir que AppError.Http contenha apenas status seguro e NÃO vaze o corpo de erro com sentinel secreto (T21)', async () => {
    const client = new ElectronHttpClient(
      {
        baseURL: `http://127.0.0.1:${portA}`,
      },
      testTransport,
    )

    const res = await client.get(
      '/error-with-secret',
      responseOptions(isSource),
    )
    expect(res.isFailure()).toBe(true)
    if (res.isFailure()) {
      expect(res.failure.statusCode).toBe(500)
      expect(res.failure.messageKey).toBe('HTTP 500')
      expect(res.failure.messageKey).not.toContain(
        'sentinel-super-confidential-leak-1234567890',
      )
    }
  })

  it('deve sanitizar mensagens em console.error comprovando ausência de sentinela em falhas de rede (T21)', async () => {
    const loggedErrors: string[] = []
    const originalConsoleError = console.error
    console.error = (...args: string[]) => {
      loggedErrors.push(args.join(' '))
    }

    try {
      const client = new ElectronHttpClient(
        {
          baseURL: `http://127.0.0.1:${portA}`,
        },
        testTransport,
      )

      const sentinelInError =
        'ERR_CONNECTION_FAILED http://127.0.0.1:8080?token=sentinelSecret123&apiKey=topSecret'
      const sanitizedMsg = sanitizeUrlForLogging(sentinelInError)
      expect(sanitizedMsg).not.toContain('sentinelSecret123')
      expect(sanitizedMsg).not.toContain('topSecret')
      expect(sanitizedMsg).toContain('REDACTED')

      // Execução real contra porta fechada para disparar console.error
      const sentinelSecret = 'sentinel-network-error-token-xyz-987'
      await client.get(
        `http://127.0.0.1:1/resource?token=${sentinelSecret}`,
        responseOptions(isSource),
      )

      const combinedErrorLog = loggedErrors.join('\n')
      expect(combinedErrorLog).not.toContain(sentinelSecret)
    } finally {
      console.error = originalConsoleError
    }
  })

  it('falha fechada quando uma credencial seria usada numa URL absoluta sem origem base', async () => {
    const sentHeaders: Array<Record<string, string>> = []
    const transport: IFetchTransport = {
      async fetch(_input, init) {
        sentHeaders.push(init.headers)
        return new Response('{"ok":true}', { status: 200 })
      },
    }
    const client = new ElectronHttpClient(
      { headers: { Authorization: 'Bearer origin-secret' } },
      transport,
    )
    const result = await client.get(
      `http://127.0.0.1:${portB}/absolute-without-base`,
      responseOptions(isOk),
    )

    expect(result.isFailure()).toBe(true)
    expect(sentHeaders).toHaveLength(0)
  })

  it('falha fechada quando a origem base é inválida e o destino é absoluto', async () => {
    const sentHeaders: Array<Record<string, string>> = []
    const transport: IFetchTransport = {
      async fetch(_input, init) {
        sentHeaders.push(init.headers)
        return new Response('{"ok":true}', { status: 200 })
      },
    }
    const client = new ElectronHttpClient(
      {
        baseURL: 'not a valid origin',
        headers: { Authorization: 'Bearer origin-secret' },
      },
      transport,
    )
    const result = await client.get(
      `http://127.0.0.1:${portB}/absolute-with-invalid-base`,
      responseOptions(isOk),
    )

    expect(result.isFailure()).toBe(true)
    expect(sentHeaders).toHaveLength(0)
  })

  it('converte POST em GET e remove o body após redirect 303', async () => {
    const requests: Array<{ method: string; body?: string }> = []
    const transport: IFetchTransport = {
      async fetch(_input, init) {
        requests.push({ method: init.method, body: init.body })
        if (requests.length === 1) {
          return new Response(null, {
            status: 303,
            headers: { location: '/post-redirect-target' },
          })
        }
        return new Response('{"ok":true}', { status: 200 })
      },
    }
    const client = new ElectronHttpClient(
      { baseURL: `http://127.0.0.1:${portA}` },
      transport,
    )
    const result = await client.post(
      '/post-redirect',
      { payload: 'private-content' },
      responseOptions(isOk),
    )

    expect(result.isSuccess()).toBe(true)
    expect(requests).toEqual([
      { method: 'POST', body: '{"payload":"private-content"}' },
      { method: 'GET', body: undefined },
    ])
  })

  it('permite cinco redirects e busca a resposta final', async () => {
    let requestCount = 0
    const transport: IFetchTransport = {
      async fetch(input) {
        requestCount += 1
        if (requestCount <= 5) {
          return new Response(null, {
            status: 302,
            headers: { location: `${input}/next` },
          })
        }
        return new Response('{"ok":true}', { status: 200 })
      },
    }
    const client = new ElectronHttpClient(
      { baseURL: `http://127.0.0.1:${portA}` },
      transport,
    )
    const result = await client.get('/redirect-chain', responseOptions(isOk))

    expect(result.isSuccess()).toBe(true)
    expect(requestCount).toBe(6)
  })

  it('limpa o timeout funcional se o transporte rejeitar', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const transport: IFetchTransport = {
      async fetch() {
        throw new Error('transport failure')
      },
    }
    const client = new ElectronHttpClient(
      { baseURL: `http://127.0.0.1:${portA}` },
      transport,
    )

    try {
      await client.get('/transport-failure', responseOptions(isOk))
      expect(clearTimeoutSpy).toHaveBeenCalled()
    } finally {
      clearTimeoutSpy.mockRestore()
    }
  })

  it('remove userinfo e parâmetros comuns de segredo da URL de diagnóstico', () => {
    const sanitized = sanitizeUrlForLogging(
      'https://alice:password-userinfo@example.test/path?client_secret=client-secret&refresh_token=refresh-secret&X-API-Key=header-secret',
    )

    expect(sanitized).not.toContain('alice')
    expect(sanitized).not.toContain('password-userinfo')
    expect(sanitized).not.toContain('client-secret')
    expect(sanitized).not.toContain('refresh-secret')
    expect(sanitized).not.toContain('header-secret')
  })

  it('redacts userinfo in prefixed URLs and keeps only an allowlisted Electron error code', async () => {
    const prefixedMessage = sanitizeUrlForLogging(
      'net::ERR_CONNECTION_REFUSED em https://alice:password-userinfo@example.test/path?token=query-secret',
    )
    expect(prefixedMessage).not.toContain('alice')
    expect(prefixedMessage).not.toContain('password-userinfo')
    expect(prefixedMessage).not.toContain('query-secret')
    expect(prefixedMessage).toContain('ERR_CONNECTION_REFUSED')

    expect(safeElectronNetworkErrorCode('net::ERR_CONNECTION_REFUSED')).toBe(
      'ERR_CONNECTION_REFUSED',
    )
    expect(safeElectronNetworkErrorCode('ERR_SECRET_SENTINEL')).toBe(
      'HTTP_TRANSPORT_FAILED',
    )

    const logs: string[] = []
    const originalConsoleLog = console.log
    const originalConsoleError = console.error
    console.log = (...values: string[]) => logs.push(values.join(' '))
    console.error = (...values: string[]) => logs.push(values.join(' '))
    const requestUrl = `http://alice:password-userinfo@127.0.0.1:${portA}/resource?token=query-secret`
    const transport: IFetchTransport = {
      async fetch(input) {
        throw new Error(`net::ERR_CONNECTION_REFUSED ${input}`)
      },
    }

    try {
      const client = new ElectronHttpClient({ baseURL: requestUrl }, transport)
      const result = await client.get('/next', responseOptions(isSource))
      expect(result.isFailure()).toBe(true)
      if (result.isFailure()) {
        expect(result.failure.messageKey).toContain('ERR_CONNECTION_REFUSED')
        expect(result.failure.messageKey).not.toContain('alice')
        expect(result.failure.messageKey).not.toContain('password-userinfo')
        expect(result.failure.messageKey).not.toContain('query-secret')
      }
      const combinedLogs = logs.join('\n')
      expect(combinedLogs).not.toContain('alice')
      expect(combinedLogs).not.toContain('password-userinfo')
      expect(combinedLogs).not.toContain('query-secret')
    } finally {
      console.log = originalConsoleLog
      console.error = originalConsoleError
    }
  })
})
