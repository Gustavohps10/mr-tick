import type { MetadataDTO } from '../../dtos/MetadataDTO'

/** Source IDs never contain RxDB composite keys. */
export interface CoreConnectionScope {
  workspaceId: string
  connectionInstanceId: string
}
export interface CoreTaskReference extends CoreConnectionScope {
  taskId: string
}
export interface CoreWorkspace {
  id: string
  name: string
  status: 'draft' | 'configured'
}
export interface CoreConnection extends CoreConnectionScope {
  dataSourceId: string
  status: 'connected' | 'disabled' | 'disconnected'
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
