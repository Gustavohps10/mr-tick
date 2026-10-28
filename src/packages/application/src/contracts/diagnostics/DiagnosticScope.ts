export type DiagnosticScope =
  | { type: 'application' }
  | { type: 'workspace'; workspaceId: string }
  | { type: 'connection'; workspaceId: string; connectionInstanceId: string }
