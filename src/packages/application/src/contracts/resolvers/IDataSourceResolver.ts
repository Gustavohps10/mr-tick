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

export interface DataSourcePKCEPair {
  codeVerifier: string
  codeChallenge: string
}

export interface DataSourceOAuthAuthorizeOptions {
  authUrl: string
  state?: string
  timeoutMs?: number
}

export interface DataSourceOAuthResult {
  code: string
  state?: string
  [param: string]: string | undefined
}

export interface IDataSourceOAuthAPI {
  generatePKCE(): DataSourcePKCEPair
  generateState(prefix?: string): string
  authorize(
    options: DataSourceOAuthAuthorizeOptions,
  ): Promise<DataSourceOAuthResult>
}

export interface DataSourceContext {
  httpClient: IHttpClient
  authenticatedMemberData?: MemberDTO
  config?: Record<string, string | number | boolean>
  credentials?: Record<string, string | number | boolean>
  oauth?: IDataSourceOAuthAPI
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
