export interface TimeEntryRecordDTO {
  id: string
  taskId?: string
  comments?: string
  activityId?: string
  dataSourceId?: string
  connectionInstanceId?: string
  startDate?: string
  endDate?: string
  timeSpentSeconds: number
  pauseSeconds: number
  status?: 'running' | 'paused' | 'finished' | 'suggestion'
  source?: 'manual' | 'timer' | 'ai_suggestion' | 'addon'
  addonSource?: {
    id: string
    name: string
    imageUrl?: string
  }
  createdAt: string
  updatedAt?: string
}
