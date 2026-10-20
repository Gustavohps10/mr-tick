import {
  AppError,
  Either,
  isNonEmptyString,
  isRecord,
} from '@mr-tick/shared/helpers'
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios'

import {
  HttpPayload,
  IHttpClient,
  IHttpClientConfig,
  IHttpClientFactory,
  IHttpRequestOptions,
  JsonValue,
} from '@/contracts/IHttpClient'

export class HttpClient implements IHttpClient {
  private readonly axiosInstance: AxiosInstance
  private readonly defaultParams: Record<string, string>
  private readonly defaultHeaders: Record<string, string>
  private readonly baseURL: string
  private readonly timeout: number

  constructor(config: IHttpClientConfig) {
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

    let timeout = 10000
    if (config.timeout) {
      timeout = config.timeout
    }
    this.timeout = timeout

    this.axiosInstance = axios.create({
      baseURL: this.baseURL ? this.baseURL : undefined,
      timeout: this.timeout,
      headers: {
        'User-Agent': 'Mr-tickApp/1.0',
        ...this.defaultHeaders,
      },
    })
  }

  public withConfig(config: IHttpClientConfig): HttpClient {
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

    return new HttpClient({
      baseURL,
      params: mergedParams,
      headers: mergedHeaders,
      timeout,
    })
  }

  private mergeConfig<T extends JsonValue>(
    config: IHttpRequestOptions<T>,
  ): AxiosRequestConfig {
    const mergedParams: Record<string, string> = { ...this.defaultParams }
    if (config.params) {
      for (const [key, value] of Object.entries(config.params)) {
        if (typeof value === 'string') {
          mergedParams[key] = value
        }
      }
    }

    const mergedHeaders: Record<string, string> = { ...this.defaultHeaders }
    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        if (typeof value === 'string') {
          mergedHeaders[key] = value
        }
      }
    }

    const axiosConfig: AxiosRequestConfig = {
      params: mergedParams,
      headers: mergedHeaders,
    }
    if (config.timeout !== undefined) axiosConfig.timeout = config.timeout
    if (config.responseType !== undefined) {
      axiosConfig.responseType = config.responseType
    }
    return axiosConfig
  }

  async get<T extends JsonValue>(
    url: string,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    try {
      const { data } = await this.axiosInstance.get<JsonValue>(
        url,
        this.mergeConfig(config),
      )
      if (!config.responseValidator(data))
        return Either.failure(AppError.ValidationError('HTTP_RESPONSE_INVALID'))
      return Either.success(data)
    } catch (error) {
      return this.handleError(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  async post<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    try {
      const response = await this.axiosInstance.post<JsonValue>(
        url,
        data,
        this.mergeConfig(config),
      )
      if (!config.responseValidator(response.data))
        return Either.failure(AppError.ValidationError('HTTP_RESPONSE_INVALID'))
      return Either.success(response.data)
    } catch (error) {
      return this.handleError(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  async put<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    try {
      const response = await this.axiosInstance.put<JsonValue>(
        url,
        data,
        this.mergeConfig(config),
      )
      if (!config.responseValidator(response.data))
        return Either.failure(AppError.ValidationError('HTTP_RESPONSE_INVALID'))
      return Either.success(response.data)
    } catch (error) {
      return this.handleError(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  async patch<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    try {
      const response = await this.axiosInstance.patch<JsonValue>(
        url,
        data,
        this.mergeConfig(config),
      )
      if (!config.responseValidator(response.data))
        return Either.failure(AppError.ValidationError('HTTP_RESPONSE_INVALID'))
      return Either.success(response.data)
    } catch (error) {
      return this.handleError(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  async delete<T extends JsonValue>(
    url: string,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>> {
    try {
      const response = await this.axiosInstance.delete<JsonValue>(
        url,
        this.mergeConfig(config),
      )
      if (!config.responseValidator(response.data))
        return Either.failure(AppError.ValidationError('HTTP_RESPONSE_INVALID'))
      return Either.success(response.data)
    } catch (error) {
      return this.handleError(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  private handleError(error: Error | AxiosError): Either<AppError, never> {
    if (error instanceof AxiosError) {
      let message = error.message ? error.message : 'HTTP Request Failed'
      if (
        isRecord(error.response?.data) &&
        isNonEmptyString(error.response.data.message)
      ) {
        message = error.response.data.message
      }
      const status = error.response?.status
      if (status !== undefined) {
        return Either.failure(AppError.Http(status, message))
      }
      return Either.failure(AppError.Internal(message))
    }

    return Either.failure(
      AppError.Internal(
        error.message ? error.message : 'An unknown error occurred',
      ),
    )
  }
}

export class HttpClientFactory implements IHttpClientFactory {
  constructor(private readonly baseConfig: IHttpClientConfig) {}

  public createClient(config: IHttpClientConfig): IHttpClient {
    const effectiveConfig = { ...this.baseConfig, ...config }
    return new HttpClient(effectiveConfig)
  }
}
