import type {
  CoreCacheQuery,
  CoreCacheResponse,
  DiagnosticCheckResult,
  DiagnosticOperationalWorkspaceStatus,
  DiagnosticStorageAvailability,
  LocalPersistenceCommand,
  LocalPersistenceResponse,
  LocalRuntimeCommand,
  LocalRuntimeRequest,
  LocalRuntimeResponse,
  LocalRuntimeResult,
  LocalSyncRequest,
  LocalSyncResponse,
} from '@mr-tick/application'

export interface RuntimeRequestPacket<T = LocalRuntimeRequest> {
  requestId: string
  generation: string
  input: T
}

export interface RuntimeReplyPacket<T = LocalRuntimeResponse> {
  requestId: string
  generation: string
  response: T
}

export interface RuntimeStartupFailurePacket {
  generation: string
  stage: string
  error: {
    messageKey: string
    statusCode: number
  }
}

export interface RuntimeDiagnosticProbeResult {
  observedGeneration: string
  workspaces: DiagnosticOperationalWorkspaceStatus[]
  storageEstimate: DiagnosticStorageAvailability
  operationalReadChecks: DiagnosticCheckResult[]
}
export type RuntimeDiagnosticProbeResponse =
  | { ok: true; value: RuntimeDiagnosticProbeResult }
  | { ok: false; error: { messageKey: string; statusCode: number } }

export type RuntimePersistencePacket =
  RuntimeRequestPacket<LocalPersistenceCommand>
export type RuntimePersistenceReply =
  RuntimeReplyPacket<LocalPersistenceResponse>
export type RuntimeSyncPacket = RuntimeRequestPacket<LocalSyncRequest>
export type RuntimeSyncReply = RuntimeReplyPacket<LocalSyncResponse>

export interface RuntimeCommitPacket {
  generation: string
  sequence: number
  command: LocalRuntimeCommand
  result: LocalRuntimeResult
}

export type RuntimeCorePacket = RuntimeRequestPacket<CoreCacheQuery>
export type RuntimeCoreReply = RuntimeReplyPacket<CoreCacheResponse>

export type RuntimeDiagnosticProbePacket = RuntimeRequestPacket<
  Record<string, never>
>
export type RuntimeDiagnosticProbeReply =
  RuntimeReplyPacket<RuntimeDiagnosticProbeResponse>
