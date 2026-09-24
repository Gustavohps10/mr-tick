export interface UpdateTimeEntryDTO {
  taskId?: string
  comments?: string
  activityId?: string
  timeSpentSeconds?: number
  timeSpent?: number
  pauseSeconds?: number
  startDate?: string | Date
  endDate?: string | Date
  status?: 'finished' | 'suggestion'
}
