import type { MetadataDTO, TaskDTO } from '../../dtos'
import type {
  CoreConnectionScope,
  CoreMember,
  CoreMetadata,
  CoreTask,
  CoreTaskListRequest,
  CoreTaskPage,
  CoreTaskReference,
  TaskReferenceLookupRequest,
} from './CoreContext'
import type { ICoreRuntimeAPI } from './ICoreRuntimeAPI'

/** Internal transport port; adapters serialize Either at their boundary. */
export type CoreCacheQuery =
  | ({ action: 'taskReferences' } & TaskReferenceLookupRequest)
  | ({ action: 'cacheTasks'; tasks: TaskDTO[] } & CoreConnectionScope)
  | { action: 'localMetadata'; workspaceId: string; connectionInstanceId: '' }
  | {
      action: 'saveLocalMetadata'
      workspaceId: string
      connectionInstanceId: ''
      values: MetadataDTO
      revision: string
    }
  | ({ action: 'tasks' } & CoreTaskListRequest)
  | ({ action: 'task' } & CoreTaskReference)
  | ({ action: 'metadata' } & CoreConnectionScope)
  | ({ action: 'currentUser' } & CoreConnectionScope)
export type CoreCacheValue =
  | { kind: 'taskReferences'; references: CoreTaskReference[] }
  | { kind: 'cachedTasks' }
  | { kind: 'localMetadata'; values: MetadataDTO; revision: string }
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
