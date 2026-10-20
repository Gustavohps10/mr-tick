import {
  HttpPayload,
  IHttpClient,
  IHttpClientConfig,
  IHttpClientFactory,
  IHttpRequestOptions,
  JsonValue,
} from '@mr-tick/adapters/contracts'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { net } from 'electron'
import { z } from 'zod'

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)

const electronNetworkErrorCodes = new Set([
  'ERR_ABORTED',
  'ERR_ADDRESS_UNREACHABLE',
  'ERR_CERT_AUTHORITY_INVALID',
  'ERR_CONNECTION_CLOSED',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_RESET',
  'ERR_FAILED',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_NAME_NOT_RESOLVED',
  'ERR_NETWORK_CHANGED',
  'ERR_TIMED_OUT',
])

export function sanitizeUrlForLogging(rawUrl: string): string {
  const sensitiveKeys = new Set([
    'key',
    'apikey',
    'api_key',
    'token',
    'access_token',
    'password',
    'secret',
    'client_secret',
    'refresh_token',
    'id_token',
    'auth',
  ])

  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return sanitizeUnparsedUrl(rawUrl)
    parsed.username = ''
    parsed.password = ''
    for (const paramKey of Array.from(parsed.searchParams.keys())) {
      const normalizedKey = paramKey.toLowerCase()
      if (
        sensitiveKeys.has(normalizedKey) ||
        normalizedKey.includes('token') ||
        normalizedKey.endsWith('secret') ||
        /api[-_]?key/i.test(normalizedKey)
      ) {
        parsed.searchParams.set(paramKey, '[REDACTED]')
      }
    }
    return parsed.toString()
  } catch {
    return sanitizeUnparsedUrl(rawUrl)
  }
}

function sanitizeUnparsedUrl(rawUrl: string): string {
  const userInfoRedacted = rawUrl.replace(
    /(https?:\/\/)[^\s/@]+@/gi,
    '$1[REDACTED]@',
  )
  return userInfoRedacted.replace(
    /([?&](?:[^=&]*(?:token|secret|api[-_]?key)[^=&]*|key|password|auth)=)([^&]*)/gi,
    '$1[REDACTED]',
  )
}

export function safeElectronNetworkErrorCode(message: string): string {
  const match = message.match(/ERR_[A-Z0-9_]+/)
  if (match === null) return 'HTTP_TRANSPORT_FAILED'
  if (!electronNetworkErrorCodes.has(match[0])) return 'HTTP_TRANSPORT_FAILED'
  return match[0]
}

export interface IFetchTransport {
  fetch(
    input: string,
    init: {
      method: string
      headers: Record<string, string>
      body?: string
      signal: AbortSignal
      redirect?: 'follow' | 'manual'
      credentials?: 'same-origin' | 'omit' | 'include'
    },
  ): Promise<Response>
}

export class DefaultElectronFetchTransport implements IFetchTransport {
  public async fetch(
    input: string,
    init: {
      method: string
      headers: Record<string, string>
      body?: string
      signal: AbortSignal
      redirect?: 'follow' | 'manual'
      credentials?: 'same-origin' | 'omit' | 'include'
    },
  ): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      // net.fetch rejects redirect: manual as "Redirect was cancelled" in Electron.
      // ClientRequest exposes the redirect target before a hop so the client can
      // rebuild headers and strip connection secrets across origins.
      const request = net.request({
        url: input,
        method: init.method,
        headers: init.headers,
        credentials: init.credentials,
        redirect: 'manual',
      })
      let isSettled = false

      const resolveOnce = (response: Response): void => {
        if (isSettled) return
        isSettled = true
        init.signal.removeEventListener('abort', abortRequest)
        resolve(response)
      }
      const rejectOnce = (diagnosticCode: string): void => {
        if (isSettled) return
        isSettled = true
        init.signal.removeEventListener('abort', abortRequest)
        reject(new Error(diagnosticCode))
      }
      const abortRequest = (): void => {
        if (isSettled) return
        isSettled = true
        init.signal.removeEventListener('abort', abortRequest)
        request.abort()
        reject(new Error('HTTP_REQUEST_ABORTED'))
      }

      request.on('error', (error) =>
        rejectOnce(safeElectronNetworkErrorCode(error.message)),
      )
      request.on('redirect', (statusCode, method, redirectUrl) => {
        void method
        resolveOnce(
          new Response(null, {
            status: statusCode,
            headers: { Location: redirectUrl },
          }),
        )
      })
      request.on('response', (incomingResponse) => {
        const chunks: Buffer[] = []
        incomingResponse.on('data', (chunk) => chunks.push(chunk))
        incomingResponse.on('error', () =>
          rejectOnce('HTTP_RESPONSE_STREAM_FAILED'),
        )
        incomingResponse.on('end', () => {
          const headers = new Headers()
          for (const [name, rawValues] of Object.entries(
            incomingResponse.headers,
          )) {
            const values = Array.isArray(rawValues) ? rawValues : [rawValues]
            for (const value of values) headers.append(name, value)
          }
          const responseBody = Buffer.concat(chunks)
          const statusCode = incomingResponse.statusCode
          if (statusCode === 204 || statusCode === 205 || statusCode === 304) {
            resolveOnce(
              new Response(null, {
                status: statusCode,
                headers,
              }),
            )
            return
          }
          resolveOnce(
            new Response(responseBody, {
              status: statusCode,
              headers,
            }),
          )
        })
      })

      if (init.signal.aborted) {
        abortRequest()
        return
      }
      init.signal.addEventListener('abort', abortRequest, { once: true })
      if (init.body !== undefined) {
        request.end(init.body)
        return
      }
      request.end()
    })
  }
}

export class NodeFetchTransport implements IFetchTransport {
  public async fetch(
    input: string,
    init: {
      method: string
      headers: Record<string, string>
      body?: string
      signal: AbortSignal
      redirect?: 'follow' | 'manual'
      credentials?: 'same-origin' | 'omit' | 'include'
    },
  ): Promise<Response> {
    return globalThis.fetch(input, init)
  }
}

export class ElectronHttpClient implements IHttpClient {
  private readonly baseURL: string
  private readonly defaultParams: Record<string, string>
  private readonly defaultHeaders: Record<string, string>
  private readonly timeout: number
  private readonly sensitiveHeaders: ReadonlySet<string>
  private readonly baseOrigin: string | undefined
  private readonly hasInvalidBaseURL: boolean

  private static requestCounter = 0

  constructor(
    config: IHttpClientConfig,
    private readonly transport: IFetchTransport,
  ) {
    let baseURL = ''
    if (config.baseURL) {
      baseURL = config.baseURL.replace(/\/+$/, '')
    }
    this.baseURL = baseURL
    let baseOrigin: string | undefined = undefined
    let hasInvalidBaseURL = false
    if (baseURL) {
      try {
        baseOrigin = new URL(baseURL).origin
      } catch {
        hasInvalidBaseURL = true
      }
    }
    this.baseOrigin = baseOrigin
    this.hasInvalidBaseURL = hasInvalidBaseURL

    const defaultParams: Record<string, string> = {}
    if (config.params) {
      for (const [key, value] of Object.entries(config.params)) {
        defaultParams[key] = value
      }
    }
    this.defaultParams = defaultParams

    const defaultHeaders: Record<string, string> = {}
    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        defaultHeaders[key] = value
      }
    }
    this.defaultHeaders = defaultHeaders

    const sensitiveHeaders = new Set<string>([
      'authorization',
      'cookie',
      'proxy-authorization',
    ])
    if (config.sensitiveHeaders) {
      for (const header of config.sensitiveHeaders) {
        sensitiveHeaders.add(header.toLowerCase())
      }
    }
    this.sensitiveHeaders = sensitiveHeaders

    let timeout = 15000
    if (config.timeout) {
      timeout = config.timeout
    }
    this.timeout = timeout
  }

  public withConfig(config: IHttpClientConfig): ElectronHttpClient {
    let baseURL = this.baseURL
    if (config.baseURL !== undefined) {
      baseURL = config.baseURL
    }

    let timeout = this.timeout
    if (config.timeout !== undefined) {
      timeout = config.timeout
    }

    const mergedHeaders: Record<string, string> = { ...this.defaultHeaders }
    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        mergedHeaders[key] = value
      }
    }

    const mergedParams: Record<string, string> = { ...this.defaultParams }
    if (config.params) {
      for (const [key, value] of Object.entries(config.params)) {
        mergedParams[key] = value
      }
    }

    const sensitiveHeaders = new Set<string>(this.sensitiveHeaders)
    if (config.sensitiveHeaders) {
      for (const header of config.sensitiveHeaders) {
        sensitiveHeaders.add(header.toLowerCase())
      }
    }

    return new ElectronHttpClient(
      {
        baseURL,
        params: mergedParams,
        headers: mergedHeaders,
        timeout,
        sensitiveHeaders: Array.from(sensitiveHeaders),
      },
      this.transport,
    )
  }

  private isSameOrigin(targetUrl: string): boolean {
    if (!this.baseOrigin) return false
    try {
      const target = new URL(targetUrl)
      return this.baseOrigin === target.origin
    } catch {
      return false
    }
  }

  private isSensitiveHeader(
    headerName: string,
    requestSensitiveHeaders: readonly string[] | undefined,
  ): boolean {
    const normalized = headerName.toLowerCase()
    if (this.sensitiveHeaders.has(normalized)) return true
    if (!requestSensitiveHeaders) return false
    return requestSensitiveHeaders.some(
      (header) => header.toLowerCase() === normalized,
    )
  }

  private buildUrl(
    url: string,
    requestParams?: Record<string, string | number | boolean>,
  ): string {
    const isAbsolute = url.startsWith('http://') || url.startsWith('https://')
    let fullUrl = url
    if (!isAbsolute) {
      const sanitizedUrl = url.replace(/^\/+/, '')
      if (this.baseURL) {
        fullUrl = `${this.baseURL}/${sanitizedUrl}`
      }
    }

    const mergedParams: Record<string, string | number | boolean> = {
      ...this.defaultParams,
    }
    if (requestParams) {
      for (const [key, value] of Object.entries(requestParams)) {
        mergedParams[key] = value
      }
    }

    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(mergedParams)) {
      if (value === undefined || value === null) continue
      searchParams.append(key, String(value))
    }

    const queryString = searchParams.toString()
    if (!queryString) return fullUrl

    const separator = fullUrl.includes('?') ? '&' : '?'
    return `${fullUrl}${separator}${queryString}`
  }

  private buildHeaders(
    fullUrl: string,
    requestHeaders: Record<string, string>,
    requestSensitiveHeaders: readonly string[] | undefined,
  ): Record<string, string> {
    const sameOrigin = this.isSameOrigin(fullUrl)
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }

    for (const [key, value] of Object.entries(this.defaultHeaders)) {
      if (!sameOrigin && this.isSensitiveHeader(key, requestSensitiveHeaders)) {
        continue
      }
      headers[key] = value
    }

    if (!sameOrigin) {
      for (const existingKey of Object.keys(headers)) {
        if (this.isSensitiveHeader(existingKey, requestSensitiveHeaders)) {
          delete headers[existingKey]
        }
      }
    }

    for (const [key, value] of Object.entries(requestHeaders)) {
      if (!sameOrigin && this.isSensitiveHeader(key, requestSensitiveHeaders)) {
        continue
      }
      if (value !== undefined && value !== null && value !== '') {
        headers[key] = String(value)
        continue
      }
      delete headers[key]
    }

    return headers
  }

  public async get<T extends JsonValue>(
    url: string,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('GET', url, undefined, config)
  }

  public async post<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('POST', url, data, config)
  }

  public async put<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('PUT', url, data, config)
  }

  public async patch<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('PATCH', url, data, config)
  }

  public async delete<T extends JsonValue>(
    url: string,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('DELETE', url, undefined, config)
  }

  private extractQueryParams<T extends JsonValue>(
    config: IHttpRequestOptions<T>,
  ): Record<string, string | number | boolean> {
    const result: Record<string, string | number | boolean> = {}
    if (!config.params) return result
    for (const key of Object.keys(config.params)) {
      const value = config.params[key]
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        result[key] = value
      }
    }
    return result
  }

  private extractCustomHeaders<T extends JsonValue>(
    config: IHttpRequestOptions<T>,
  ): Record<string, string> {
    const result: Record<string, string> = {}
    if (!config.headers) return result
    for (const key of Object.keys(config.headers)) {
      const value = config.headers[key]
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        result[key] = String(value)
      }
    }
    return result
  }

  private formatRequestBody(
    data: HttpPayload,
    headers: Record<string, string>,
  ): string {
    if (typeof data === 'string') {
      return data
    }
    if (data instanceof URLSearchParams) {
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
      }
      return data.toString()
    }
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json'
    }
    return JSON.stringify(data)
  }

  private async executeFetch(
    url: string,
    options: {
      method: string
      headers: Record<string, string>
      body?: string
      signal: AbortSignal
      redirect?: 'follow' | 'manual'
      credentials?: 'same-origin' | 'omit' | 'include'
    },
  ): Promise<Response> {
    return this.transport.fetch(url, options)
  }

  private async request<T extends JsonValue>(
    method: string,
    url: string,
    data: HttpPayload | undefined,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined
    try {
      const fullUrl = this.buildUrl(url, this.extractQueryParams(config))
      const requestHeaders = this.extractCustomHeaders(config)
      const sensitiveHeaders = config.sensitiveHeaders
      const hasSensitiveHeaders = Object.keys(this.defaultHeaders).some(
        (header) => this.isSensitiveHeader(header, sensitiveHeaders),
      )
      const hasSensitiveRequestHeaders = Object.keys(requestHeaders).some(
        (header) => this.isSensitiveHeader(header, sensitiveHeaders),
      )
      if (
        (!this.baseOrigin || this.hasInvalidBaseURL) &&
        (hasSensitiveHeaders || hasSensitiveRequestHeaders)
      )
        return Either.failure(
          AppError.ValidationError('HTTP_CREDENTIAL_ORIGIN_REQUIRED'),
        )
      const headers = this.buildHeaders(
        fullUrl,
        requestHeaders,
        sensitiveHeaders,
      )

      let body: string | undefined = undefined
      if (data !== undefined && data !== null) {
        body = this.formatRequestBody(data, headers)
      }

      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), this.timeout)

      ElectronHttpClient.requestCounter++
      console.log(
        `[ElectronHttpClient Req #${ElectronHttpClient.requestCounter}] (${method}) ${sanitizeUrlForLogging(fullUrl)}`,
      )

      let currentUrl = fullUrl
      let currentMethod = method
      let currentBody = body
      let bodyDropped = false
      let currentHeaders = headers
      let redirectCount = 0
      const maxRedirects = 5
      let response: Response | null = null

      while (true) {
        const currentResponse = await this.executeFetch(currentUrl, {
          method: currentMethod,
          headers: currentHeaders,
          body: currentBody,
          signal: controller.signal,
          redirect: 'manual',
          credentials: 'omit',
        })

        const isRedirect =
          currentResponse.status === 301 ||
          currentResponse.status === 302 ||
          currentResponse.status === 303 ||
          currentResponse.status === 307 ||
          currentResponse.status === 308

        if (isRedirect) {
          const location = currentResponse.headers.get('location')
          if (location) {
            if (redirectCount >= maxRedirects)
              return Either.failure(
                AppError.Http(310, 'HTTP_TOO_MANY_REDIRECTS'),
              )
            redirectCount++
            const rewriteToGet =
              (currentResponse.status === 303 && currentMethod !== 'HEAD') ||
              ((currentResponse.status === 301 ||
                currentResponse.status === 302) &&
                currentMethod === 'POST')
            if (rewriteToGet) {
              currentMethod = 'GET'
              currentBody = undefined
              bodyDropped = true
            }
            currentUrl = new URL(location, currentUrl).toString()
            currentHeaders = this.buildHeaders(
              currentUrl,
              requestHeaders,
              sensitiveHeaders,
            )
            if (bodyDropped) {
              delete currentHeaders['Content-Type']
              delete currentHeaders['content-type']
              delete currentHeaders['Content-Length']
              delete currentHeaders['content-length']
            }
            continue
          }
        }

        response = currentResponse
        break
      }

      if (!response) {
        return Either.failure(
          AppError.Internal('Número máximo de redirecionamentos excedido.'),
        )
      }

      if (!response.ok) {
        return Either.failure(
          AppError.Http(response.status, `HTTP ${response.status}`),
        )
      }

      if (config.responseType === 'text') {
        const responseText = await response.text()
        if (!config.responseValidator(responseText))
          return Either.failure(
            AppError.ValidationError('HTTP_RESPONSE_INVALID'),
          )
        return Either.success<T>(responseText)
      }

      const text = await response.text()
      try {
        const parsedJson = jsonValueSchema.safeParse(JSON.parse(text))
        if (!parsedJson.success)
          return Either.failure(
            AppError.ValidationError('HTTP_RESPONSE_INVALID_JSON'),
          )
        if (!config.responseValidator(parsedJson.data))
          return Either.failure(
            AppError.ValidationError('HTTP_RESPONSE_INVALID'),
          )
        return Either.success<T>(parsedJson.data)
      } catch {
        return Either.failure(
          AppError.ValidationError('HTTP_RESPONSE_INVALID_JSON'),
        )
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      const safeErrorMessage = sanitizeUrlForLogging(errorObj.message)

      console.error(
        '[ElectronHttpClient] Erro na requisição Chromium net:',
        safeErrorMessage,
      )

      let friendlyMessage = safeErrorMessage
      if (friendlyMessage.length === 0) {
        friendlyMessage = 'Erro de conexao de rede'
      }
      if (safeErrorMessage.includes('ERR_NAME_NOT_RESOLVED')) {
        friendlyMessage = `Não foi possível alcançar o servidor (${safeErrorMessage}). Verifique sua conexão com a internet ou se a VPN corporativa necessária está conectada.`
      }
      if (safeErrorMessage.includes('ERR_CONNECTION_REFUSED')) {
        friendlyMessage = `Conexão recusada pelo servidor (${safeErrorMessage}). Verifique se o serviço está em execução ou se a VPN está conectada.`
      }
      if (safeErrorMessage.includes('ERR_INTERNET_DISCONNECTED')) {
        friendlyMessage = `Computador sem conexão com a internet (${safeErrorMessage}).`
      }

      return Either.failure(AppError.Internal(friendlyMessage))
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }
}

export class ElectronHttpClientFactory implements IHttpClientFactory {
  constructor(
    private readonly baseConfig: IHttpClientConfig,
    private readonly transport: IFetchTransport,
  ) {}

  public createClient(config: IHttpClientConfig): IHttpClient {
    const effectiveConfig = { ...this.baseConfig, ...config }
    return new ElectronHttpClient(effectiveConfig, this.transport)
  }
}
