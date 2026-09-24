export interface StartTimerDTO {
  taskId?: string
  activityId?: string
  comments?: string
  baseSeconds?: number
  initialSeconds?: number
  elapsedSeconds?: number
  mode?: 'countup' | 'countdown'
}

export interface TimerResumeDTO {
  baseSeconds?: number
  initialSeconds?: number
  elapsedSeconds?: number
}

export interface TimerStateDTO {
  status: 'running' | 'paused' | 'idle'
  currentSeconds: number
  baseSeconds: number
  elapsedSeconds: number
  mode: 'countup' | 'countdown'
  taskId?: string
  activityId?: string
  comments?: string
}

export interface DirectLogTimeDTO {
  taskId: string
  timeSpentSeconds: number
  comments?: string
  activityId?: string
  date?: string | Date
}
