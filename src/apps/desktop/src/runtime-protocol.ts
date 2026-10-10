import type {
  CoreCacheQuery,
  CoreCacheResponse,
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
