import { AppError, Either } from '@mr-tick/shared/helpers'

import { MemberDTO } from '@/dtos'

import { IDataSourceAdapter } from './IDataSourceAdapter'

export interface IHttpClientConfig {
  baseURL: string
  params?: Record<string, string>
  headers?: Record<string, string>
  timeout?: number
}

export interface IHttpClient {
  configure(config: IHttpClientConfig): void
  get<T>(url: string, config?: unknown): Promise<Either<AppError, T>>
  post<T>(
    url: string,
    data?: unknown,
    config?: unknown,
  ): Promise<Either<AppError, T>>
  put<T>(
    url: string,
    data?: unknown,
    config?: unknown,
  ): Promise<Either<AppError, T>>
  patch<T>(
    url: string,
    data?: unknown,
    config?: unknown,
  ): Promise<Either<AppError, T>>
  delete<T>(url: string, config?: unknown): Promise<Either<AppError, T>>
}

export interface DataSourceContext {
  httpClient: IHttpClient
  authenticatedMemberData?: MemberDTO
  config?: Record<string, string | number | boolean>
  credentials?: Record<string, string | number | boolean>
}

export interface ResolvedConnection {
  id: string
  dataSourceId: string
  config?: Record<string, string | number | boolean>
}

export interface IDataSourceResolver {
  getDataSource(
    workspaceId: string,
    pluginId: string,
    contextOverride?: Partial<DataSourceContext>,
  ): Promise<IDataSourceAdapter>

  getDataSourcesForWorkspace(workspaceId: string): Promise<ResolvedConnection[]>
}
