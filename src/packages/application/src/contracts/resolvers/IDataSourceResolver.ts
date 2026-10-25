import { AppError, Either } from '@mr-tick/shared/helpers'

import { AuthenticatedMember, IDataSourceAdapter } from './IDataSourceAdapter'

export interface IHttpClientConfig {
  readonly baseURL?: string
  readonly params?: Record<string, string>
  readonly headers?: Record<string, string>
  readonly sensitiveHeaders?: readonly string[]
  readonly timeout?: number
}

export const EMPTY_HTTP_CONFIG: IHttpClientConfig = Object.freeze({})

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export type HttpResponseValidator<T extends JsonValue> = (
  value: JsonValue,
) => value is T

export interface IHttpRequestOptions<T extends JsonValue> {
  /** Opt-in provider decoder. Return only approved, user-facing error fields; never the entire body. */
  readonly readErrorMessage?: (payload: JsonValue) => string | undefined
  readonly params?: Record<string, string | number | boolean>
  readonly headers?: Record<string, string>
  readonly sensitiveHeaders?: readonly string[]
  readonly timeout?: number
  readonly responseType?: 'json' | 'text'
  readonly responseValidator: HttpResponseValidator<T>
}

export type HttpPayload =
  | Record<
      string,
      | boolean
      | number
      | string
      | null
      | undefined
      | object
      | Array<boolean | number | string | object>
    >
  | string

export interface IHttpClient {
  get<T extends JsonValue>(
    url: string,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>>
  post<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>>
  put<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>>
  patch<T extends JsonValue>(
    url: string,
    data: HttpPayload,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>>
  delete<T extends JsonValue>(
    url: string,
    config: IHttpRequestOptions<T>,
  ): Promise<Either<AppError, T>>
  withConfig(config: IHttpClientConfig): IHttpClient
}

export interface IHttpClientFactory {
  createClient(config: IHttpClientConfig): IHttpClient
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
  authenticatedMemberData?: AuthenticatedMember
  config?: Record<string, string | number | boolean>
  credentials?: Record<string, string | number | boolean>
  oauth?: IDataSourceOAuthAPI
  scope: {
    workspaceId: string
    connectionInstanceId: string
  }
}

export type DataSourceOverrideContext = Omit<
  DataSourceContext,
  'httpClient' | 'scope'
> & {
  scope?: DataSourceContext['scope']
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
    contextOverride?: Partial<DataSourceOverrideContext>,
  ): Promise<Either<AppError, IDataSourceAdapter>>

  getDataSourcesForWorkspace(
    workspaceId: string,
  ): Promise<Either<AppError, ResolvedConnection[]>>
}
