import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { MetadataDTO } from '../../dtos/MetadataDTO'
import type { ConnectionCredentialPayload } from '../strategies/IAuthenticationStrategy'

/** Source IDs never contain RxDB composite keys. */
export interface CoreConnectionScope {
  workspaceId: string
  connectionInstanceId: string
  authorizationRole?: string
}
/** Addon-only callback; credential access is never exposed through IHostBridge or renderer APIs. */
export type ConnectionCredentialOperation = (
  credentials: ConnectionCredentialPayload,
) => Promise<Either<AppError, void>>
export interface CoreTaskReference extends CoreConnectionScope {
  taskId: string
}
export interface CoreWorkspace {
  id: string
  name: string
  status: 'draft' | 'configured'
}
export interface CoreConnection extends CoreConnectionScope {
  addonId: string
  connectionProfileId: string
  cardinality: 'single' | 'multi'
  status: 'connected' | 'disabled' | 'disconnected' | 'archived'
  identity: CoreConnectionIdentity | null
}
export interface CoreConnectionIdentity {
  kind: 'human' | 'bot' | 'installation'
  displayName: string
  avatarUrl: string | null
}
export interface CoreConnectionCreateInput {
  workspaceId: string
  connectionProfileId: string
}
export interface CoreConnectionAvailability {
  available: boolean
  reason: 'available' | 'profile_missing' | 'cardinality_reached'
}
export interface CoreConnectionAuthorizationRequest {
  authUrl: string
  timeoutMs: number
}
export interface CoreConnectionAuthorizationResponse {
  code: string
  state: string
}
export interface CoreConnectionAuthenticationInput {
  kind: 'credentials'
  authorizationRole?: string
  authProfileId: string
  credentials: Readonly<Record<string, string | number | boolean>>
  configuration: Readonly<Record<string, string | number | boolean>>
}
/** Local cache snapshot. Dates are ISO 8601 strings. */
export interface CoreTask extends CoreTaskReference {
  dataSourceId: string
  title: string
  description?: string
  url?: string
  projectName?: string
  status: { id: string; name: string }
  createdAt: string
  updatedAt: string
}
export interface CoreTaskListRequest extends CoreConnectionScope {
  /** Integer between 1 and 100. Ordered by source task ID ascending. */
  limit: number
  /** Case-insensitive substring of title or source task ID. */
  search?: string
}
export interface CoreTaskPage {
  tasks: CoreTask[]
  hasMore: boolean
}
export interface CoreMetadata extends CoreConnectionScope {
  dataSourceId: string
  lastPulledAt: string | null
  values: MetadataDTO
}
export type CoreRuntimeState = 'starting' | 'ready' | 'restarting' | 'closed'
