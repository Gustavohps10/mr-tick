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

export interface ConnectionEventPayload {
  workspaceId: string
  connectionInstanceId: string
}

export interface AddonSettingsSavedEventPayload {
  addonId: string
  scope:
    | { kind: 'addon' }
    | { kind: 'workspace'; workspaceId: string }
    | {
        kind: 'connection'
        workspaceId: string
        connectionInstanceId: string
      }
    | {
        kind: 'capability'
        workspaceId: string
        connectionInstanceId: string
        capabilityId: string
      }
  revision: number
  values: Record<string, string | number | boolean | null>
}

export interface AnalyticsLoadProgressEvent {
  workspaceId: string
  connectionInstanceId: string
  selectionKey: string
  datasetId: string
  mode: 'full' | 'changes' | 'window_rescan'
  phase: 'extracting' | 'publishing' | 'completed' | 'failed'
  batchIndex: number
  fetchedRows: number
  totalRows?: number
  coverage?: 'complete' | 'unverified'
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
  'connection:disconnected': ConnectionEventPayload
  'connection:archived': ConnectionEventPayload
  'connection:removed': ConnectionEventPayload
  'addon:settings:saved': AddonSettingsSavedEventPayload
  'analytics:load-progress': AnalyticsLoadProgressEvent
}

export interface ISystemEventEmitter {
  emit<K extends keyof ISystemEvents>(event: K, payload: ISystemEvents[K]): void
}

export class NoOpSystemEventEmitter implements ISystemEventEmitter {
  public emit<K extends keyof ISystemEvents>(
    event: K,
    payload: ISystemEvents[K],
  ): void {
    void event
    void payload
  }
}
