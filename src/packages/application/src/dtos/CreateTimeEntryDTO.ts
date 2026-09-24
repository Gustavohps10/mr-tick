export interface CreateTimeEntryDTO {
  taskId: string
  timeSpentSeconds: number
  comments?: string
  activityId?: string
  dataSourceId?: string
  connectionInstanceId?: string
  startDate?: string
  endDate?: string
  pauseSeconds?: number
  status?: 'finished' | 'suggestion'
  source?: 'manual' | 'timer' | 'ai_suggestion' | 'addon'
  addonSource?: {
    id: string
    name: string
    imageUrl?: string
  }
}
