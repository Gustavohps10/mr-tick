import type { ICoreConnectionsAPI } from './ICoreConnectionsAPI'
import type { ICoreMetadataAPI } from './ICoreMetadataAPI'
import type { ICoreRuntimeAPI } from './ICoreRuntimeAPI'
import type { ICoreTasksAPI } from './ICoreTasksAPI'
import type { ICoreWorkspacesAPI } from './ICoreWorkspacesAPI'

/** Read-only context supplied by the host's local cache adapter. */
export interface ICoreReadAPI {
  readonly runtime: ICoreRuntimeAPI
  readonly workspaces: ICoreWorkspacesAPI
  readonly connections: ICoreConnectionsAPI
  readonly tasks: ICoreTasksAPI
  readonly metadata: ICoreMetadataAPI
}
