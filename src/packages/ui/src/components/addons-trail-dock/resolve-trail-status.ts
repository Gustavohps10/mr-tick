export type TrailStatus =
  | 'load_failure'
  | 'auth_error'
  | 'disabled'
  | 'sync_error'
  | 'syncing'
  | 'connected'
  | 'no_connection'

export interface ResolveTrailStatusParams {
  hasLoadFailure: boolean
  hasAuthError?: boolean
  isDisabled?: boolean
  hasSyncError?: boolean
  isSyncing?: boolean
  hasActiveConnections?: boolean
}

export function resolveTrailStatus(
  params: ResolveTrailStatusParams,
): TrailStatus {
  if (params.hasLoadFailure) {
    return 'load_failure'
  }

  if (params.hasAuthError) {
    return 'auth_error'
  }

  if (params.isDisabled) {
    return 'disabled'
  }

  if (params.hasSyncError) {
    return 'sync_error'
  }

  if (params.isSyncing) {
    return 'syncing'
  }

  if (params.hasActiveConnections) {
    return 'connected'
  }

  return 'no_connection'
}
