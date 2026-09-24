export interface TimeEntryDTO {
  id?: string
  task: {
    id: string
  }
  activity: {
    id: string
    name?: string
  }
  user: {
    id: string
    name?: string
  }
  startDate?: Date
  endDate?: Date
  timeSpent: number
  comments?: string
  createdAt: Date
  updatedAt: Date
  source?: 'manual' | 'timer' | 'ai_suggestion' | 'addon'
  addonSource?: { id: string; name: string; imageUrl?: string }
}
