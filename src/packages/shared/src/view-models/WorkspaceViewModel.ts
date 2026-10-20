export type WorkspaceStatus = 'draft' | 'configured'

export interface WorkspaceConnectionMemberViewModel {
  id: string
  name: string
  login: string
  avatarUrl?: string
}

export interface WorkspaceConnectionViewModel {
  id: string
  addonId: string
  connectionProfileId: string
  cardinality: 'single' | 'multi'
  status: 'connected' | 'disabled' | 'disconnected' | 'archived'
  member?: WorkspaceConnectionMemberViewModel
  config?: Record<string, unknown>
}

export interface WorkspaceViewModel {
  id: string
  name: string
  status: WorkspaceStatus
  description?: string
  avatarUrl?: string
  connections: WorkspaceConnectionViewModel[]
  createdAt: Date
  updatedAt: Date
}
