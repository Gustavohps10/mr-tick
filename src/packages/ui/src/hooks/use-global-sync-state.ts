import {
  isReplicationForbidden,
  isReplicationUnauthorized,
} from '@/stores/sync-store/ReplicationError'
import {
  ReplicationStatus,
  useConnectionsWithSync,
  useSyncInitializationError,
  useSyncStore,
} from '@/stores/syncStore'

export type GlobalSyncStatus =
  | 'initializing'
  | 'local_only'
  | 'auth_error'
  | 'technical_error'
  | 'reconciling'
  | 'syncing'
  | 'pulling'
  | 'pushing'
  | 'pending_connections'
  | 'synced'

export interface GlobalSyncState {
  status: GlobalSyncStatus
  color: string
  label: string
  icon: 'sync' | 'local' | 'reconcile' | 'pull' | 'push'
  isAnyPulling: boolean
  isAnyPushing: boolean
  isAnyReconciling: boolean
  isAnySyncingGlobally: boolean
  hasRemote: boolean
}

export function useGlobalSyncState(): GlobalSyncState {
  const initializationError = useSyncInitializationError()
  const connections = useConnectionsWithSync()
  const isInitialized = useSyncStore((s) => s.isInitialized) ?? false

  const hasRemote = connections.length > 0
  const allStatuses = connections.flatMap((c) =>
    Object.values(c.sync).filter((v): v is ReplicationStatus => Boolean(v)),
  )

  const isAnyPulling = allStatuses.some((v) => v.isPulling)
  const isAnyPushing = allStatuses.some((v) => v.isPushing)
  const isAnyReconciling = allStatuses.some((v) => v.isReconciling)
  const isAnySyncingGlobally = isAnyPulling || isAnyPushing || isAnyReconciling

  if (initializationError !== null) {
    return {
      status: 'technical_error',
      color: 'bg-destructive',
      label: 'Falha ao inicializar workspace',
      icon: 'sync',
      isAnyPulling,
      isAnyPushing,
      isAnyReconciling,
      isAnySyncingGlobally,
      hasRemote,
    }
  }

  if (!isInitialized) {
    return {
      status: 'initializing',
      color: 'bg-muted',
      label: 'Inicializando...',
      icon: 'sync',
      isAnyPulling,
      isAnyPushing,
      isAnyReconciling,
      isAnySyncingGlobally,
      hasRemote,
    }
  }

  if (!hasRemote) {
    return {
      status: 'local_only',
      color: 'bg-zinc-400',
      label: 'Modo Local',
      icon: 'local',
      isAnyPulling,
      isAnyPushing,
      isAnyReconciling,
      isAnySyncingGlobally,
      hasRemote,
    }
  }

  const anyUnauthorized = allStatuses.some((v) =>
    isReplicationUnauthorized(v.error),
  )
  if (anyUnauthorized) {
    return {
      status: 'auth_error',
      color: 'bg-amber-500',
      label: 'Autenticação necessária',
      icon: 'sync',
      isAnyPulling,
      isAnyPushing,
      isAnyReconciling,
      isAnySyncingGlobally,
      hasRemote,
    }
  }

  const anyForbidden = allStatuses.some((v) => isReplicationForbidden(v.error))
  if (anyForbidden) {
    return {
      status: 'technical_error',
      color: 'bg-destructive',
      label: 'Permissão insuficiente',
      icon: 'sync',
      isAnyPulling,
      isAnyPushing,
      isAnyReconciling,
      isAnySyncingGlobally,
      hasRemote,
    }
  }

  const technicalError = allStatuses.find(
    (v) =>
      v.error &&
      !isReplicationUnauthorized(v.error) &&
      !isReplicationForbidden(v.error),
  )
  if (technicalError) {
    return {
      status: 'technical_error',
      color: 'bg-destructive',
      label: 'Erro técnico',
      icon: 'sync',
      isAnyPulling,
      isAnyPushing,
      isAnyReconciling,
      isAnySyncingGlobally,
      hasRemote,
    }
  }

  if (isAnyReconciling) {
    return {
      status: 'reconciling',
      color: 'bg-destructive animate-pulse',
      label: 'Conciliando exclusões...',
      icon: 'reconcile',
      isAnyPulling,
      isAnyPushing,
      isAnyReconciling,
      isAnySyncingGlobally,
      hasRemote,
    }
  }

  if (isAnyPulling && isAnyPushing) {
    return {
      status: 'syncing',
      color: 'bg-blue-500 animate-pulse',
      label: 'Sincronizando (Download & Upload)...',
      icon: 'sync',
      isAnyPulling,
      isAnyPushing,
      isAnyReconciling,
      isAnySyncingGlobally,
      hasRemote,
    }
  }

  if (isAnyPulling) {
    return {
      status: 'pulling',
      color: 'bg-blue-500 animate-pulse',
      label: 'Baixando atualizações (Pull)...',
      icon: 'pull',
      isAnyPulling,
      isAnyPushing,
      isAnyReconciling,
      isAnySyncingGlobally,
      hasRemote,
    }
  }

  if (isAnyPushing) {
    return {
      status: 'pushing',
      color: 'bg-amber-500 animate-pulse',
      label: 'Enviando alterações (Push)...',
      icon: 'push',
      isAnyPulling,
      isAnyPushing,
      isAnyReconciling,
      isAnySyncingGlobally,
      hasRemote,
    }
  }

  const anyDisconnected = allStatuses.some((v) => v.lastReplication === null)
  if (anyDisconnected) {
    return {
      status: 'pending_connections',
      color: 'bg-zinc-400',
      label: 'Conexões pendentes',
      icon: 'sync',
      isAnyPulling,
      isAnyPushing,
      isAnyReconciling,
      isAnySyncingGlobally,
      hasRemote,
    }
  }

  return {
    status: 'synced',
    color: 'bg-green-500',
    label: 'Sincronizado',
    icon: 'sync',
    isAnyPulling,
    isAnyPushing,
    isAnyReconciling,
    isAnySyncingGlobally,
    hasRemote,
  }
}
