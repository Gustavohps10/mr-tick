import type {
  ConnectionIdentity,
  ConnectionProfileDescriptor,
  Workspace,
} from '@mr-tick/domain'
import type { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  ConnectionCredentialOperation,
  CoreConnectionScope,
} from './CoreContext'
import type {
  AuthenticationResult,
  ConnectionConfigPayload,
} from './IAddonConnectionAuthenticator'

export type ConnectionLifecycleAuthentication =
  { kind: 'identity'; identity: ConnectionIdentity } | { kind: 'none' }

export type ConnectionLifecycleScope = {
  workspaceId: string
  connectionInstanceId: string
  addonId: string
  profile: ConnectionProfileDescriptor
}

export type ConnectionLifecycleConnectInput = ConnectionLifecycleScope &
  (
    | {
        method: 'none'
        configuration: ConnectionConfigPayload
      }
    | {
        method: 'authorized'
        authorizationRole: string
        authProfileId: string
        configuration: ConnectionConfigPayload
        correlation?: {
          readonly connectionGeneration: number
          readonly authorizationGeneration: number
          readonly authorizationId?: string
        }
        authenticate: () => Promise<
          Either<
            AppError,
            Extract<AuthenticationResult, { kind: 'authorized' }>
          >
        >
      }
  )

export interface IConnectionLifecycleCoordinator {
  create(input: ConnectionLifecycleScope): Promise<Either<AppError, Workspace>>
  connect(
    input: ConnectionLifecycleConnectInput,
  ): Promise<Either<AppError, ConnectionLifecycleAuthentication>>
  withCredentials(input: {
    addonId: string
    scope: CoreConnectionScope & { authorizationRole: string }
    operation: ConnectionCredentialOperation
  }): Promise<Either<AppError, void>>
  refresh(input: {
    addonId: string
    scope: CoreConnectionScope & { authorizationRole?: string }
  }): Promise<Either<AppError, void>>
  disconnect(input: {
    workspaceId: string
    connectionInstanceId: string
    addonId: string
  }): Promise<Either<AppError, void>>
  archive(input: {
    workspaceId: string
    connectionInstanceId: string
    addonId: string
  }): Promise<Either<AppError, void>>
  restore(input: {
    workspaceId: string
    connectionInstanceId: string
    addonId: string
  }): Promise<Either<AppError, Workspace>>
}
