import { AppError, Either } from '@mr-tick/shared/helpers'
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios'

import { IHttpClient, IHttpClientConfig } from '@/contracts/IHttpClient'

export class HttpClient implements IHttpClient {
  private axiosInstance: AxiosInstance
  private defaultParams: Record<string, string> = {}
  private defaultHeaders: Record<string, string> = {}

  constructor() {
    this.axiosInstance = axios.create({
      headers: {
        'User-Agent': 'Mr-tickApp/1.0',
      },
    })
  }

  public configure(config: IHttpClientConfig): void {
    this.defaultParams = config.params ?? {}
    this.defaultHeaders = config.headers ?? {}
    this.axiosInstance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout ?? 10000,
      headers: {
        'User-Agent': 'Mr-tickApp/1.0',
        ...this.defaultHeaders,
      },
    })
  }

  private mergeConfig(config?: AxiosRequestConfig): AxiosRequestConfig {
    return {
      ...config,
      params: {
        ...this.defaultParams,
        ...(config?.params ?? {}),
      },
      headers: {
        ...this.defaultHeaders,
        ...(config?.headers ?? {}),
      },
    }
  }

  async get<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    try {
      const { data } = await this.axiosInstance.get<T>(
        url,
        this.mergeConfig(config),
      )
      return Either.success(data)
    } catch (error) {
      return this.handleError(error)
    }
  }

  async post<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    try {
      const response = await this.axiosInstance.post<T>(
        url,
        data,
        this.mergeConfig(config),
      )
      return Either.success(response.data)
    } catch (error) {
      return this.handleError(error)
    }
  }

  async put<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    try {
      const response = await this.axiosInstance.put<T>(
        url,
        data,
        this.mergeConfig(config),
      )
      return Either.success(response.data)
    } catch (error) {
      return this.handleError(error)
    }
  }

  async patch<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    try {
      const response = await this.axiosInstance.patch<T>(
        url,
        data,
        this.mergeConfig(config),
      )
      return Either.success(response.data)
    } catch (error) {
      return this.handleError(error)
    }
  }

  async delete<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<Either<AppError, T>> {
    try {
      const response = await this.axiosInstance.delete<T>(
        url,
        this.mergeConfig(config),
      )
      return Either.success(response.data)
    } catch (error) {
      return this.handleError(error)
    }
  }

  private handleError(error: unknown): Either<AppError, never> {
    if (error instanceof AxiosError) {
      const message =
        error.response?.data?.message || error.message || 'HTTP Request Failed'
      const status = error.response?.status

      if (status !== undefined)
        return Either.failure(AppError.Http(status, message))
      return Either.failure(AppError.Internal(message))
    }

    const appError = AppError.Internal('An unknown error occurred')
    return Either.failure(appError)
  }
}
