import type {
  CoreConnectionScope,
  CoreMember,
  CoreMetadata,
  CoreTask,
  CoreTaskListRequest,
  CoreTaskPage,
  CoreTaskReference,
} from './CoreContext'
import type { ICoreRuntimeAPI } from './ICoreRuntimeAPI'

/** Internal transport port; adapters serialize Either at their boundary. */
export type CoreCacheQuery =
  | ({ action: 'tasks' } & CoreTaskListRequest)
  | ({ action: 'task' } & CoreTaskReference)
  | ({ action: 'metadata' } & CoreConnectionScope)
  | ({ action: 'currentUser' } & CoreConnectionScope)
export type CoreCacheValue =
  | ({ kind: 'tasks' } & CoreTaskPage)
  | { kind: 'task'; task: CoreTask }
  | { kind: 'metadata'; metadata: CoreMetadata }
  | { kind: 'currentUser'; member: CoreMember }
export type CoreCacheResponse =
  | { ok: true; value: CoreCacheValue }
  | { ok: false; error: { messageKey: string; statusCode: number } }
export interface ICoreCacheTransport extends ICoreRuntimeAPI {
  queryCore(input: CoreCacheQuery): Promise<CoreCacheResponse>
}
