import { IHttpClient, IHttpClientConfig } from '@mr-tick/adapters/contracts'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { AxiosRequestConfig } from 'axios'
import { net } from 'electron'

export class ElectronHttpClient implements IHttpClient {
  private baseURL = ''
  private defaultParams: Record<string, string> = {}
  private defaultHeaders: Record<string, string> = {}
  private timeout = 15000

  private requestCount = 0

  public configure(config: IHttpClientConfig): void {
    this.baseURL = config.baseURL ? config.baseURL.replace(/\/$/, '') : ''
    this.defaultParams = config.params ?? {}
    this.defaultHeaders = config.headers ?? {}
    if (config.timeout) this.timeout = config.timeout
  }

  private buildUrl(url: string, requestParams?: Record<string, any>): string {
    let fullUrl =
      url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `${this.baseURL}/${url.replace(/^\//, '')}`

    const mergedParams = {
      ...this.defaultParams,
      ...(requestParams ?? {}),
    }

    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(mergedParams)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value))
      }
    }

    const queryString = searchParams.toString()
    if (queryString) {
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString
    }

    return fullUrl
  }

  private buildHeaders(requestHeaders?: any): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...this.defaultHeaders,
    }

    if (requestHeaders) {
      for (const [key, value] of Object.entries(requestHeaders)) {
        if (value !== undefined && value !== null && value !== '') {
          headers[key] = String(value)
        } else if (value === '' || value === undefined) {
          delete headers[key]
        }
      }
    }

    return headers
  }

  public async get<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('GET', url, undefined, config)
  }

  public async post<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('POST', url, data, config)
  }

  public async put<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('PUT', url, data, config)
  }

  public async patch<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('PATCH', url, data, config)
  }

  public async delete<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    return this.request<T>('DELETE', url, undefined, config)
  }

  private async request<T>(
    method: string,
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    try {
      const fullUrl = this.buildUrl(url, config?.params)
      const headers = this.buildHeaders(config?.headers)

      let body: string | undefined = undefined
      if (data !== undefined && data !== null) {
        if (typeof data === 'string') {
          body = data
        } else if (data instanceof URLSearchParams) {
          body = data.toString()
          if (!headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
          }
        } else {
          body = JSON.stringify(data)
          if (!headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = 'application/json'
          }
        }
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      console.log(
        `[ElectronHttpClient Req #${++this.requestCount}] (${method}) ${fullUrl}`,
      )

      const response = await net.fetch(fullUrl, {
        method,
        headers,
        body,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Se redirecionou para a tela de login ou se retornou HTML onde se esperava XML/Atom
      const finalUrl = response.url || ''
      const contentType = response.headers.get('content-type') || ''
      const isAtomOrXml = fullUrl.includes('.atom') || fullUrl.includes('.xml')

      if (
        finalUrl.includes('/login') ||
        (isAtomOrXml && contentType.includes('text/html'))
      ) {
        console.warn(
          `[ElectronHttpClient] Redirecionado para a tela de login ao acessar ${fullUrl}`,
        )
        return Either.failure(
          AppError.Unauthorized(
            'Redmine redirecionou a requisição do Atom para a página de login (Acesso Negado / Chave inválida).',
          ),
        )
      }

      if (!response.ok) {
        const errorText = await response.text()
        const message = errorText ? errorText : `HTTP ${response.status}`
        return Either.failure(AppError.Http(response.status, message))
      }

      let responseData: any
      if (config?.responseType === 'text') {
        responseData = await response.text()
      } else {
        const text = await response.text()
        try {
          responseData = JSON.parse(text)
        } catch {
          responseData = text
        }
      }

      return Either.success(responseData as T)
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      const originalMessage = errorObj.message

      console.error(
        '[ElectronHttpClient] Erro na requisição Chromium net:',
        originalMessage,
      )

      let friendlyMessage = originalMessage || 'Erro de conexão de rede'
      if (originalMessage.includes('ERR_NAME_NOT_RESOLVED')) {
        friendlyMessage = `Não foi possível alcançar o servidor (${originalMessage}). Verifique sua conexão com a internet ou se a VPN corporativa necessária está conectada.`
      }
      if (originalMessage.includes('ERR_CONNECTION_REFUSED')) {
        friendlyMessage = `Conexão recusada pelo servidor (${originalMessage}). Verifique se o serviço está em execução ou se a VPN está conectada.`
      }
      if (originalMessage.includes('ERR_INTERNET_DISCONNECTED')) {
        friendlyMessage = `Computador sem conexão com a internet (${originalMessage}).`
      }

      return Either.failure(AppError.Internal(friendlyMessage))
    }
  }
}
