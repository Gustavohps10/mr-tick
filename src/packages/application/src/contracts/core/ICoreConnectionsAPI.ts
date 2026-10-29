import type { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  ConnectionCredentialOperation,
  CoreConnection,
  CoreConnectionAuthenticationInput,
  CoreConnectionAuthorizationRequest,
  CoreConnectionAuthorizationResponse,
  CoreConnectionCreateInput,
  CoreConnectionScope,
} from './CoreContext'

export interface ICoreConnectionsReadAPI {
  list(
    workspaceId: string,
    filter?: { capability?: string },
  ): Promise<Either<AppError, CoreConnection[]>>
  get(scope: CoreConnectionScope): Promise<Either<AppError, CoreConnection>>
}
export interface ICoreConnectionsAPI extends ICoreConnectionsReadAPI {
  create(
    input: CoreConnectionCreateInput,
  ): Promise<Either<AppError, CoreConnection>>
  createAuthorizationRequest(
    scope: CoreConnectionScope,
  ): Promise<Either<AppError, CoreConnectionAuthorizationRequest>>
  completeAuthentication(
    scope: CoreConnectionScope,
    response: CoreConnectionAuthorizationResponse,
  ): Promise<Either<AppError, CoreConnection>>
  submitCredentials(
    scope: CoreConnectionScope,
    input: CoreConnectionAuthenticationInput,
  ): Promise<Either<AppError, CoreConnection>>
  withCredentials(
    scope: CoreConnectionScope,
    operation: ConnectionCredentialOperation,
  ): Promise<Either<AppError, void>>
  refresh(scope: CoreConnectionScope): Promise<Either<AppError, void>>
  disconnect(scope: CoreConnectionScope): Promise<Either<AppError, void>>
  archive(scope: CoreConnectionScope): Promise<Either<AppError, void>>
  restore(scope: CoreConnectionScope): Promise<Either<AppError, CoreConnection>>
  remove(scope: CoreConnectionScope): Promise<Either<AppError, void>>
}
