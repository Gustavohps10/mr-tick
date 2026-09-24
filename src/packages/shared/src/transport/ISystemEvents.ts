export interface TimerEventPayload {
  workspaceId?: string
  taskId?: string
  taskName?: string
  comments?: string
}

export interface TimerStartPayload extends TimerEventPayload {
  mode: 'countup' | 'countdown'
  baseSeconds: number
}

export interface TimerPausePayload extends TimerEventPayload {
  currentSeconds: number
}

export interface SystemIdlePayload {
  idleMinutes: number
}

export interface ISystemEvents {
  'timer:start': TimerStartPayload
  'timer:pause': TimerPausePayload
  'timer:resume': TimerEventPayload & { currentSeconds: number }
  'timer:stop': TimerPausePayload
  'timer:update': TimerEventPayload
  'system:idle': SystemIdlePayload
  'system:active': { idleMinutes: number }
  'timeEntry:created': {
    workspaceId?: string
    id: string
    timeSpentSeconds: number
  }
  'timeEntry:updated': {
    workspaceId?: string
    id: string
    timeSpentSeconds: number
  }
  'workspace:changed': {
    previousWorkspaceId?: string
    currentWorkspaceId: string
  }
  'timeEntry:deleted': { workspaceId?: string; id: string }
}
