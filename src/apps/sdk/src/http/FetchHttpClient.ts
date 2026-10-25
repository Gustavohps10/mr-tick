import { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  HttpPayload,
  IHttpClient,
  IHttpClientConfig,
  IHttpRequestOptions,
  JsonValue,
} from '../contracts/host/http'

export class FetchHttpClient implements IHttpClient {
  private readonly baseURL: string
  private readonly defaultParams: Record<string, string>
  private readonly defaultHeaders: Record<string, string>
  private readonly timeout: number

  constructor(config: IHttpClientConfig = {}) {
    let baseURL = ''
    if (config.baseURL) {
      baseURL = config.baseURL.replace(/\/+$/, '')
    }
    this.baseURL = baseURL

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

    let timeout = 15000
    if (config.timeout !== undefined) {
      timeout = config.timeout
    }
    this.timeout = timeout
  }

  public withConfig(config: IHttpClientConfig): FetchHttpClient {
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

    return new FetchHttpClient({
      baseURL,
      params: mergedParams,
      headers: mergedHeaders,
      timeout,
    })
  }

  private buildUrl(
    url: string,
    params?: Record<string, string | number | boolean>,
  ): string {
    const isAbsolute = url.startsWith('http://') || url.startsWith('https://')
    let fullUrl = url
    if (!isAbsolute) {
      const sanitized = url.replace(/^\/+/, '')
      if (this.baseURL) {
        fullUrl = `${this.baseURL}/${sanitized}`
      }
    }

    const mergedParams: Record<string, string | number | boolean> = {
      ...this.defaultParams,
    }
    if (params) {
      for (const [key, value] of Object.entries(params)) {
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
    requestHeaders?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.defaultHeaders,
    }
    if (requestHeaders) {
      for (const [key, value] of Object.entries(requestHeaders)) {
        headers[key] = value
      }
    }
    return headers
  }

  private formatBody(
    data: HttpPayload | undefined,
    headers: Record<string, string>,
  ): BodyInit | undefined {
    if (data === undefined) return undefined
    if (typeof data === 'string') return data
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

  private async request<T extends JsonValue>(
    method: string,
    url: string,
    data: HttpPayload | undefined,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    let timeout = this.timeout
    if (config.timeout !== undefined) {
      timeout = config.timeout
    }

    const signal = timeout > 0 ? AbortSignal.timeout(timeout) : undefined

    try {
      const fullUrl = this.buildUrl(url, config.params)
      const headers = this.buildHeaders(config.headers)
      const body = this.formatBody(data, headers)

      const response = await fetch(fullUrl, {
        method,
        headers,
        body,
        signal,
      })

      if (!response.ok) {
        let errorPayload: JsonValue = null
        try {
          const text = await response.text()
          try {
            errorPayload = JSON.parse(text)
          } catch {
            errorPayload = text
          }
        } catch {
          errorPayload = null
        }

        if (config.readErrorMessage) {
          const customMessage = config.readErrorMessage(errorPayload)
          if (customMessage !== undefined) {
            return Either.failure(AppError.Http(response.status, customMessage))
          }
        }

        let message = `Request failed with status code ${response.status}`
        if (
          typeof errorPayload === 'object' &&
          errorPayload !== null &&
          !Array.isArray(errorPayload)
        ) {
          const candidateRecord: Record<string, JsonValue> = errorPayload
          if (typeof candidateRecord.message === 'string') {
            message = candidateRecord.message
          }
        }
        if (
          typeof errorPayload === 'string' &&
          errorPayload.trim().length > 0 &&
          !errorPayload.trim().startsWith('<')
        ) {
          message = errorPayload.trim()
        }
        return Either.failure(AppError.Http(response.status, message))
      }

      if (config.responseType === 'text') {
        const text = await response.text()
        const candidate: JsonValue = text
        if (!config.responseValidator(candidate)) {
          return Either.failure(
            AppError.ValidationError('HTTP_RESPONSE_INVALID'),
          )
        }
        return Either.success<T>(candidate)
      }

      if (response.status === 204 || response.status === 205) {
        const noContent: JsonValue = null
        if (!config.responseValidator(noContent)) {
          return Either.failure(
            AppError.ValidationError('HTTP_RESPONSE_INVALID'),
          )
        }
        return Either.success<T>(noContent)
      }

      const text = await response.text()
      let parsed: JsonValue = null
      try {
        parsed = JSON.parse(text)
      } catch {
        return Either.failure(
          AppError.ValidationError('HTTP_RESPONSE_INVALID_JSON'),
        )
      }

      if (!config.responseValidator(parsed)) {
        return Either.failure(AppError.ValidationError('HTTP_RESPONSE_INVALID'))
      }

      return Either.success<T>(parsed)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (error instanceof Error && error.name === 'TimeoutError') {
        return Either.failure(
          AppError.Http(504, 'Requisição expirou por timeout'),
        )
      }
      return Either.failure(AppError.Http(503, message))
    }
  }

  public get<T extends JsonValue>(
    url: string,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('GET', url, undefined, config)
  }

  public post<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('POST', url, data, config)
  }

  public put<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('PUT', url, data, config)
  }

  public patch<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('PATCH', url, data, config)
  }

  public delete<T extends JsonValue>(
    url: string,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('DELETE', url, undefined, config)
  }
}
